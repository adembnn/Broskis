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
    'tile': hx('#E6DED0'), 'tile_b': hx('#9DB3B0'), 'grout': hx('#7E766B'),
    'beech': hx('#C9A77C'), 'beech_l': hx('#DEC29A'), 'beech_d': hx('#A5825B'), 'cabinet': hx('#7F9790'),
    'cabinet_d': hx('#586A66'), 'chrome': hx('#CBD0CF'), 'chrome_d': hx('#8C9392'),
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
    """Anneau du profil : point du contour mis à l'échelle s (nombre ou (sx, sy)), rentré de d le long de la normale.
    jr : rentrée aléatoire (jamais vers l'extérieur), jz : décalage vertical (champ partagé zfield)."""
    sx, sy = s if isinstance(s, tuple) else (s, s)
    out = []
    for p, nrm in zip(P, N):
        q = Vector((p.x * sx, p.y * sy)) - nrm * d
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


def clip_convex(poly, clip):
    """Sutherland-Hodgman : découpe le polygone `poly` par le polygone CONVEXE `clip` (tous deux en sens trigo, 2D)."""
    def inside(p, a, b):
        return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0

    def inter(s, e, a, b):
        d1, d2 = e - s, b - a
        den = d1.x * d2.y - d1.y * d2.x
        if abs(den) < 1e-12:
            return e.copy()
        t = ((a.x - s.x) * d2.y - (a.y - s.y) * d2.x) / den
        return s + d1 * t

    out = [p.copy() for p in poly]
    for i in range(len(clip)):
        a, b = clip[i], clip[(i + 1) % len(clip)]
        inp, out = out, []
        if not inp:
            break
        s = inp[-1]
        for e in inp:
            if inside(e, a, b):
                if not inside(s, a, b):
                    out.append(inter(s, e, a, b))
                out.append(e)
            elif inside(s, a, b):
                out.append(inter(s, e, a, b))
            s = e
    # retire les points quasi confondus
    clean = []
    for p in out:
        if not clean or (p - clean[-1]).length > 1e-4:
            clean.append(p)
    if len(clean) > 2 and (clean[0] - clean[-1]).length <= 1e-4:
        clean.pop()
    return clean


def poly_area(poly):
    return 0.5 * sum(poly[i].x * poly[(i + 1) % len(poly)].y - poly[(i + 1) % len(poly)].x * poly[i].y for i in range(len(poly)))


def plank_layout(clip, width=0.46, gap=0.035, seg=(2.2, 4.2), seed=1.0):
    """Lames de pont le long de X, joints décalés d'une rangée à l'autre ; chaque lame est découpée par le contour."""
    rng = random.Random(int(seed * 977))
    ys = [p.y for p in clip]
    xs = [p.x for p in clip]
    out = []
    y = min(ys)
    row = 0
    while y < max(ys):
        y0, y1 = y + gap / 2, y + width - gap / 2
        x = min(xs) - rng.uniform(0, seg[1])
        while x < max(xs):
            ln = rng.uniform(*seg)
            x0, x1 = x + gap / 2, x + ln - gap / 2
            rect = [Vector((x0, y0)), Vector((x1, y0)), Vector((x1, y1)), Vector((x0, y1))]
            poly = clip_convex(rect, clip)
            if len(poly) >= 3 and poly_area(poly) > 0.02:
                out.append((poly, rng.uniform(-1, 1)))
            x += ln
        y += width
        row += 1
    return out


def tile_layout(clip, size=1.5, grout=0.07, seed=1.0):
    """Carreaux géants en damier, alignés sur le centre ; chaque carreau est découpé par le contour."""
    rng = random.Random(int(seed * 613))
    xs = [p.x for p in clip]
    ys = [p.y for p in clip]
    out = []
    i0, i1 = math.floor(min(xs) / size) - 1, math.ceil(max(xs) / size) + 1
    j0, j1 = math.floor(min(ys) / size) - 1, math.ceil(max(ys) / size) + 1
    for i in range(i0, i1):
        for j in range(j0, j1):
            x0, y0 = i * size + grout / 2, j * size + grout / 2
            x1, y1 = (i + 1) * size - grout / 2, (j + 1) * size - grout / 2
            rect = [Vector((x0, y0)), Vector((x1, y0)), Vector((x1, y1)), Vector((x0, y1))]
            poly = clip_convex(rect, clip)
            if len(poly) >= 3 and poly_area(poly) > 0.02:
                out.append((poly, (1.0 if (i + j) % 2 == 0 else -1.0) * (0.6 + 0.4 * rng.random())))
    return out


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


