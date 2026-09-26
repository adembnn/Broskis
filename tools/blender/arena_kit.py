"""Kit d'arène façon Smash (lot LKIT) : pièces procédurales, couleurs par sommet, occlusion ambiante cuite.

Usage (rejouable, sans fenêtre) :
  "C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe" -b --factory-startup \
      -P tools/blender/arena_kit.py -- --out <dossier GLB bruts> [--only nom1,nom2]
puis `node tools/assets/optimise.mjs <dossier bruts> public/assets/arena-kit` (meshopt + quantification).

Conventions :
- Unités en mètres. Blender est Z-haut ; l'export glTF convertit en Y-haut (three.js).
- Ancre (origine) de chaque pièce : centre du dessus marchable, à y = 0 (sauf fonds et nuages : centre).
- Une seule matière partagée « arena_kit » : blanc, rugosité 0,85, métal 0 ; toute la couleur est dans
  COLOR_0 (couleurs par sommet, linéaires) avec l'occlusion ambiante déjà multipliée dedans.
- Le dessous d'une pièce ne dépasse JAMAIS le contour de son dessus : un perso qui tombe ne s'y accroche pas.
- Couleurs : ancrées sur src/art/tokens.js (maps.*.palette) puis poussées vers un rendu « stylisé premium ».
"""
import bpy
import bmesh  # noqa: F401  (gardé pour les évolutions)
import json
import math
import os
import random
import sys
from mathutils import Vector, noise
from mathutils.bvhtree import BVHTree

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV and ARGV.index(name) + 1 < len(ARGV) else default


HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(arg('--out', os.path.join(HERE, '.out')))
ONLY = {s for s in (arg('--only', '') or '').split(',') if s}
os.makedirs(OUT, exist_ok=True)

# --------------------------------------------------------------------------------------------------
# Couleurs (sRGB hex -> linéaire). Ancrages tokens : archipel.sol #7F8A5E, archipel.matiere #6A5A50,
# archipel.accent #B39561, galion.sol #A58C6C, galion.matiere #5A4535, cuisine.sol #B39570, cuisine.matiere #8A918F.
# --------------------------------------------------------------------------------------------------


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hx(h):
    h = h.lstrip('#')
    return Vector([_lin(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4)])


PAL = {
    # herbe et pierre (archipel)
    'grass': hx('#6F8A3C'), 'grass_l': hx('#93AC4C'), 'grass_d': hx('#4E6A2E'), 'grass_y': hx('#A9A653'),
    'leaf': hx('#55743A'), 'leaf_l': hx('#7F9C45'), 'bark': hx('#5B4436'),
    'stone': hx('#CDBFA2'), 'stone_l': hx('#E9DFC6'), 'stone_d': hx('#A89A80'), 'moss': hx('#9BA273'),
    'earth': hx('#6E5442'), 'earth_d': hx('#584235'),
    'rock_a': hx('#8C7B70'), 'rock_b': hx('#66564E'), 'rock_deep': hx('#41384A'), 'ledge': hx('#463B3E'),
    # bois (galion) : planches délavées, bord blanchi par le sel, coque sombre
    'plank': hx('#A58C6C'), 'plank_l': hx('#BFA682'), 'plank_d': hx('#8A7155'), 'gap': hx('#3E2E24'),
    'beam': hx('#D2BE98'), 'beam_d': hx('#B09A76'), 'hull': hx('#5A4535'), 'hull_d': hx('#3F3029'),
    'iron': hx('#3B3A3C'),
    # cuisine : carreaux crème, joints, chant de hêtre clair, caisson
    'tile': hx('#E6DED0'), 'tile_b': hx('#9DB3B0'), 'grout': hx('#8E8578'),
    'beech': hx('#C9A77C'), 'beech_l': hx('#DEC29A'), 'beech_d': hx('#A5825B'), 'cabinet': hx('#8A918F'),
    'cabinet_d': hx('#646A6A'),
    # fonds et nuages
    'cloud': hx('#FFF4E6'), 'cloud_d': hx('#C9B4BE'),
}


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return a.lerp(b, t)


