"""Import one tree and report what Interchange made of it, before trusting it
with a whole garden."""
import unreal

tools = unreal.AssetToolsHelpers.get_asset_tools()
DEST = '/Game/Amenity/Models/island_tree_01'

task = unreal.AssetImportTask()
task.filename = 'D:/ar and vr/.cache/amenity/models/island_tree_01/island_tree_01.gltf'
task.destination_path = DEST
task.automated = True
task.save = True
task.replace_existing = True
tools.import_asset_tasks([task])

for path in unreal.EditorAssetLibrary.list_assets(DEST, recursive=True, include_folder=False):
    asset = unreal.EditorAssetLibrary.load_asset(path)
    line = 'PROBE %-60s %s' % (path.split('.')[0], type(asset).__name__)
    if isinstance(asset, unreal.StaticMesh):
        b = asset.get_bounding_box()
        line += '  size=[%.0f %.0f %.0f] tris=%d' % (b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z,
                                                   asset.get_num_triangles(0))
        for slot in asset.get_editor_property('static_materials'):
            mi = slot.get_editor_property('material_interface')
            parent = mi.get_editor_property('parent') if isinstance(mi, unreal.MaterialInstance) else None
            line += '\n      slot %s -> %s (parent %s, blend %s)' % (
                slot.get_editor_property('material_slot_name'), mi.get_name() if mi else None,
                parent.get_path_name() if parent else '-',
                mi.get_blend_mode() if hasattr(mi, 'get_blend_mode') else '?')
    unreal.log(line)
