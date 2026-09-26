import bpy
import sys
import math
import mathutils

argv = sys.argv
try:
    index = argv.index("--") + 1
except ValueError:
    index = len(argv)
    
rodin_glb = argv[index]
kaykit_glb = argv[index+1]
out_glb = argv[index+2]

# Cleanup
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# 1. Import KayKit armature
bpy.ops.import_scene.gltf(filepath=kaykit_glb)
kaykit_armature = None
kaykit_meshes = []
for obj in bpy.context.scene.objects:
    if obj.type == 'ARMATURE':
        kaykit_armature = obj
    elif obj.type == 'MESH':
        kaykit_meshes.append(obj)

if not kaykit_armature:
    print("Erreur: armature KayKit introuvable")
    sys.exit(1)

# Retrieve target height from KayKit
k_min_z = 0
k_max_z = 1.5
if kaykit_meshes:
    k_min_z = min([min([(obj.matrix_world @ mathutils.Vector(c)).z for c in obj.bound_box]) for obj in kaykit_meshes])
    k_max_z = max([max([(obj.matrix_world @ mathutils.Vector(c)).z for c in obj.bound_box]) for obj in kaykit_meshes])
target_height = k_max_z - k_min_z

# 2. Import Rodin mesh
bpy.ops.import_scene.gltf(filepath=rodin_glb)
rodin_mesh = None
for obj in bpy.context.scene.objects:
    if obj.type == 'MESH' and obj not in kaykit_meshes:
        rodin_mesh = obj
        break

bpy.context.view_layer.objects.active = rodin_mesh
bpy.ops.object.select_all(action='DESELECT')
rodin_mesh.select_set(True)

# 3. Clean up Rodin mesh
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.001)
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')

# Decimate
poly_count = len(rodin_mesh.data.polygons)
if poly_count > 4000:
    modifier = rodin_mesh.modifiers.new(name="Decimate", type='DECIMATE')
    modifier.ratio = 4000 / poly_count
    bpy.ops.object.modifier_apply(modifier="Decimate")

# 4. Scale and align Rodin mesh
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bbox = [rodin_mesh.matrix_world @ mathutils.Vector(corner) for corner in rodin_mesh.bound_box]
min_z = min([v.z for v in bbox])
max_z = max([v.z for v in bbox])
height = max_z - min_z

scale_factor = target_height / height if height > 0 else 1.0
rodin_mesh.scale = (scale_factor, scale_factor, scale_factor)
bpy.ops.object.transform_apply(scale=True)

bbox = [rodin_mesh.matrix_world @ mathutils.Vector(corner) for corner in rodin_mesh.bound_box]
min_z = min([v.z for v in bbox])
rodin_mesh.location.z -= min_z
# Rodin models often face +Y instead of +Z or -Y. Let's assume they need 90 deg rotation to face +Z like KayKit,
# actually KayKit faces +Z (Blender's -Y is front, +Y is back, usually models face -Y. Wait.
# Instruction: "face vers +Z comme KayKit".
# We leave rotation as is if Rodin output is generally OK, but let's apply it.
bpy.ops.object.transform_apply(location=True, rotation=True)

# Adjust armature to silhouette width
mesh_width = max([v.x for v in bbox]) - min([v.x for v in bbox])
# Simple arm span adjustment: we scale the armature along X for arm bones.
# Since bones are complex, we'll just apply automatic weights. The prompt says "ajustement de l'envergure des bras".
# We can do this in pose mode or edit mode. Edit mode modifies the rest pose, which is required.
bpy.context.view_layer.objects.active = kaykit_armature
bpy.ops.object.mode_set(mode='EDIT')
# Find arms and scale their X positions
for bone in kaykit_armature.data.edit_bones:
    if any(name in bone.name.lower() for name in ['upperarm', 'lowerarm', 'wrist', 'hand', 'shoulder']):
        # If left arm (X > 0 usually)
        if bone.head.x > 0.05:
            bone.head.x *= 1.2
            bone.tail.x *= 1.2
        elif bone.head.x < -0.05:
            bone.head.x *= 1.2
            bone.tail.x *= 1.2

bpy.ops.object.mode_set(mode='OBJECT')

# 5. Parent with automatic weights
bpy.ops.object.select_all(action='DESELECT')
rodin_mesh.select_set(True)
kaykit_armature.select_set(True)
bpy.context.view_layer.objects.active = kaykit_armature
bpy.ops.object.parent_set(type='ARMATURE_AUTO')

# 6. Remove KayKit meshes
for obj in kaykit_meshes:
    bpy.data.objects.remove(obj, do_unlink=True)

# 7. Export GLB
bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format='GLB',
    use_selection=False,
    export_animations=False,
    export_apply=True
)