def smooth01(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


# --------------------------------------------------------------------------------------------------
# Construction de maillage : sommets + faces (zone, ton, lissé)
# --------------------------------------------------------------------------------------------------


class MB:
    def __init__(self):
        self.verts = []
        self.faces = []  # (indices, zone, ton, lisse)

    def v(self, p):
        self.verts.append(Vector(p))
        return len(self.verts) - 1

    def f(self, idx, zone, tone=0.0, smooth=False):
        self.faces.append((tuple(idx), zone, tone, smooth))

    def ring(self, pts):
        return [self.v(p) for p in pts]

    def bridge(self, a, b, zone, tone=0.0, smooth=False, closed=True, up=False):
        """Relie deux anneaux (même nombre de points, sens trigo vu du dessus). a = anneau précédent du profil.
        Par défaut le profil va vers l'extérieur ou vers le bas ; up=True quand il monte (colonnes, feuillages)."""
        n = len(a)
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            if up:
                self.f((a[i], a[j], b[j], b[i]), zone, tone, smooth)
            else:
                self.f((a[i], b[i], b[j], a[j]), zone, tone, smooth)

    def fan(self, center, ring_idx, zone, tone=0.0, down=False, smooth=False):
        n = len(ring_idx)
        for i in range(n):
            j = (i + 1) % n
            if down:
                self.f((ring_idx[i], center, ring_idx[j]), zone, tone, smooth)
            else:
                self.f((center, ring_idx[i], ring_idx[j]), zone, tone, smooth)

    def box(self, corners2d, z_bot, z_top, chamfer, zones, tone=0.0, bottom=False):
        """Prisme à 4 coins (sens trigo vu du dessus) avec chanfrein sur les 4 arêtes du dessus."""
        c = chamfer
        n = len(corners2d)
        cen = sum(corners2d, Vector((0.0, 0.0))) / n
        top_in = []
        for i in range(n):
            p = corners2d[i]
            pa, pb = corners2d[i - 1], corners2d[(i + 1) % n]
            e1 = (p - pa).normalized()  # arête qui arrive au coin
            e2 = (pb - p).normalized()  # arête qui en repart
            q = p + e2 * c - e1 * c     # coin du dessus : rentré de c le long des deux arêtes
            if (q - cen).length > (p - cen).length:  # sécurité sur formes concaves
                q = p + (cen - p).normalized() * c * 1.4
            top_in.append(q)
        zs = z_top - c if c > 0 else z_top
        side = [self.v((p.x, p.y, zs)) for p in corners2d]
        bot = [self.v((p.x, p.y, z_bot)) for p in corners2d]
        top = [self.v((p.x, p.y, z_top)) for p in top_in] if c > 0 else side
        self.f(top, zones[0], tone)
        for i in range(n):
            j = (i + 1) % n
            if c > 0:
                self.f((side[i], side[j], top[j], top[i]), zones[1], tone)
            self.f((bot[i], bot[j], side[j], side[i]), zones[2], tone)
        if bottom:
            self.f(tuple(reversed(bot)), zones[2], tone)
        return top, side, bot


# --------------------------------------------------------------------------------------------------
# Contours
# --------------------------------------------------------------------------------------------------


class Outline:
    """Contour fermé en sens trigo (vu du dessus), échantillonné à abscisse curviligne constante."""

    def __init__(self, fn, dense=1440):
        self.p = [fn(2 * math.pi * i / dense) for i in range(dense)]
        self.L = [0.0]
        for i in range(1, dense + 1):
            self.L.append(self.L[-1] + (self.p[i % dense] - self.p[i - 1]).length)
        self.total = self.L[-1]
        self.dense = dense

    def at(self, u):
        u = u % self.total
        lo, hi = 0, self.dense
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if self.L[mid] <= u:
                lo = mid
            else:
                hi = mid
        a, b = self.p[lo], self.p[(lo + 1) % self.dense]
        seg = self.L[lo + 1] - self.L[lo]
        t = (u - self.L[lo]) / seg if seg > 0 else 0
        pos = a.lerp(b, t)
        prv = self.p[(lo - 2) % self.dense]
        nxt = self.p[(lo + 3) % self.dense]
        tan = (nxt - prv).normalized()
        return pos, Vector((tan.y, -tan.x))

    def sample(self, segs, phase=0.0):
        pts, nrm = [], []
        for k in range(segs):
            p, n = self.at(self.total * (k + phase) / segs)
            pts.append(p)
            nrm.append(n)
        return pts, nrm


def superellipse(a, b, n):
    def fn(t):
        c, s = math.cos(t), math.sin(t)
        return Vector((a * math.copysign(abs(c) ** (2 / n), c), b * math.copysign(abs(s) ** (2 / n), s)))
    return fn


def rounded_rect(a, b, r):
    """Rectangle 2a x 2b aux coins arrondis de rayon r (paramétré par l'angle polaire)."""
    def fn(t):
        d = Vector((math.cos(t), math.sin(t)))
        # intersection rayon / rectangle arrondi par dichotomie
        lo, hi = 0.0, max(a, b) * 2
        for _ in range(40):
            m = (lo + hi) / 2
            p = d * m
            qx, qy = abs(p.x) - (a - r), abs(p.y) - (b - r)
            dist = math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r
            if dist > 0:
                hi = m
            else:
                lo = m
        return d * lo
    return fn


def ring_pts(P, N, s, d, z, jr=0.0, jz=0.0, seed=0.0, freq=0.45, zfield=None):
    """Anneau du profil : point du contour mis à l'échelle s, rentré de d le long de la normale.
    jr : rentrée aléatoire (jamais vers l'extérieur), jz : décalage vertical (champ partagé zfield)."""
    out = []
    for p, nrm in zip(P, N):
        q = p * s - nrm * d
        zz = z
        if jr:
            k = noise.noise(Vector((q.x * freq, q.y * freq, seed)))
            q = q - nrm * ((k * 0.5 + 0.5) * jr)
        if jz:
            zz += noise.noise(Vector((p.x * 0.28, p.y * 0.28, zfield if zfield is not None else seed))) * jz
        out.append(Vector((q.x, q.y, zz)))
    return out


# --------------------------------------------------------------------------------------------------
# Occlusion ambiante cuite (lancer de rayons sur BVH, hémisphère pondérée en cosinus)
# --------------------------------------------------------------------------------------------------


def hemi_dirs(n):
    golden = math.pi * (3 - math.sqrt(5))
    out = []
    for k in range(n):
        u = (k + 0.5) / n
        r = math.sqrt(u)
        phi = k * golden
        out.append(Vector((r * math.cos(phi), r * math.sin(phi), math.sqrt(max(0.0, 1 - u)))))
    return out


def bake_ao(verts, vnormals, faces, rays=28, dist=1.4, strength=0.8, ground=None):
    polys = [list(f[0]) for f in faces]
    vs = list(verts)
    if ground is not None:  # sol virtuel (pour les accessoires posés)
        g, zg = ground, 0.0
        base = len(vs)
        vs += [Vector((-g, -g, zg)), Vector((g, -g, zg)), Vector((g, g, zg)), Vector((-g, g, zg))]
        polys.append([base, base + 1, base + 2, base + 3])
    bvh = BVHTree.FromPolygons(vs, polys, all_triangles=False)
    dirs = hemi_dirs(rays)
    ao = []
    for p, n in zip(verts, vnormals):
        if n.length < 1e-6:
            ao.append(1.0)
            continue
        n = n.normalized()
        t = Vector((1, 0, 0)) if abs(n.x) < 0.9 else Vector((0, 1, 0))
        b1 = n.cross(t).normalized()
        b2 = n.cross(b1)
        o = p + n * 0.012
        occ = 0.0
        for d in dirs:
            w = b1 * d.x + b2 * d.y + n * d.z
            hit = bvh.ray_cast(o, w, dist)
            if hit[0] is not None:
                occ += 1.0 - (hit[3] / dist) ** 0.5 * 0.5
        ao.append(1.0 - strength * occ / rays)
    return ao


# --------------------------------------------------------------------------------------------------
# Matière unique et export
# --------------------------------------------------------------------------------------------------


def kit_material():
    m = bpy.data.materials.get('arena_kit')
    if m:
        return m
    m = bpy.data.materials.new('arena_kit')
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Color'
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
    bsdf.inputs['Metallic'].default_value = 0.0
    return m


def make_object(name, mb, colorfn, ao_kw=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in mb.verts], [], [list(f[0]) for f in mb.faces])
    me.update()
    for poly, f in zip(me.polygons, mb.faces):
        poly.use_smooth = f[3]
    vn = [v.normal.copy() for v in me.vertices]
    ao = bake_ao(mb.verts, vn, mb.faces, **(ao_kw or {}))
    attr = me.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
    cols = [0.0] * (len(me.loops) * 4)
    for poly, f in zip(me.polygons, mb.faces):
        fn_ = poly.normal.copy()
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            c = colorfn(f[1], f[2], mb.verts[vi], fn_) * ao[vi]
            cols[li * 4:li * 4 + 4] = (c.x, c.y, c.z, 1.0)
    attr.data.foreach_set('color', cols)
    try:
        me.color_attributes.active_color = attr
        me.color_attributes.render_color_index = 0
    except Exception:
        pass
    me.materials.append(kit_material())
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def export(ob, path):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
        export_normals=True, export_materials='EXPORT', export_vertex_color='ACTIVE',
        export_all_vertex_colors=False, export_extras=False, export_tangents=False,
    )