def contour_three(outline, n=32, inset=0.0):
    """Contour de la surface de marche en repère three : [[x, z], ...] (sens trigo vu du dessus en Blender)."""
    pts, nrm = outline.sample(n)
    return [[round(p.x - m.x * inset, 3), round(-(p.y - m.y * inset), 3)] for p, m in zip(pts, nrm)]


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
        # --- bois de pont (galion)
        if zone == 'plank':
            grain = noise.noise(Vector((p.x * 0.35, p.y * 4.0, tone * 3.0)))
            c = mix(PAL['plank'], PAL['plank_l'] if tone > 0 else PAL['plank_d'], abs(tone) * 0.5)
            return c * (1.0 + 0.07 * grain)
        if zone == 'gap':
            return PAL['gap']
        if zone in ('beam_top', 'beam_chamfer', 'beam_side'):
            c = mix(PAL['beam'], PAL['beam_d'], 0.3 + 0.3 * tone)
            if zone == 'beam_chamfer':
                c = mix(c, PAL['beam'], 0.6) * 1.06
            elif zone == 'beam_side':
                c = mix(c, PAL['beam_d'], 0.55)
            return c * (1.0 + 0.05 * noise.noise(Vector((p.x * 0.5, p.y * 0.5, p.z * 6.0))))
        if zone == 'hull_band':
            return mix(PAL['plank_d'], PAL['hull'], 0.35)
        if zone == 'hull':
            c = PAL['hull'] if int(tone) % 2 == 0 else mix(PAL['hull'], PAL['plank_d'], 0.3)
            c = c * (1.0 + 0.06 * noise.noise(Vector((p.x * 0.3, p.y * 0.3, p.z * 2.0 + 5.0))))
            return mix(c, PAL['hull_d'], smooth01(-p.z / depth) * 0.7)
        if zone == 'hull_ledge':
            return PAL['hull_d'] * 0.8
        if zone == 'iron':
            return PAL['iron']
        # --- cuisine (îlot de cuisine géant)
        if zone == 'tile':
            base = PAL['tile'] if tone > 0 else PAL['tile_b']
            return base * (0.95 + 0.06 * abs(tone))
        if zone == 'grout':
            return PAL['grout']
        if zone in ('beech_top', 'beech_chamfer', 'beech_side', 'board'):
            grain = noise.noise(Vector((p.x * 0.3, p.y * 3.2, 1.7)))
            c = mix(PAL['beech'], PAL['beech_l'], 0.55 + 0.25 * grain)
            if zone == 'beech_chamfer':
                c = mix(c, PAL['beech_l'], 0.6) * 1.05
            elif zone == 'beech_side':
                c = mix(c, PAL['beech_d'], 0.45)
            return c
        if zone == 'groove':
            return mix(PAL['beech'], PAL['beech_d'], 0.75)
        if zone == 'cab_band':
            return mix(PAL['beech'], PAL['beech_d'], 0.5)
        if zone == 'cab':
            c = PAL['cabinet'] if int(tone) % 2 == 0 else mix(PAL['cabinet'], PAL['cabinet_d'], 0.18)
            return mix(c, PAL['cabinet_d'], smooth01(-p.z / depth) * 0.6)
        if zone == 'cab_ledge':
            return PAL['cabinet_d'] * 0.55
        if zone in ('chrome', 'chrome_d'):
            return PAL['chrome'] if zone == 'chrome' else PAL['chrome_d']
        return rock_color(tone, p, n, depth)
    return fn


def rim_spans(outline, max_len, max_angle_deg):
    """Découpe le contour en segments de liseré : longs sur les parties droites, courts dans les virages
    (au plus max_angle_deg de rotation de la normale par segment), longueurs égalisées par tronçon."""
    step = outline.total / 720
    cuts = [0.0]
    u, start_n = 0.0, outline.at(0.0)[1]
    while u < outline.total - step:
        u += step
        n = outline.at(u)[1]
        ang = math.degrees(math.acos(max(-1.0, min(1.0, n.dot(start_n)))))
        if u - cuts[-1] >= max_len or ang >= max_angle_deg:
            cuts.append(u)
            start_n = n
    if outline.total - cuts[-1] < max_len * 0.35 and len(cuts) > 1:
        cuts.pop()
    cuts.append(outline.total)
    return list(zip(cuts, cuts[1:]))


BODY = {  # zones (flanc sous le liseré, strates, replats) par style de dessous
    'rock': ('earth', 'rock', 'ledge'),
    'hull': ('hull_band', 'hull', 'hull_ledge'),
    'cabinet': ('cab_band', 'cab', 'cab_ledge'),
}
RIM = {
    'stone': ('stone_top', 'stone_chamfer', 'stone_side'),
    'beam': ('beam_top', 'beam_chamfer', 'beam_side'),
    'beech': ('beech_top', 'beech_chamfer', 'beech_side'),
}


