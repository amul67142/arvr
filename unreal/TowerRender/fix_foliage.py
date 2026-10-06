"""Give the foliage real cut-out leaves.

Poly Haven's glTF names each leaf texture "diff-alpha" but ships only the
colour JPEG, so the imported leaves had no alpha to cut with and rendered
invisible. scripts/tools/foliage-alpha.mjs fetched the missing alpha maps and
baked them into RGBA textures; this builds one masked, two-sided foliage
material, makes an instance per leaf texture, and hangs each on the matching
slot of the imported mesh. Setting it on the mesh asset updates every tree
already placed in the level.
"""
import json
import unreal

MANIFEST = 'D:/ar and vr/.cache/amenity/foliage/manifest.json'
DEST = '/Game/Amenity/Foliage'

log = unreal.log
tools = unreal.AssetToolsHelpers.get_asset_tools()
lib = unreal.MaterialEditingLibrary
load = unreal.EditorAssetLibrary.load_asset


def import_texture(path, name, normal=False):
    existing = '%s/%s' % (DEST, name)
    if unreal.EditorAssetLibrary.does_asset_exist(existing):
        unreal.EditorAssetLibrary.delete_asset(existing)
    task = unreal.AssetImportTask()
    task.filename = path
    task.destination_path = DEST
    task.destination_name = name
    task.automated = True
    task.save = True
    task.replace_existing = True
    tools.import_asset_tasks([task])
    texture = load(existing)
    if texture and normal:
        texture.set_editor_property('srgb', False)
        texture.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_NORMALMAP)
    return texture


# -- the master material ---------------------------------------------------- --
master_path = '%s/M_Foliage' % DEST
if unreal.EditorAssetLibrary.does_asset_exist(master_path):
    unreal.EditorAssetLibrary.delete_asset(master_path)
master = tools.create_asset('M_Foliage', DEST, unreal.Material, unreal.MaterialFactoryNew())
master.set_editor_property('blend_mode', unreal.BlendMode.BLEND_MASKED)
master.set_editor_property('two_sided', True)
master.set_editor_property('opacity_mask_clip_value', 0.4)

colour = lib.create_material_expression(master, unreal.MaterialExpressionTextureSampleParameter2D, -600, -150)
colour.set_editor_property('parameter_name', 'Color')
colour.set_editor_property('texture', load('/Engine/EngineResources/DefaultTexture'))
lib.connect_material_property(colour, 'RGB', unreal.MaterialProperty.MP_BASE_COLOR)
lib.connect_material_property(colour, 'A', unreal.MaterialProperty.MP_OPACITY_MASK)

normal = lib.create_material_expression(master, unreal.MaterialExpressionTextureSampleParameter2D, -600, 200)
normal.set_editor_property('parameter_name', 'Normal')
normal.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
normal.set_editor_property('texture', load('/Engine/EngineMaterials/DefaultNormal'))
lib.connect_material_property(normal, '', unreal.MaterialProperty.MP_NORMAL)

for value, slot, y in ((0.7, unreal.MaterialProperty.MP_ROUGHNESS, 450), (0.35, unreal.MaterialProperty.MP_SPECULAR, 550)):
    node = lib.create_material_expression(master, unreal.MaterialExpressionConstant, -400, y)
    node.set_editor_property('r', value)
    lib.connect_material_property(node, '', slot)
lib.recompile_material(master)
log('FOLIAGE master built')

# -- one instance per leaf texture, hung on its mesh ------------------------ --
with open(MANIFEST) as handle:
    entries = json.load(handle)

hung = 0
for entry in entries:
    key = '%s__%s' % (entry['model'], entry['material'])
    rgba = import_texture(entry['rgba'], 'T_%s' % key)
    nrm = import_texture(entry['normal'], 'T_%s_nor' % key, normal=True) if entry['normal'] else None

    mic_path = '%s/MI_%s' % (DEST, key)
    if unreal.EditorAssetLibrary.does_asset_exist(mic_path):
        unreal.EditorAssetLibrary.delete_asset(mic_path)
    mic = tools.create_asset('MI_%s' % key, DEST, unreal.MaterialInstanceConstant,
                             unreal.MaterialInstanceConstantFactoryNew())
    lib.set_material_instance_parent(mic, master)
    lib.set_material_instance_texture_parameter_value(mic, 'Color', rgba)
    if nrm:
        lib.set_material_instance_texture_parameter_value(mic, 'Normal', nrm)
    lib.update_material_instance(mic)

    folder = '/Game/Amenity/Models/%s' % entry['model']
    for path in unreal.EditorAssetLibrary.list_assets(folder, recursive=True, include_folder=False):
        mesh = load(path)
        if not isinstance(mesh, unreal.StaticMesh):
            continue
        slots = mesh.get_editor_property('static_materials')
        for index, slot in enumerate(slots):
            current = slot.get_editor_property('material_interface')
            name = str(slot.get_editor_property('material_slot_name'))
            if name == entry['material'] or (current and current.get_name() == entry['material']):
                mesh.set_material(index, mic)
                hung += 1
        unreal.EditorAssetLibrary.save_loaded_asset(mesh)

unreal.EditorAssetLibrary.save_directory(DEST, only_if_is_dirty=False)
log('FOLIAGE %d materials, hung on %d mesh slots' % (len(entries), hung))