def bbox(mb):
    xs = [v.x for v in mb.verts]
    ys = [v.y for v in mb.verts]
    zs = [v.z for v in mb.verts]
    # Blender (x, y, z) -> three (x, z, -y) : taille [X, Y, Z] en repère three
    return {
        'min': [round(min(xs), 3), round(min(zs), 3), round(-max(ys), 3)],
        'max': [round(max(xs), 3), round(max(zs), 3), round(-min(ys), 3)],
        'taille': [round(max(xs) - min(xs), 3), round(max(zs) - min(zs), 3), round(max(ys) - min(ys), 3)],
    }


# --------------------------------------------------------------------------------------------------
# Îles flottantes (plateau principal, plateformes, îles lointaines, rochers)
# --------------------------------------------------------------------------------------------------


def rock_color(tone, p, n, depth):
    """Roche en strates : deux tons alternés, assombrie et refroidie vers la pointe."""
    k = int(tone)
    base = PAL['rock_a'] if k % 2 == 0 else PAL['rock_b']
    grain = noise.noise(Vector((p.x * 0.9, p.y * 0.9, p.z * 0.9 + 7.0)))
    base = base * (1.0 + 0.07 * grain)
    t = smooth01(-p.z / max(depth, 0.1))
    c = mix(base, PAL['rock_deep'], t * 0.85)
    # faces tournées vers le haut (petits replats) : un peu plus claires, comme de la poussière
    if n.z > 0.35:
        c = mix(c, PAL['stone_d'], 0.25)
    return c


