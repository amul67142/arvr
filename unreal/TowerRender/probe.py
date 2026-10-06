import unreal
load = unreal.EditorAssetLibrary.load_asset
t = load('/Game/Amenity/Foliage/T_island_tree_02__island_tree_02_leaves')
unreal.log('PROBE tex size %sx%s srgb %s comp %s no_alpha %s' % (t.blueprint_get_size_x(), t.blueprint_get_size_y(),
    t.get_editor_property('srgb'), t.get_editor_property('compression_settings'), t.get_editor_property('compression_no_alpha')))
m = load('/Game/Amenity/Foliage/M_Foliage')
unreal.log('PROBE mat blend %s twosided %s clip %s' % (m.get_editor_property('blend_mode'), m.get_editor_property('two_sided'), m.get_editor_property('opacity_mask_clip_value')))
mesh = load('/Game/Amenity/Models/island_tree_02/island_tree_02/StaticMeshes/island_tree_02')
ns = mesh.get_editor_property('nanite_settings')
unreal.log('PROBE mesh nanite %s sections %s' % (ns.get_editor_property('enabled'), mesh.get_num_sections(0)))
for i in range(mesh.get_num_sections(0)):
    unreal.log('PROBE  section %d material_index %s' % (i, unreal.StaticMeshEditorSubsystem and i))
