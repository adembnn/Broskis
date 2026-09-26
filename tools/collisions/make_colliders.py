"""
Demo bpy (Blender headless, sans ecran) : genere des proxies de collision pour
props.glb et ship-pirate-large.glb, isole le pont du bateau, exporte en GLB
avec les custom properties (extras).

Point cle anti-crash (voir crash.log) : ne JAMAIS appeler
bpy.ops.wm.read_factory_settings() dans ce process — le module bpy pip demarre
deja sur une scene "factory" (Camera/Cube/Light) ; rappeler read_factory_settings
reinitialise les sous-systemes (dont libmv/Google-logging) une 2e fois et crashe
avec "InitGoogleLogging() twice". Un seul `import bpy`, un seul process
`python3 script.py`, pas de reset.
"""
import bpy, bmesh, math, time, json, os

WORK = os.environ.get("COL_WORK", "/tmp/collisions")  # GLB décompressés par decompress_glb.cjs + sortie
from mathutils import Vector

T0 = time.time()
times = {}


def lap(label):
    times[label] = round(time.time() - T0, 3)
    print(f"[{times[label]:6.3f}s] {label}")


# ---------------------------------------------------------------------------
# 1) Import (les GLB "_plain" ont deja ete decompresses de EXT_meshopt_compression
#    et delestes de EXT_texture_webp/materiaux par decompress_glb.cjs, que bpy
#    pip ne sait pas lire nativement).
# ---------------------------------------------------------------------------
def import_glb(path):
    before = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=path)
    after = set(bpy.data.objects.keys())
    return [bpy.data.objects[n] for n in (after - before)]


props_objs = import_glb(f"{WORK}/props_plain.glb")
lap("import props_plain.glb")
ship_objs = import_glb(f"{WORK}/ship_plain.glb")
lap("import ship_plain.glb")

imported = set(props_objs) | set(ship_objs)

# nettoyage de la scene par defaut (Camera/Cube/Light du pip bpy, pas de l'import)
for o in list(bpy.data.objects):
    if o not in imported:
        bpy.data.objects.remove(o, do_unlink=True)

mesh_objs = [o for o in imported if o.type == 'MESH']
print(f"meshes importes : {len(mesh_objs)}")

# ---------------------------------------------------------------------------
# 2) Colliders generiques : boite locale (bound_box) vs enveloppe convexe,
#    choisis par le ratio volume(hull)/volume(boite) — un ratio bas (formes
#    rondes/irregulieres, ex. un cylindre ~0.785) profite d'un hull; un ratio
#    proche de 1 (formes deja "en boite") ne justifie pas le cout d'un hull.
# ---------------------------------------------------------------------------
RATIO_THRESHOLD = 0.82
MAX_HULL_VERTS = 64
MIN_HALF = 0.02  # extent min. pour eviter un collider a volume nul (flags/sails plats)

collider_objs = []


def local_bound_box(obj):
    coords = [Vector(c) for c in obj.bound_box]
    xs = [c.x for c in coords]; ys = [c.y for c in coords]; zs = [c.z for c in coords]
    mn = Vector((min(xs), min(ys), min(zs)))
    mx = Vector((max(xs), max(ys), max(zs)))
    center = (mn + mx) / 2
    half = Vector((max((mx.x - mn.x) / 2, MIN_HALF),
                   max((mx.y - mn.y) / 2, MIN_HALF),
                   max((mx.z - mn.z) / 2, MIN_HALF)))
    return center, half