def island_colorfn(a, b, depth, top='grass'):
    rad = max(a, b)

    def fn(zone, tone, p, n):
        if zone == 'grass':
            r = math.hypot(p.x / a, p.y / b)
            k = noise.noise(Vector((p.x * 0.14, p.y * 0.14, 3.1)))   # grandes taches
            k2 = noise.noise(Vector((p.x * 0.5, p.y * 0.5, 9.7)))    # petites taches
            c = mix(PAL['grass'], PAL['grass_l'], 0.4 + 0.55 * k + 0.2 * k2)
            c = mix(c, PAL['grass_y'], smooth01(k2 * 1.8 - 0.3) * 0.4)  # touches d'herbe sèche
            c = mix(c, PAL['grass_l'], smooth01(1.0 - r * 1.25) * 0.3)  # cœur du plateau plus clair : lisibilité
            c = mix(c, PAL['grass_d'], smooth01((r - 0.8) / 0.22) * 0.5)  # herbe foulée près des pierres
            return c
        if zone == 'leaf':
            return mix(PAL['leaf'], PAL['leaf_l'], 0.35 + 0.5 * n.z) * (1.0 + 0.08 * noise.noise(p * 1.3))
        if zone == 'bark':
            return PAL['bark']
        if zone in ('stone_top', 'stone_chamfer', 'stone_side'):
            moss = tone > 0.82
            t = tone if not moss else 0.1
            c = mix(PAL['stone'], PAL['stone_l'] if t > 0 else PAL['stone_d'], abs(t) * 0.55)
            if moss:
                c = mix(c, PAL['moss'], 0.55)
            if zone == 'stone_chamfer':
                c = mix(c, PAL['stone_l'], 0.45)  # le liseré : l'arête qui accroche la lumière
            elif zone == 'stone_side':
                c = mix(c, PAL['stone_d'], 0.35 + 0.35 * smooth01(-p.z / 0.3))
            return c
        if zone == 'earth':
            return mix(PAL['earth'], PAL['earth_d'], smooth01(-p.z / 0.45))
        if zone == 'hidden':
            return PAL['earth_d']
        if zone == 'ledge':
            return mix(PAL['ledge'], PAL['rock_deep'], smooth01(-p.z / depth))
        return rock_color(tone, p, n, depth)
    return fn