def floating_island(name, outline, segs, depth, strata, rim=None, top_rings=(0.4, 0.75), tip=(0.0, 0.0),
                    seed=1.0, jr=0.35, jz=0.18, earth=0.34, overhang=0.05, top='grass', body='rock',
                    ledge_in=0.18, ledge_frac=0.3, ledge_h=0.1, chamfer_in=0.14, top_kw=None):
    """Île flottante : dessus plat (herbe, lames de pont ou carreaux), liseré chanfreiné, dessous en strates.
    strata : (s, d, z) ou (sx, sy, d, z) pour le bas de chaque strate (z négatif) ; la dernière précède la pointe."""
    mb = MB()
    P, N = outline.sample(segs)
    W = rim['width'] if rim else 0.0
    band, main, ledge_zone = BODY[body]
    if top == 'grass':
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
    else:
        # lames ou carreaux découpés dans le contour, posés sur une sous-couche sombre qui dessine les joints
        clip = [Vector((q.x, q.y)) for q in ring_pts(P, N, 1.0, max(W - 0.1, 0.0), 0.0)]
        under = [mb.v((q.x, q.y, -0.045)) for q in clip]
        mb.f(under, 'gap' if top == 'planks' else 'grout')
        layout = plank_layout if top == 'planks' else tile_layout
        zone = 'plank' if top == 'planks' else 'tile'
        for poly, tone in layout(clip, seed=seed, **(top_kw or {})):
            mb.f([mb.v((q.x, q.y, 0.0)) for q in poly], zone, tone)
        edge = mb.ring(ring_pts(P, N, 1.0, 0.02, -0.03))
        mb.bridge(under, edge, 'hidden')
        prev = edge
    # --- flanc sous le liseré puis chanfrein rentrant
    r = mb.ring(ring_pts(P, N, 1.0, 0.0, -earth))
    mb.bridge(prev, r, band)
    prev = r
    r = mb.ring(ring_pts(P, N, 1.0, chamfer_in, -earth - 0.1))
    mb.bridge(prev, r, band)
    prev = r
    # --- strates
    norm = [((st[0], st[0]), st[1], st[2]) if len(st) == 3 else ((st[0], st[1]), st[2], st[3]) for st in strata]
    for k, (S, d, z) in enumerate(norm):
        last = k == len(norm) - 1
        zf = seed * 10 + k * 1.7
        bottom = mb.ring(ring_pts(P, N, S, d, z, jr=jr, jz=jz, seed=seed + k, zfield=zf))
        mb.bridge(prev, bottom, main, tone=k)
        prev = bottom
        if not last:
            S2, d2 = norm[k + 1][0], norm[k + 1][1]
            ls = (S[0] - (S[0] - S2[0]) * ledge_frac, S[1] - (S[1] - S2[1]) * ledge_frac)
            ld = d + (d2 - d) * ledge_frac + ledge_in
            ledge = mb.ring(ring_pts(P, N, ls, ld, z - ledge_h, jr=jr, jz=jz, seed=seed + k + 0.5, zfield=zf))
            mb.bridge(prev, ledge, ledge_zone, tone=k)
            prev = ledge
    t = mb.v((tip[0], tip[1], -depth))
    mb.fan(t, prev, main, tone=len(norm), down=True)
    # --- liseré (pierres, poutres ou chant de hêtre)
    if rim:
        style = rim.get('style', 'stone')
        rng = random.Random(int(seed * 1000))
        g = rim.get('gap', 0.035)
        for u0, u1 in rim_spans(outline, rim['len'], rim.get('angle', 30.0)):
            u0, u1 = u0 + g / 2, u1 - g / 2
            p0, n0 = outline.at(u0)
            p1, n1 = outline.at(u1)
            jit = (-0.012, 0.018) if style == 'stone' else (-0.004, 0.004)
            ztop = rim['top'] + rng.uniform(*jit)
            corners = [p0 - n0 * W, p0 + n0 * overhang, p1 + n1 * overhang, p1 - n1 * W]
            if style == 'stone':
                tone = rng.uniform(-0.8, 0.8) if rng.random() > 0.1 else 0.9  # 1 pierre sur 10 moussue
            else:
                tone = rng.uniform(-1, 1)
            mb.box(corners, rim['bot'], ztop, rim.get('chamfer', 0.06), RIM[style], tone)
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
    mb = floating_island('plateau_pierre', ol, 48, depth, strata,
                         rim={'width': 0.75, 'len': 1.3, 'top': 0.05, 'bot': -0.3, 'chamfer': 0.07},
                         top_rings=(0.4, 0.6, 0.78), tip=(0.4, -0.6), seed=1.3, earth=0.28)
    # cercle de duel : un anneau de dalles usées affleurant l'herbe au centre (le « ring » de l'animateur)
    n_dalles, r0, r1 = 22, 2.35, 2.9
    for k in range(n_dalles):
        t0 = 2 * math.pi * (k + 0.04) / n_dalles
        t1 = 2 * math.pi * (k + 0.96) / n_dalles
        cs = [Vector((math.cos(t0) * r0, math.sin(t0) * r0)), Vector((math.cos(t0) * r1, math.sin(t0) * r1)),
              Vector((math.cos(t1) * r1, math.sin(t1) * r1)), Vector((math.cos(t1) * r0, math.sin(t1) * r0))]
        mb.box(cs, -0.05, 0.012, 0.0, STONE_ZONES, -0.55 + 0.25 * math.sin(k * 2.3))
    hanger(mb, 0.52 * a, 0.15 * b, -2.9, 1.1, 2.5, 0.4)
    hanger(mb, -0.5 * a, -0.2 * b, -2.9, 1.2, 3.0, 1.9)
    hanger(mb, 0.1 * a, 0.45 * b, -2.6, 0.9, 2.1, 3.1)
    meta = {'role': 'plateau', 'variante': 'herbe et pierre', 'map': 'archipel',
            'surface': {'forme': 'superellipse', 'demiX': a, 'demiZ': b, 'exposant': 2.6, 'y': 0.0,
                        'liseré': 0.75, 'contour': contour_three(ol)},
            'collider': {'type': 'convexe', 'conseil': 'ColliderDesc.convexHull des points du contour à y=0 et y=-0.6 (jamais de trimesh du mesh entier)'},
            'usage': "Plateau principal flottant façon Battlefield : dessus d'herbe net, liseré de pierres claires = bord du vide."}
    return mb, island_colorfn(a, b, depth), {'rays': 28, 'dist': 1.4}, meta