def make_mesh_object(name, bm_src, matrix_world):
    me = bpy.data.meshes.new(name)
    bm_src.to_mesh(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.matrix_world = matrix_world.copy()
    return ob


def build_box_collider(obj, center_local, half_local, name, extra_props=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = v.co.x * 2 * half_local.x + center_local.x
        v.co.y = v.co.y * 2 * half_local.y + center_local.y
        v.co.z = v.co.z * 2 * half_local.z + center_local.z
    ob = make_mesh_object(name, bm, obj.matrix_world)
    bm.free()
    ob["collider"] = "box"
    ob["source"] = obj.name
    for k, v in (extra_props or {}).items():
        ob[k] = v
    return ob


def reduce_to_hull(bm, max_verts=MAX_HULL_VERTS):
    if len(bm.verts) >= max_verts:
        for angle_deg in (2, 5, 10, 20, 30, 45):
            if len(bm.verts) < max_verts:
                break
            bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(angle_deg), verts=bm.verts, edges=bm.edges)
    if len(bm.verts) >= max_verts:
        tmp_me = bpy.data.meshes.new("tmp_dec")
        bm.to_mesh(tmp_me)
        tmp_ob = bpy.data.objects.new("tmp_dec", tmp_me)
        bpy.context.collection.objects.link(tmp_ob)
        mod = tmp_ob.modifiers.new("dec", 'DECIMATE')
        mod.ratio = max(0.02, (max_verts * 0.6) / max(1, len(bm.verts)))
        depsgraph = bpy.context.evaluated_depsgraph_get()
        eval_ob = tmp_ob.evaluated_get(depsgraph)
        eval_me = eval_ob.to_mesh()
        bm2 = bmesh.new()
        bm2.from_mesh(eval_me)
        eval_ob.to_mesh_clear()
        bpy.data.objects.remove(tmp_ob, do_unlink=True)
        bpy.data.meshes.remove(tmp_me)
        res = bmesh.ops.convex_hull(bm2, input=bm2.verts, use_existing_faces=False)
        bmesh.ops.delete(bm2, geom=res['geom_interior'], context='VERTS')
        bm.free()
        bm = bm2
    return bm


def build_hull_collider(obj, name):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    res = bmesh.ops.convex_hull(bm, input=bm.verts, use_existing_faces=False)
    bmesh.ops.delete(bm, geom=res['geom_interior'], context='VERTS')
    bm = reduce_to_hull(bm)
    n_verts = len(bm.verts)
    ob = make_mesh_object(name, bm, obj.matrix_world)
    bm.free()
    ob["collider"] = "hull"
    ob["source"] = obj.name
    ob["hull_verts"] = n_verts
    return ob


report_rows = []
for obj in mesh_objs:
    center, half = local_bound_box(obj)
    box_vol = 8 * half.x * half.y * half.z

    hull_vol = 0.0
    hull_ratio = None
    try:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        res = bmesh.ops.convex_hull(bm, input=bm.verts, use_existing_faces=False)
        bmesh.ops.delete(bm, geom=res['geom_interior'], context='VERTS')
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        hull_vol = bm.calc_volume(signed=False)
        bm.free()
        if box_vol > 1e-9:
            hull_ratio = hull_vol / box_vol
    except Exception as e:
        hull_ratio = None

    use_hull = hull_ratio is not None and hull_ratio < RATIO_THRESHOLD
    col_name = f"{obj.name}-col"
    if use_hull:
        col = build_hull_collider(obj, col_name)
    else:
        col = build_box_collider(obj, center, half, col_name)
    collider_objs.append(col)
    report_rows.append((obj.name, obj.data.name, len(obj.data.vertices), round(hull_ratio, 3) if hull_ratio else None, col["collider"]))

lap(f"colliders generiques ({len(collider_objs)})")

print("\nobj_name | mesh_data | verts | hull/box_ratio | collider")
for row in report_rows:
    print(" | ".join(str(x) for x in row))

# ---------------------------------------------------------------------------
# 3) Cas particulier bateau : isoler le PONT (faces horizontales, normal.z>0.8)
#    dans le mesh unique 'ship-pirate-large' (coque+mats fusionnes, voiles/
#    drapeaux deja separes en objets a part). Cf t3/t4/t5 : le local Z de bpy
#    correspond 1:1 au Y (vertical) du jeu (aucune rotation appliquee a
#    l'import ; seules les coordonnees sont reindexees Y<->Z par l'exporteur
#    gltf de Blender), donc les demi-etendues mesurees ci-dessous sont deja
#    dans le repere du jeu sans conversion supplementaire (juste x<-x, y<-z,
#    z<-y).
# ---------------------------------------------------------------------------
ship = bpy.data.objects.get("ship-pirate-large")
if ship:
    bm = bmesh.new()
    bm.from_mesh(ship.data)
    bm.normal_update()

    UP_DOT = 0.8
    Z_LO, Z_HI = 1.8, 2.4  # bande autour du pic dominant (22.77 m2 de pont, cf t4_deck_analysis.py)

    sel_verts = set()
    n_faces = 0
    for f in bm.faces:
        if f.normal.z > UP_DOT:
            avg_z = sum(v.co.z for v in f.verts) / len(f.verts)
            if Z_LO <= avg_z <= Z_HI:
                n_faces += 1
                for v in f.verts:
                    sel_verts.add(v)

    xs = [v.co.x for v in sel_verts]; ys = [v.co.y for v in sel_verts]; zs = [v.co.z for v in sel_verts]
    dc = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2))
    dh = Vector(((max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2, max((max(zs) - min(zs)) / 2, MIN_HALF)))
    bm.free()

    deck = build_box_collider(ship, dc, dh, "ship-pirate-large-deck-col",
                               extra_props={"part": "deck", "deck_faces": n_faces})
    collider_objs.append(deck)

    scale = 1.15
    print(f"\n-- PONT du bateau (mesh local -> repere jeu Y-up, x<-x,y<-z,z<-y) --")
    print(f"local: centre=({dc.x:.3f},{dc.y:.3f},{dc.z:.3f}) demi-etendues=({dh.x:.3f},{dh.y:.3f},{dh.z:.3f})")
    print(f"jeu (avant shipScale): largeur={2*dh.x:.3f}m longueur={2*dh.y:.3f}m epaisseur={2*dh.z:.3f}m, hauteur-quille deckY={dc.z:.3f}m")
    print(f"jeu (apres shipScale={scale}): largeur={2*dh.x*scale:.3f}m longueur={2*dh.y*scale:.3f}m epaisseur={2*dh.z*scale:.3f}m, deckY={dc.z*scale:.3f}m")
    print(f"(comparaison tokens.ts actuel : deckLocalY=1.8 (mesure={dc.z:.3f}), deckHalf pre-scale=[2.3,0.3,6.2] (mesure=[{dh.x:.3f},{dh.z:.3f},{dh.y:.3f}]))")
else:
    print("ship-pirate-large introuvable !")

lap("isolation pont bateau")

# ---------------------------------------------------------------------------
# 4) Export GLB avec les custom properties (export_extras=True)
# ---------------------------------------------------------------------------
out_path = f"{WORK}/colliders.glb"
bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', export_extras=True)
lap("export out.glb")

print(f"\ntotal objets scene: {len(bpy.data.objects)} (dont {len(collider_objs)} colliders '-col')")
print("TOTAL elapsed:", round(time.time() - T0, 2), "s")

# Contournement n2 : le module bpy pip segfault a la finalisation de l'interpreteur
# (teardown des sous-systemes Blender), APRES la fin normale du script (fichier
# deja ecrit/flush). os._exit() saute ce teardown et evite le code de sortie 139,
# qui ferait sinon croire a un echec a un pipeline/CI alors que out.glb est valide.
import os
os._exit(0)