def floating_island(name, outline, segs, depth, strata, rim=None, top_rings=(0.4, 0.75), tip=(0.0, 0.0),
                    seed=1.0, jr=0.35, jz=0.18, earth=0.34, overhang=0.05):
    """Île flottante : dessus plat (herbe), liseré de pierres chanfreinées, dessous en strates effilées.
    strata : liste de (s, d, z) pour le bas de chaque strate (z négatif), la dernière est l'anneau avant la pointe."""
    mb = MB()
    P, N = outline.sample(segs)
    W = rim['width'] if rim else 0.0
    # --- dessus (herbe)
    c = mb.v((0, 0, 0))
    rings = [mb.ring(ring_pts(P, N, s, 0, 0)) for s in top_rings]
    mb.fan(c, rings[0], 'grass')
    for r0, r1 in zip(rings, rings[1:]):
        mb.bridge(r0, r1, 'grass')
    prev = rings[-1]
    if rim:
        r_in = mb.ring(ring_pts(P, N, 1.0, W + 0.28, 0))
        mb.bridge(prev, r_in, 'grass')
        r_under = mb.ring(ring_pts(P, N, 1.0, W - 0.1, 0))
        mb.bridge(r_in, r_under, 'grass')
        edge = mb.ring(ring_pts(P, N, 1.0, 0.02, -0.03))
        mb.bridge(r_under, edge, 'hidden')
        prev = edge
    else:
        edge = mb.ring(ring_pts(P, N, 1.0, 0.0, 0))
        mb.bridge(prev, edge, 'grass')
        prev = edge
    # --- flanc de terre puis chanfrein vers la roche
    r = mb.ring(ring_pts(P, N, 1.0, 0.0, -earth))
    mb.bridge(prev, r, 'earth')
    prev = r
    r = mb.ring(ring_pts(P, N, 1.0, 0.14, -earth - 0.1))
    mb.bridge(prev, r, 'earth')
    prev = r
    # --- strates
    for k, (s, d, z) in enumerate(strata):
        last = k == len(strata) - 1
        zf = seed * 10 + k * 1.7
        bottom = mb.ring(ring_pts(P, N, s, d, z, jr=jr, jz=jz, seed=seed + k, zfield=zf))
        mb.bridge(prev, bottom, 'rock', tone=k)
        prev = bottom
        if not last:
            s2, d2 = strata[k + 1][0], strata[k + 1][1]
            ledge_s = s - (s - s2) * 0.25
            ledge_d = d + (d2 - d) * 0.35 + 0.18
            ledge = mb.ring(ring_pts(P, N, ledge_s, ledge_d, z - 0.1, jr=jr, jz=jz, seed=seed + k + 0.5, zfield=zf))
            mb.bridge(prev, ledge, 'ledge', tone=k)
            prev = ledge
    t = mb.v((tip[0], tip[1], -depth))
    mb.fan(t, prev, 'rock', tone=len(strata), down=True)
    # --- liseré de pierres
    if rim:
        rng = random.Random(int(seed * 1000))
        n_st = max(6, round(outline.total / rim['len']))
        L = outline.total / n_st
        g = rim.get('gap', 0.035)
        for k in range(n_st):
            u0, u1 = k * L + g / 2, (k + 1) * L - g / 2
            p0, n0 = outline.at(u0)
            p1, n1 = outline.at(u1)
            ztop = rim['top'] + rng.uniform(-0.012, 0.018)
            corners = [p0 - n0 * W, p0 + n0 * overhang, p1 + n1 * overhang, p1 - n1 * W]
            tone = rng.uniform(-0.8, 0.8) if rng.random() > 0.1 else 0.9  # 1 pierre sur 10 moussue
            mb.box(corners, rim['bot'], ztop, rim.get('chamfer', 0.06), ('stone_top', 'stone_chamfer', 'stone_side'), tone)
    return mb