def build_plateforme(size):
    dims = {'S': (1.6, 1.0), 'M': (2.3, 1.2), 'L': (3.1, 1.4)}[size]
    a, b = dims
    ol = Outline(rounded_rect(a, b, 0.8))  # rayon > rentrée max (0,68 m) : pas de boucle dans les coins
    depth = {'S': 0.95, 'M': 1.05, 'L': 1.15}[size]
    strata = [(1.0, 0.16, -0.62), (0.62, 0.3, -0.86)]
    mb = floating_island('plateforme_pierre_' + size, ol, 32 if size != 'S' else 28, depth, strata,
                         rim={'width': 0.4, 'len': 0.8, 'top': 0.04, 'bot': -0.22, 'chamfer': 0.05},
                         top_rings=(0.25,), tip=(0.1, 0.0), seed={'S': 2.1, 'M': 3.4, 'L': 4.7}[size],
                         jr=0.1, jz=0.05, earth=0.26, overhang=0.04)
    meta = {'role': 'plateforme', 'variante': 'herbe et pierre', 'map': 'archipel',
            'surface': {'forme': 'rectangle arrondi', 'demiX': a, 'demiZ': b, 'y': 0.0, 'contour': contour_three(ol, 20)},
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


PLAT_DIMS = {'S': (1.6, 1.0), 'M': (2.3, 1.2), 'L': (3.1, 1.4)}  # demi-longueur X, demi-largeur Z (m)


def build_plateau_pont():
    """Galion : pont ovale en lames délavées, liseré de poutres blanchies par le sel, coque à clins sous le pont."""
    a, b = 9.5, 6.6
    ol = Outline(superellipse(a, b, 2.2))
    depth = 4.3
    strata = [(1.0, 1.0, 0.1, -0.85), (0.98, 0.9, 0.16, -1.6), (0.93, 0.74, 0.2, -2.35), (0.84, 0.54, 0.2, -3.05),
              (0.7, 0.3, 0.15, -3.7)]
    mb = floating_island('plateau_pont', ol, 52, depth, strata, top='planks', body='hull',
                         rim={'width': 0.5, 'len': 1.6, 'top': 0.07, 'bot': -0.24, 'chamfer': 0.05, 'style': 'beam', 'gap': 0.03},
                         tip=(0.0, 0.0), seed=2.7, jr=0.02, jz=0.0, earth=0.32, ledge_in=0.07, ledge_frac=0.0,
                         ledge_h=0.07, chamfer_in=0.1, top_kw={'width': 0.5, 'gap': 0.04})
    meta = {'role': 'plateau', 'variante': 'planches de pont', 'map': 'galion',
            'surface': {'forme': 'superellipse', 'demiX': a, 'demiZ': b, 'exposant': 2.2, 'y': 0.0, 'liseré': 0.5,
                        'contour': contour_three(ol)},
            'collider': {'type': 'convexe', 'conseil': 'ColliderDesc.convexHull des points du contour à y=0 et y=-0.6'},
            'usage': "Pont ouvert sans bastingage (lames le long de X, l'axe du duel) ; mât Kenney à poser au fond (z négatif)."}
    return mb, island_colorfn(a, b, depth), {'rays': 24, 'dist': 1.2}, meta


def handles(mb, outline, d_face, z, spacing, half_len=0.6, proud=0.16, h=0.075, phase=0.0):
    """Poignées de tiroir géantes (barres chromées) réparties sur une rangée du caisson."""
    n = max(4, round(outline.total / spacing))
    for k in range(n):
        p, nrm = outline.at(outline.total * (k + 0.5 + phase) / n)
        t = Vector((-nrm.y, nrm.x))
        cs = [p - nrm * (d_face + 0.02) - t * half_len, p - nrm * (d_face - proud) - t * half_len,
              p - nrm * (d_face - proud) + t * half_len, p - nrm * (d_face + 0.02) + t * half_len]
        mb.box(cs, z - h, z + h, 0.03, ('chrome', 'chrome', 'chrome_d'), 0.0, bottom=True)


def build_plateau_cuisine():
    """Cuisine géante : îlot de cuisine, carreaux géants en damier, chant de hêtre clair, tiroirs et poignées."""
    a, b = 9.5, 7.0
    ol = Outline(rounded_rect(a, b, 1.4))
    depth = 4.9
    strata = [(1.0, 0.3, -1.65), (1.0, 0.3, -3.25), (1.0, 0.3, -4.8)]
    mb = floating_island('plateau_cuisine', ol, 56, depth, strata, top='tiles', body='cabinet',
                         rim={'width': 0.45, 'len': 3.2, 'angle': 15.0, 'top': 0.035, 'bot': -0.14, 'chamfer': 0.12, 'style': 'beech', 'gap': 0.012},
                         tip=(0.0, 0.0), seed=3.9, jr=0.0, jz=0.0, earth=0.42, ledge_in=0.07, ledge_frac=0.0,
                         ledge_h=0.12, chamfer_in=0.3, overhang=0.02, top_kw={'size': 1.5, 'grout': 0.08})
    handles(mb, ol, 0.3, -1.1, 3.4)
    handles(mb, ol, 0.3, -2.45, 3.4, phase=0.5)
    meta = {'role': 'plateau', 'variante': 'plan de travail carrelé', 'map': 'cuisine',
            'surface': {'forme': 'rectangle arrondi', 'demiX': a, 'demiZ': b, 'rayonCoins': 1.4, 'y': 0.0, 'liseré': 0.45,
                        'contour': contour_three(ol)},
            'collider': {'type': 'convexe', 'conseil': 'ColliderDesc.convexHull des points du contour à y=0 et y=-0.6'},
            'usage': "Îlot de cuisine géant (carreaux de 1,5 m : les persos sont minuscules), tiroirs tout autour, le sol de la cuisine loin dessous."}
    return mb, island_colorfn(a, b, depth), {'rays': 24, 'dist': 1.2}, meta


def build_radeau(size):
    """Galion : radeau de lames (plateforme), même langage que le pont."""
    a, b = PLAT_DIMS[size]
    ol = Outline(rounded_rect(a, b, 0.7))
    depth = 0.72
    strata = [(1.0, 1.0, 0.08, -0.46), (0.86, 0.6, 0.2, -0.62)]
    mb = floating_island('radeau_' + size, ol, 28, depth, strata, top='planks', body='hull',
                         rim={'width': 0.34, 'len': 1.0, 'top': 0.06, 'bot': -0.2, 'chamfer': 0.04, 'style': 'beam', 'gap': 0.03},
                         seed={'S': 5.1, 'M': 5.4, 'L': 5.7}[size], jr=0.0, jz=0.0, earth=0.24, ledge_in=0.05,
                         ledge_frac=0.0, ledge_h=0.05, chamfer_in=0.08, overhang=0.03, top_kw={'width': 0.42, 'gap': 0.04})
    meta = {'role': 'plateforme', 'variante': 'radeau de planches', 'map': 'galion',
            'surface': {'forme': 'rectangle arrondi', 'demiX': a, 'demiZ': b, 'y': 0.0, 'contour': contour_three(ol, 20)},
            'collider': {'type': 'box traversable par le dessous (one-way)', 'conseil': f'box hx {a - 0.05:.2f} hy 0.15 hz {b - 0.05:.2f} centrée y=-0.15'},
            'usage': 'Plateforme flottante du galion (débris de pont), traversable en sautant.'}
    return mb, island_colorfn(a, b, depth), {'rays': 20, 'dist': 0.6}, meta


def build_planche(size):
    """Cuisine : planche à découper géante (plateforme) avec sa rainure à jus."""
    a, b = PLAT_DIMS[size]
    ol = Outline(rounded_rect(a, b, 0.6))
    P, N = ol.sample(28)
    mb = MB()
    thick, g = 0.24, 0.26
    c = mb.v((0, 0, 0))
    r1 = mb.ring(ring_pts(P, N, 1.0, g + 0.09, 0.0))
    mb.fan(c, r1, 'board')
    r2 = mb.ring(ring_pts(P, N, 1.0, g + 0.05, -0.045))
    r3 = mb.ring(ring_pts(P, N, 1.0, g - 0.05, -0.045))
    r4 = mb.ring(ring_pts(P, N, 1.0, g - 0.09, 0.0))
    mb.bridge(r1, r2, 'groove')
    mb.bridge(r2, r3, 'groove')
    mb.bridge(r3, r4, 'groove')
    r5 = mb.ring(ring_pts(P, N, 1.0, 0.07, 0.0))
    mb.bridge(r4, r5, 'board')
    r6 = mb.ring(ring_pts(P, N, 1.0, 0.0, -0.07))
    mb.bridge(r5, r6, 'beech_chamfer')
    r7 = mb.ring(ring_pts(P, N, 1.0, 0.0, -thick + 0.05))
    mb.bridge(r6, r7, 'beech_side')
    r8 = mb.ring(ring_pts(P, N, 1.0, 0.06, -thick))
    mb.bridge(r7, r8, 'beech_side')
    mb.fan(mb.v((0, 0, -thick)), r8, 'beech_side', down=True)
    meta = {'role': 'plateforme', 'variante': 'planche à découper', 'map': 'cuisine',
            'surface': {'forme': 'rectangle arrondi', 'demiX': a, 'demiZ': b, 'y': 0.0, 'contour': contour_three(ol, 20)},
            'collider': {'type': 'box traversable par le dessous (one-way)', 'conseil': f'box hx {a - 0.05:.2f} hy 0.12 hz {b - 0.05:.2f} centrée y=-0.12'},
            'usage': 'Plateforme flottante de la cuisine : planche en hêtre de 24 cm, rainure sombre = bord lisible.'}
    return mb, island_colorfn(a, b, 1.0), {'rays': 16, 'dist': 0.4}, meta


def hexagon(apothem, rr):
    """Hexagone « flat-top » (sommets sur ±X, comme le disque de tuiles pointy-top) aux coins arrondis de rayon rr."""
    k = (-0.866025404, 0.5, 0.577350269)
    h = apothem - rr

    def sd(px, py):
        px, py = abs(px), abs(py)
        d = 2.0 * min(k[0] * px + k[1] * py, 0.0)
        px, py = px - d * k[0], py - d * k[1]
        cx = max(-k[2] * h, min(k[2] * h, px))
        qx, qy = px - cx, py - h
        return math.hypot(qx, qy) * (1 if qy > 0 else -1) - rr

    def fn(t):
        d = Vector((math.cos(t), math.sin(t)))
        lo, hi = 0.0, apothem * 2
        for _ in range(40):
            m = (lo + hi) / 2
            if sd(d.x * m, d.y * m) > 0:
                hi = m
            else:
                lo = m
        return d * lo
    return fn


def build_socle_hex(k):
    """Archipel : dessous rocheux à glisser sous un disque de tuiles hex KayKit de rayon k (anneaux)."""
    apo = (2 * k + 0.35) * math.sqrt(3) / 2  # sous les tuiles extérieures, sans dépasser leur bord
    ol = Outline(hexagon(apo, 0.9))
    depth = 2.2 + 1.1 * k
    f = depth / 6.6
    strata = [(1.0, 0.25, -1.0 * f - 0.3), (0.88, 0.5, -2.2 * f), (0.7, 0.7, -3.4 * f), (0.48, 0.7, -4.5 * f),
              (0.28, 0.5, -5.4 * f)]
    mb = floating_island('socle_hex_%d' % k, ol, 36 + 4 * k, depth, strata, rim=None, top_rings=(0.5,),
                         tip=(0.2, -0.3), seed=7.0 + k, jr=0.3, jz=0.12, earth=0.3)
    if k >= 3:
        hanger(mb, 0.45 * apo, 0.2 * apo, -2.0 * f - 0.4, 0.8, 2.0, 0.3)
        hanger(mb, -0.4 * apo, -0.25 * apo, -2.0 * f - 0.4, 0.9, 2.4, 1.3)
    meta = {'role': 'socle', 'variante': 'roche sous tuiles hex', 'map': 'archipel',
            'surface': {'forme': 'hexagone (sommets sur ±X)', 'apotheme': round(apo, 3), 'y': 0.0},
            'ancre': "centre du dessus du socle : le poser SOUS les tuiles (y = dessus des tuiles - 1, soit le bas des tuiles KayKit)",
            'collider': {'type': 'aucun', 'conseil': 'les tuiles gardent leurs colliders ; quand un anneau tombe, passer au socle k-1 (ou échelle (k-1)/k en X/Z)'},
            'usage': 'Transforme le disque de tuiles hex en île céleste : dessous en strates rocheuses, invisible depuis le dessus.'}
    return mb, island_colorfn(apo, apo, depth), {'rays': 20, 'dist': 1.2}, meta


def build_muret():
    """Couvert : muret de ruine bas (3,2 m), pierres chanfreinées en 3 assises, sommet cassé, 2 blocs tombés."""
    mb = MB()
    rng = random.Random(31)
    L, D = 3.2, 0.62
    courses = [(0.0, 0.42, 1.0), (0.42, 0.8, 0.82), (0.8, 1.14, 0.45)]  # (bas, haut, part de la longueur)
    for ci, (z0, z1, part) in enumerate(courses):
        x = -L / 2 + (0.0 if ci % 2 == 0 else 0.35)
        xmax = -L / 2 + L * part if ci < 2 else -L / 2 + L * part - 0.2
        while x < xmax - 0.2:
            ln = min(rng.uniform(0.6, 0.95), xmax - x)
            x0, x1 = x + 0.02, x + ln - 0.02
            dy = rng.uniform(-0.03, 0.03)
            cs = [Vector((x0, -D / 2 + dy)), Vector((x1, -D / 2 + dy)), Vector((x1, D / 2 + dy)), Vector((x0, D / 2 + dy))]
            mb.box(cs, z0 - (0.05 if ci == 0 else 0.0), z1 + rng.uniform(-0.03, 0.02), 0.055, RIM['stone'], rng.uniform(-0.8, 0.8))
            x += ln
    # blocs tombés au pied (côté +X)
    for (x, y, s, rot) in ((1.75, 0.55, 0.3, 0.4), (1.35, -0.62, 0.24, -0.3)):
        c, sn = math.cos(rot), math.sin(rot)
        cs = [Vector((x + (-s) * c - (-s) * sn, y + (-s) * sn + (-s) * c)), Vector((x + s * c - (-s) * sn, y + s * sn + (-s) * c)),
              Vector((x + s * c - s * sn, y + s * sn + s * c)), Vector((x + (-s) * c - s * sn, y + (-s) * sn + s * c))]
        mb.box(cs, -0.02, s * 1.3, 0.05, RIM['stone'], rng.uniform(-0.8, 0.2))
    meta = {'role': 'couvert', 'variante': 'muret de ruine', 'map': 'archipel',
            'ancre': 'centre de la base, au sol (y=0)',
            'collider': {'type': 'box', 'conseil': 'box hx 1.6 hy 0.55 hz 0.31 centrée y=0.55 (le haut cassé est plus bas à droite)'},
            'usage': 'Couvert bas (1,1 m : on voit la tête du perso derrière), jamais au centre de la ligne de tir.'}
    return mb, island_colorfn(1, 1, 1), {'rays': 24, 'dist': 0.6, 'ground': 4.0}, meta


def build_caisse():
    """Couvert : caisse de 1,1 m, panneaux de planches sombres, cadre en bois clair."""
    mb = MB()
    s, fr, H = 0.55, 0.13, 1.1
    inner = s - 0.03
    mb.box([Vector((-inner, -inner)), Vector((inner, -inner)), Vector((inner, inner)), Vector((-inner, inner))], 0.0, H - 0.02, 0.02,
           ('plank', 'plank', 'plank'), -0.6)
    for (x, y) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):  # montants d'angle
        cx, cy = x * (s - fr / 2), y * (s - fr / 2)
        cs = [Vector((cx - fr / 2, cy - fr / 2)), Vector((cx + fr / 2, cy - fr / 2)), Vector((cx + fr / 2, cy + fr / 2)), Vector((cx - fr / 2, cy + fr / 2))]
        mb.box(cs, 0.0, H, 0.025, RIM['beam'], 0.2)
    t = s - 0.012  # traverses rentrées de 12 mm par rapport aux montants : pas de faces confondues
    for z0, z1 in ((0.0, fr), (H - fr, H)):  # traverses haut et bas
        for (ax, ay, bx, by) in ((-t, -t, t, -t + fr), (t - fr, -t, t, t), (-t, t - fr, t, t), (-t, -t, -t + fr, t)):
            cs = [Vector((ax, ay)), Vector((bx, ay)), Vector((bx, by)), Vector((ax, by))]
            mb.box(cs, z0, z1 + 0.005, 0.02, RIM['beam'], -0.2)
    meta = {'role': 'couvert', 'variante': 'caisse', 'map': 'toutes',
            'ancre': 'centre de la base, au sol (y=0)',
            'collider': {'type': 'box', 'conseil': 'box hx 0.55 hy 0.55 hz 0.55 centrée y=0.55'},
            'usage': 'Couvert ou élément « knockable » (poussée) ; cadre clair lisible de loin.'}
    return mb, island_colorfn(1, 1, 1), {'rays': 20, 'dist': 0.45, 'ground': 3.0}, meta


