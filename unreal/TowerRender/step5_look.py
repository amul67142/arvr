"""Give the building materials, and pull the camera back off the podium.

The model arrived with six material slots and almost no maps — one colour
texture between them — so everything rendered as white clay. These are plain
PBR values, no textures: a curtain wall reads as glass from tint, metalness and
a near-zero roughness, not from an image.
"""
import unreal

log = unreal.log
tools = unreal.AssetToolsHelpers.get_asset_tools()
MAT_DIR = '/Game/Tower/Materials'

# name fragment -> (base colour, metallic, roughness, specular)
LOOKS = {
    '_GlassReal':    ((0.085, 0.105, 0.135), 0.25, 0.10, 1.0),
    '_WhiteGrey':    ((0.72, 0.71, 0.68), 0.0, 0.55, 0.5),
    'aluminum2':     ((0.56, 0.57, 0.58), 1.0, 0.22, 1.0),
    'Ceramic_Black': ((0.045, 0.045, 0.05), 0.0, 0.35, 0.6),
    'Plaster':       ((0.70, 0.68, 0.64), 0.0, 0.85, 0.3),
    'AO':            ((0.62, 0.61, 0.58), 0.0, 0.70, 0.4),
}


def build(name, colour, metallic, roughness, specular):
    """A flat PBR material — no graph beyond four constants."""
    path = '%s/M_%s' % (MAT_DIR, name)
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        unreal.EditorAssetLibrary.delete_asset(path)
    mat = tools.create_asset('M_%s' % name, MAT_DIR, unreal.Material, unreal.MaterialFactoryNew())
    lib = unreal.MaterialEditingLibrary

    rgb = lib.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -400, 0)
    rgb.set_editor_property('constant', unreal.LinearColor(colour[0], colour[1], colour[2], 1.0))
    lib.connect_material_property(rgb, '', unreal.MaterialProperty.MP_BASE_COLOR)

    for value, slot, y in ((metallic, unreal.MaterialProperty.MP_METALLIC, 150),
                           (roughness, unreal.MaterialProperty.MP_ROUGHNESS, 260),
                           (specular, unreal.MaterialProperty.MP_SPECULAR, 370)):
        node = lib.create_material_expression(mat, unreal.MaterialExpressionConstant, -400, y)
        node.set_editor_property('r', value)
        lib.connect_material_property(node, '', slot)

    lib.recompile_material(mat)
    return mat


built = {}
for key, (colour, metallic, roughness, specular) in LOOKS.items():
    built[key] = build(key.strip('_'), colour, metallic, roughness, specular)
log('BUILT %d materials' % len(built))

# -- hang them on the building --------------------------------------------- --
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
applied = 0
for actor in actors.get_all_level_actors():
    if str(actor.get_folder_path()) != 'Building':
        continue
    component = actor.get_component_by_class(unreal.StaticMeshComponent)
    mesh = component.get_editor_property('static_mesh')
    for slot, material in enumerate(mesh.get_editor_property('static_materials')):
        existing = str(material.get_editor_property('material_slot_name'))
        for key, built_material in built.items():
            if key.lower().strip('_') in existing.lower():
                component.set_material(slot, built_material)
                applied += 1
                break
log('APPLIED %d material slots' % applied)

unreal.EditorAssetLibrary.save_directory('/Game/Tower', only_if_is_dirty=False)
unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
log('LOOK READY')