STONE_ZONES = ('stone_top', 'stone_chamfer', 'stone_side')


def hanger(mb, x, y, z0, r, length, seed, tone=3, segs=7):
    """Stalactite secondaire sous une île : l'anneau du haut est noyé dans la roche."""
    top, mid = [], []
    for i in range(segs):
        t = 2 * math.pi * i / segs + seed
        rr = r * (0.8 + 0.4 * (noise.noise(Vector((x + i * 0.7, y, seed))) * 0.5 + 0.5))
        top.append(mb.v((x + math.cos(t) * rr, y + math.sin(t) * rr, z0)))
        mid.append(mb.v((x + math.cos(t + 0.35) * rr * 0.55, y + math.sin(t + 0.35) * rr * 0.55, z0 - length * 0.48)))
    tip = mb.v((x + r * 0.15, y - r * 0.1, z0 - length))
    mb.bridge(top, mid, 'rock', tone)
    mb.fan(tip, mid, 'rock', tone, down=True)


def column(mb, x, y, r, h, cut=0.0, tone=0.0, segs=8):
    """Colonne de ruine : socle carré, fût octogonal, chapiteau (ou cassure en biais si cut > 0)."""
    s = r * 1.4
    mb.box([Vector((x - s, y - s)), Vector((x + s, y - s)), Vector((x + s, y + s)), Vector((x - s, y + s))],
           -0.15, 0.22, 0.04, STONE_ZONES, tone)
    base, top = [], []
    for i in range(segs):
        cx, cy = math.cos(2 * math.pi * i / segs + 0.39) * r, math.sin(2 * math.pi * i / segs + 0.39) * r
        base.append(mb.v((x + cx, y + cy, 0.2)))
        top.append(mb.v((x + cx, y + cy, h + cut * cx / r)))
    mb.bridge(base, top, 'stone_side', tone, up=True)
    if cut:
        mb.f(top, 'stone_top', tone)
    else:
        mb.f(top, 'stone_top', tone)
        c = r * 1.45
        mb.box([Vector((x - c, y - c)), Vector((x + c, y - c)), Vector((x + c, y + c)), Vector((x - c, y + c))],
               h - 0.02, h + 0.3, 0.05, STONE_ZONES, tone + 0.2)


def tree(mb, x, y, h, r, seed=0.0):
    """Arbre stylisé : tronc hexagonal, houppier en boule facettée (deux étages décalés)."""
    b0 = [mb.v((x + math.cos(2 * math.pi * i / 6) * r * 0.16, y + math.sin(2 * math.pi * i / 6) * r * 0.16, -0.1)) for i in range(6)]
    b1 = [mb.v((x + math.cos(2 * math.pi * i / 6) * r * 0.1, y + math.sin(2 * math.pi * i / 6) * r * 0.1, h * 0.55)) for i in range(6)]
    mb.bridge(b0, b1, 'bark', up=True)
    for k, (cz, cr, off) in enumerate(((h * 0.62, r, 0.0), (h * 0.9, r * 0.72, 0.25))):
        segs = 8
        lats = (-0.75, -0.3, 0.2, 0.62)
        rings = []
        for la in lats:
            ang = la * math.pi / 2
            rr = cr * math.cos(ang)
            zz = cz + cr * 0.85 * math.sin(ang)
            ring = []
            for i in range(segs):
                t = 2 * math.pi * i / segs + off + seed
                j = 1.0 + 0.12 * noise.noise(Vector((x + i, y + la * 3, seed + k)))
                ring.append(mb.v((x + math.cos(t) * rr * j + off * r * 0.4, y + math.sin(t) * rr * j, zz)))
            rings.append(ring)
        bot = mb.v((x + off * r * 0.4, y, cz - cr * 0.85))
        topv = mb.v((x + off * r * 0.4, y, cz + cr * 0.85))
        mb.fan(bot, rings[0], 'leaf', down=True)
        for r0, r1 in zip(rings, rings[1:]):
            mb.bridge(r0, r1, 'leaf', up=True)
        mb.fan(topv, rings[-1], 'leaf')