def build_tonneau():
    """Couvert : tonneau (1,1 m), douelles alternées, 2 cerclages sombres, couvercle en retrait."""
    mb = MB()
    segs = 14
    prof = [(0.0, 0.40), (0.14, 0.44), (0.55, 0.49), (0.96, 0.44), (1.1, 0.40)]  # (z, rayon)
    rings = []
    for z, r in prof:
        rings.append([mb.v((math.cos(2 * math.pi * i / segs) * r, math.sin(2 * math.pi * i / segs) * r, z)) for i in range(segs)])
    for k, (r0, r1) in enumerate(zip(rings, rings[1:])):
        for i in range(segs):
            j = (i + 1) % segs
            mb.f((r0[i], r0[j], r1[j], r1[i]), 'plank', 0.5 if i % 2 == 0 else -0.4, smooth=True)
    for z in (0.2, 0.9):  # cerclages
        rr = 0.475 if z == 0.2 else 0.475
        lo = [mb.v((math.cos(2 * math.pi * i / segs) * (rr + 0.015), math.sin(2 * math.pi * i / segs) * (rr + 0.015), z - 0.05)) for i in range(segs)]
        hi = [mb.v((math.cos(2 * math.pi * i / segs) * (rr + 0.015), math.sin(2 * math.pi * i / segs) * (rr + 0.015), z + 0.05)) for i in range(segs)]
        mb.bridge(lo, hi, 'iron', up=True, smooth=True)
    lid = [mb.v((math.cos(2 * math.pi * i / segs) * 0.35, math.sin(2 * math.pi * i / segs) * 0.35, 1.06)) for i in range(segs)]
    mb.bridge(rings[-1], lid, 'beam_side', up=True)
    mb.fan(mb.v((0, 0, 1.06)), lid, 'plank', 0.2)
    meta = {'role': 'couvert', 'variante': 'tonneau', 'map': 'toutes',
            'ancre': 'centre de la base, au sol (y=0)',
            'collider': {'type': 'cylindre', 'conseil': 'cylinder radius 0.47 halfHeight 0.55 centré y=0.55'},
            'usage': 'Couvert rond ou tonneau explosif (même collider que props.glb barrel_small).'}
    return mb, island_colorfn(1, 1, 1), {'rays': 20, 'dist': 0.45, 'ground': 3.0}, meta


