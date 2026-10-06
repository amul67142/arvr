"""Import the high-rise FBX and report what Unreal made of it.

Nothing is placed or lit yet: the one thing that must be right before anything
else is the scale. Unreal works in centimetres, the file came out of Blender,
and a wrong unit here quietly ruins every camera distance later.
"""
import unreal

FBX = r"C:/Users/DELL/Downloads/high_rise_building.fbx"
DEST = "/Game/Tower/Mesh"

log = unreal.log

# The project opened on the open-world template: a landscape we do not want and
# cannot afford on this card. An empty level first, then the building.
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
levels.new_level('/Game/Tower/Maps/TowerOrbit')
log('NEW LEVEL /Game/Tower/Maps/TowerOrbit')

task = unreal.AssetImportTask()
task.filename = FBX
task.destination_path = DEST
task.automated = True
task.save = True
task.replace_existing = True

opts = unreal.FbxImportUI()
opts.import_mesh = True
opts.import_as_skeletal = False
opts.import_materials = True
opts.import_textures = True
opts.static_mesh_import_data.combine_meshes = False      # keep the 27 objects apart
opts.static_mesh_import_data.convert_scene = True        # Z-up -> Unreal
opts.static_mesh_import_data.import_uniform_scale = 1.0
opts.static_mesh_import_data.generate_lightmap_u_vs = False
task.options = opts

unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])

paths = list(task.get_editor_property('imported_object_paths') or [])
log('IMPORTED %d objects' % len(paths))

registry = unreal.AssetRegistryHelpers.get_asset_registry()
meshes = []
for asset in registry.get_assets_by_path(unreal.Name(DEST), recursive=True):
    obj = asset.get_asset()
    if isinstance(obj, unreal.StaticMesh):
        meshes.append(obj)

log('STATIC MESHES %d' % len(meshes))
lo = [1e9, 1e9, 1e9]
hi = [-1e9, -1e9, -1e9]
for mesh in meshes:
    origin, extent = mesh.get_bounds().box_extent, mesh.get_bounds().box_extent
    b = mesh.get_bounding_box()
    for i, axis in enumerate(('x', 'y', 'z')):
        lo[i] = min(lo[i], getattr(b.min, axis))
        hi[i] = max(hi[i], getattr(b.max, axis))
    log('  %-34s tris=%7d  size=[%8.1f %8.1f %8.1f]' % (
        mesh.get_name(),
        mesh.get_num_triangles(0),
        b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z))

log('MODEL BOUNDS  min=[%.1f %.1f %.1f]  max=[%.1f %.1f %.1f]' % (lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]))
log('MODEL SIZE    %.1f x %.1f x %.1f uu   (=%.1f x %.1f x %.1f m if 1uu=1cm)' % (
    hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2],
    (hi[0] - lo[0]) / 100, (hi[1] - lo[1]) / 100, (hi[2] - lo[2]) / 100))