def build_plateau_pierre():
    a, b = 9.5, 7.5
    ol = Outline(superellipse(a, b, 2.6))
    depth = 6.6
    strata = [(1.0, 0.22, -1.25), (0.9, 0.62, -2.3), (0.74, 0.9, -3.3), (0.55, 1.0, -4.3), (0.34, 0.8, -5.35)]
    mb = floating_island('plateau_pierre', ol, 52, depth, strata,
                         rim={'width': 0.75, 'len': 1.3, 'top': 0.05, 'bot': -0.3, 'chamfer': 0.07},
                         top_rings=(0.2, 0.4, 0.6, 0.78), tip=(0.4, -0.6), seed=1.3, earth=0.28)
    hanger(mb, 0.52 * a, 0.15 * b, -2.9, 1.1, 2.5, 0.4)
    hanger(mb, -0.5 * a, -0.2 * b, -2.9, 1.2, 3.0, 1.9)
    hanger(mb, 0.1 * a, 0.45 * b, -2.6, 0.9, 2.1, 3.1)
    meta = {'role': 'plateau', 'variante': 'herbe et pierre', 'map': 'archipel',
            'surface': {'forme': 'superellipse', 'demiX': a, 'demiZ': b, 'exposant': 2.6, 'y': 0.0,
                        'liseré': 0.75},
            'collider': {'type': 'cylindre ou convexe du contour', 'conseil': 'box hx 9.2 hy 0.25 hz 7.2 centrée y=-0.25, ou trimesh du dessus'},
            'usage': "Plateau principal flottant façon Battlefield : dessus d'herbe net, liseré de pierres claires = bord du vide."}
    return mb, island_colorfn(a, b, depth), {'rays': 28, 'dist': 1.4}, meta


def build_plateforme(size):
    dims = {'S': (1.6, 1.0), 'M': (2.3, 1.2), 'L': (3.1, 1.4)}[size]
    a, b = dims
    ol = Outline(rounded_rect(a, b, 0.8))  # rayon > rentrée max (0,68 m) : pas de boucle dans les coins
    depth = {'S': 0.95, 'M': 1.05, 'L': 1.15}[size]
    strata = [(1.0, 0.16, -0.62), (0.62, 0.3, -0.86)]
    mb = floating_island('plateforme_' + size, ol, 32 if size != 'S' else 28, depth, strata,
                         rim={'width': 0.4, 'len': 0.8, 'top': 0.04, 'bot': -0.22, 'chamfer': 0.05},
                         top_rings=(0.25,), tip=(0.1, 0.0), seed={'S': 2.1, 'M': 3.4, 'L': 4.7}[size],
                         jr=0.1, jz=0.05, earth=0.26, overhang=0.04)
    meta = {'role': 'plateforme', 'variante': 'herbe et pierre', 'map': 'archipel',
            'surface': {'forme': 'rectangle arrondi', 'demiX': a, 'demiZ': b, 'y': 0.0},
            'collider': {'type': 'box traversable par le dessous (one-way)', 'conseil': f'box hx {a - 0.05:.2f} hy 0.15 hz {b - 0.05:.2f} centrée y=-0.15'},
            'usage': 'Plateforme flottante fine (2,2 à 2,8 m au-dessus du plateau), traversable en sautant.'}
    return mb, island_colorfn(a, b, depth), {'rays': 24, 'dist': 0.8}, meta