def icosphere():
    t = (1 + math.sqrt(5)) / 2
    v = [Vector(p).normalized() for p in ((-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
                                          (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1))]
    f = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
         (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1)]
    cache = {}

    def mid(a, b):
        key = (min(a, b), max(a, b))
        if key not in cache:
            v.append(((v[a] + v[b]) / 2).normalized())
            cache[key] = len(v) - 1
        return cache[key]
    nf = []
    for a, b, c in f:
        ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
        nf += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
    return v, nf


def build_nuage(variant):
    """Fond : nuage en boules facettées à dessous plat, blanc chaud dessus, mauve dessous."""
    mb = MB()
    rng = random.Random(11 if variant == 'A' else 23)
    V, F = icosphere()
    blobs = ([(-1.9, 0.0, 0.2, 1.0), (-0.6, 0.2, 0.55, 1.45), (0.9, -0.1, 0.45, 1.3), (2.1, 0.1, 0.1, 0.9), (0.2, -0.5, 0.0, 1.0)]
             if variant == 'A' else
             [(-1.3, 0.0, 0.1, 0.95), (0.0, 0.1, 0.45, 1.25), (1.35, -0.1, 0.15, 0.95), (0.6, 0.5, 0.0, 0.8)])
    for (x, y, z, r) in blobs:
        sq = rng.uniform(0.75, 0.85)
        idx = []
        for p in V:
            zz = z + p.z * r * sq
            idx.append(mb.v((x + p.x * r, y + p.y * r * 0.8, max(zz, 0.0))))
        for a, b, c in F:
            mb.f((idx[a], idx[b], idx[c]), 'cloud', 0.0, smooth=True)

    def colorfn(zone, tone, p, n):
        t = smooth01(0.5 + 0.5 * n.z) * 0.7 + smooth01(p.z / 1.6) * 0.3
        return mix(PAL['cloud_d'], PAL['cloud'], t)
    meta = {'role': 'fond', 'variante': 'nuage ' + variant, 'map': 'archipel',
            'ancre': 'centre du dessous (plat)', 'collider': {'type': 'aucun'},
            'usage': "Nuage de fond (5 m à l'échelle 1) : échelle 2 à 5, sous et autour du plateau, sans ombre portée."}
    return mb, colorfn, {'rays': 12, 'dist': 0.8}, meta


def build_rocher(size):
    """Fond : rocher flottant (petite île sans liseré) en 3 tailles."""
    a = {'S': 0.9, 'M': 1.5, 'L': 2.3}[size]
    b = a * 0.8
    ol = Outline(superellipse(a, b, 2.2))
    depth = a * 1.7
    strata = [(0.95, 0.12 * a, -0.35 * depth), (0.72, 0.15 * a, -0.62 * depth), (0.4, 0.12 * a, -0.85 * depth)]
    mb = floating_island('rocher_' + size, ol, 12 if size == 'S' else 16, depth, strata, rim=None, top_rings=(0.55,),
                         tip=(0.1 * a, -0.1 * a), seed={'S': 8.1, 'M': 8.6, 'L': 9.2}[size], jr=0.18 * a, jz=0.06 * a,
                         earth=0.18 * a, ledge_in=0.08 * a)
    meta = {'role': 'fond', 'variante': 'rocher flottant ' + size, 'map': 'archipel',
            'collider': {'type': 'aucun'},
            'usage': 'Rocher flottant de décor, hors du plateau (5 à 25 m), léger mouvement de flottaison conseillé.'}
    return mb, island_colorfn(a, b, depth), {'rays': 12, 'dist': 0.6}, meta


def build_bord_bois():
    """Bord modulaire droit de 2 m en poutre blanchie (galion), même ancre que bord_pierre."""
    mb = MB()
    cs = [Vector((-0.99, -0.5)), Vector((0.99, -0.5)), Vector((0.99, 0.04)), Vector((-0.99, 0.04))]
    mb.box(cs, -0.24, 0.07, 0.05, RIM['beam'], 0.1)
    meta = {'role': 'bord', 'variante': 'poutre', 'map': 'galion',
            'surface': {'forme': 'segment droit', 'longueur': 2.0, 'largeur': 0.5, 'y': 0.07},
            'ancre': "milieu de l'arête extérieure, dessus à y=0 ; le vide est côté -Z",
            'collider': {'type': 'aucun (visuel)'},
            'usage': 'Liseré clair pour les bords du pont Kenney (remplace le bastingage enlevé).'}
    return mb, island_colorfn(1, 1, 1), {'rays': 16, 'dist': 0.4, 'ground': 3.0}, meta