def build_bord_pierre():
    """Bord modulaire droit de 2 m (2 pierres) à poser le long d'un bord existant. Ancre : milieu de l'arête
    extérieure du dessus ; +X le long du bord ; le vide est côté -Z three (+Y Blender)."""
    mb = MB()
    rng = random.Random(77)
    W, L, g = 0.75, 1.0, 0.035
    for k in range(2):
        x0, x1 = -1.0 + k * L + g / 2, -1.0 + (k + 1) * L - g / 2
        corners = [Vector((x0, -W)), Vector((x1, -W)), Vector((x1, 0.05)), Vector((x0, 0.05))]
        mb.box(corners, -0.3, 0.05 + rng.uniform(-0.01, 0.015), 0.07, ('stone_top', 'stone_chamfer', 'stone_side'),
               rng.uniform(-1, 1))
    meta = {'role': 'bord', 'variante': 'pierre', 'map': 'toutes',
            'surface': {'forme': 'segment droit', 'longueur': 2.0, 'largeur': 0.75, 'y': 0.05},
            'ancre': "milieu de l'arête extérieure, dessus à y=0 ; le vide est côté -Z",
            'collider': {'type': 'aucun (visuel)', 'conseil': 'garder le collider du sol existant'},
            'usage': 'Liseré clair à poser le long de n importe quel bord (tuiles hex, pont) pour montrer où commence le vide.'}
    return mb, island_colorfn(1, 1, 1), {'rays': 20, 'dist': 0.5, 'ground': 3.0}, meta


def build_ile_lointaine(variant):
    """Silhouette d'île lointaine (fond) : même langage que le plateau, peu de faces, ruine au sommet."""
    a, b = (3.2, 2.4) if variant == 'A' else (2.2, 1.8)
    ol = Outline(superellipse(a, b, 2.3))
    depth = 4.2 if variant == 'A' else 3.2
    strata = [(0.95, 0.25, -1.0), (0.7, 0.5, -2.0), (0.4, 0.4, -3.0)]
    mb = floating_island('ile_lointaine_' + variant, ol, 18, depth, strata, rim=None, top_rings=(0.6,),
                         tip=(0.2, -0.1), seed=5.5 if variant == 'A' else 6.6, jr=0.35, jz=0.15, earth=0.3)
    # ruine : colonne entière + colonne brisée + arbre (A) ; arbre et tronçon de colonne (B)
    if variant == 'A':
        column(mb, -1.1, 0.3, 0.26, 2.3, tone=0.3)
        column(mb, 0.7, 0.5, 0.26, 1.2, cut=0.35, tone=-0.3)
        tree(mb, 1.5, -0.9, 2.4, 0.95, seed=0.7)
    else:
        tree(mb, -0.3, 0.2, 2.1, 0.85, seed=2.2)
        column(mb, 0.9, -0.5, 0.22, 0.7, cut=0.25, tone=0.1)
    meta = {'role': 'fond', 'variante': 'île lointaine ' + variant, 'map': 'archipel',
            'collider': {'type': 'aucun'},
            'usage': 'Silhouette de fond, à placer à 30-60 m, échelle 1 à 3, le brouillard fait le reste.'}
    return mb, island_colorfn(a, b, depth), {'rays': 16, 'dist': 0.8}, meta


PIECES = {
    'plateau_pierre': build_plateau_pierre,
    'plateforme_S': lambda: build_plateforme('S'),
    'plateforme_M': lambda: build_plateforme('M'),
    'plateforme_L': lambda: build_plateforme('L'),
    'bord_pierre': build_bord_pierre,
    'ile_lointaine_A': lambda: build_ile_lointaine('A'),
    'ile_lointaine_B': lambda: build_ile_lointaine('B'),
}


def main():
    # scène vide
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    manifest = {}
    for name, builder in PIECES.items():
        if ONLY and name not in ONLY:
            continue
        mb, colorfn, ao_kw, meta = builder()
        ob = make_object(name, mb, colorfn, ao_kw)
        path = os.path.join(OUT, name + '.glb')
        export(ob, path)
        tris = sum(len(f[0]) - 2 for f in mb.faces)
        meta = dict(meta)
        meta.update({'nom': name, 'fichier': name + '.glb', 'boite': bbox(mb), 'trianglesSource': tris})
        manifest[name] = meta
        print(f'[arena_kit] {name}: {tris} triangles -> {path}')
    with open(os.path.join(OUT, 'pieces.json'), 'w', encoding='utf-8') as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=1)


main()