PIECES = {
    'plateau_pierre': build_plateau_pierre,
    'plateau_pont': build_plateau_pont,
    'plateau_cuisine': build_plateau_cuisine,
    'plateforme_pierre_S': lambda: build_plateforme('S'),
    'plateforme_pierre_M': lambda: build_plateforme('M'),
    'plateforme_pierre_L': lambda: build_plateforme('L'),
    'radeau_S': lambda: build_radeau('S'),
    'radeau_M': lambda: build_radeau('M'),
    'radeau_L': lambda: build_radeau('L'),
    'planche_S': lambda: build_planche('S'),
    'planche_M': lambda: build_planche('M'),
    'planche_L': lambda: build_planche('L'),
    'socle_hex_2': lambda: build_socle_hex(2),
    'socle_hex_3': lambda: build_socle_hex(3),
    'socle_hex_4': lambda: build_socle_hex(4),
    'bord_pierre': build_bord_pierre,
    'bord_bois': build_bord_bois,
    'muret_ruine': build_muret,
    'caisse': build_caisse,
    'tonneau': build_tonneau,
    'ile_lointaine_A': lambda: build_ile_lointaine('A'),
    'ile_lointaine_B': lambda: build_ile_lointaine('B'),
    'rocher_S': lambda: build_rocher('S'),
    'rocher_M': lambda: build_rocher('M'),
    'rocher_L': lambda: build_rocher('L'),
    'nuage_A': lambda: build_nuage('A'),
    'nuage_B': lambda: build_nuage('B'),
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
