"""The high-rise's ID material: the same lookup as the tower's (build_id_surface.py),
fed by the high-rise lookups from `node scripts/make-id-lookup.mjs <Saved/Lookup> highrise`.

(Material part of step14.) Colour the tower itself for the ID pass, instead of boxes standing in for it.

The boxes gave rectangular hotspots on a building with curved walls and wavy
balconies, because a box silhouette is all a box can ever be. This puts the ID
colour on the real geometry: a material that reads where a pixel is in the
world, looks up which home that is in a plan image and which storey it is in a
floor strip, and multiplies the two. The coloured region then IS the facade -
every curve and every overhang included, with no stand-in shape anywhere.

Outside the residential band the floor strip is black, so the product is black
and the crown, the podium and the plant room read as background.
"""
import json
import unreal

LOOKUP = 'C:/Users/DELL/Documents/Unreal Projects/HighriseRender/Saved/Lookup'
ID_DIR = '/Game/Highrise/ID'
OUT = 'C:/Users/DELL/Documents/Unreal Projects/HighriseRender/Saved/Renders/id'
TOWER = ('glass_003', 'panels', 'profile_001', 'balcony_001', 'balcony_003', 'metal', 'floor')
W, H = 1920, 1080

log = unreal.log
tools = unreal.AssetToolsHelpers.get_asset_tools()
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
lib = unreal.MaterialEditingLibrary

with open('%s/mapping.json' % LOOKUP) as handle:
    m = json.load(handle)


def import_lookup(name):
    task = unreal.AssetImportTask()
    task.filename = '%s/%s.png' % (LOOKUP, name)
    task.destination_path = ID_DIR
    task.destination_name = 'T_%s' % name
    task.automated = True
    task.save = True
    task.replace_existing = True
    tools.import_asset_tasks([task])
    paths = list(task.get_editor_property('imported_object_paths') or [])
    texture = unreal.EditorAssetLibrary.load_asset(paths[0]) if paths else None
    if texture:
        # Exact bytes: no colour conversion, no mip blending, no filtering.
        texture.set_editor_property('srgb', False)
        texture.set_editor_property('compression_settings',
                                    unreal.TextureCompressionSettings.TC_VECTOR_DISPLACEMENTMAP)
        texture.set_editor_property('mip_gen_settings',
                                    unreal.TextureMipGenSettings.TMGS_NO_MIPMAPS)
        texture.set_editor_property('filter', unreal.TextureFilter.TF_NEAREST)
        texture.set_editor_property('address_x', unreal.TextureAddress.TA_CLAMP)
        texture.set_editor_property('address_y', unreal.TextureAddress.TA_CLAMP)
    return texture


plan = import_lookup('plan')
floors = import_lookup('floors')
log('LOOKUPS %s %s' % (plan.get_name() if plan else 'FAILED', floors.get_name() if floors else 'FAILED'))

# -- the material ----------------------------------------------------------- --
path = '%s/M_IDSurface' % ID_DIR
if unreal.EditorAssetLibrary.does_asset_exist(path):
    unreal.EditorAssetLibrary.delete_asset(path)
mat = tools.create_asset('M_IDSurface', ID_DIR, unreal.Material, unreal.MaterialFactoryNew())
mat.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_UNLIT)

position = lib.create_material_expression(mat, unreal.MaterialExpressionWorldPosition, -1700, 0)

# where in the plan
xy = lib.create_material_expression(mat, unreal.MaterialExpressionComponentMask, -1450, -300)
xy.set_editor_property('r', True)
xy.set_editor_property('g', True)
xy.set_editor_property('b', False)
xy.set_editor_property('a', False)
lib.connect_material_expressions(position, '', xy, '')

origin = lib.create_material_expression(mat, unreal.MaterialExpressionConstant2Vector, -1450, -180)
origin.set_editor_property('r', float(m['PLATE'][0]))
origin.set_editor_property('g', float(m['PLATE'][1]))

shift = lib.create_material_expression(mat, unreal.MaterialExpressionSubtract, -1200, -300)
lib.connect_material_expressions(xy, '', shift, 'A')
lib.connect_material_expressions(origin, '', shift, 'B')

inv = lib.create_material_expression(mat, unreal.MaterialExpressionConstant2Vector, -1200, -160)
inv.set_editor_property('r', 1.0 / (m['PLATE'][2] - m['PLATE'][0]))
inv.set_editor_property('g', 1.0 / (m['PLATE'][3] - m['PLATE'][1]))

plan_uv = lib.create_material_expression(mat, unreal.MaterialExpressionMultiply, -950, -300)
lib.connect_material_expressions(shift, '', plan_uv, 'A')
lib.connect_material_expressions(inv, '', plan_uv, 'B')

plan_sample = lib.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -700, -300)
plan_sample.set_editor_property('texture', plan)
plan_sample.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
lib.connect_material_expressions(plan_uv, '', plan_sample, 'UVs')

# how high up
z = lib.create_material_expression(mat, unreal.MaterialExpressionComponentMask, -1450, 300)
z.set_editor_property('r', False)
z.set_editor_property('g', False)
z.set_editor_property('b', True)
z.set_editor_property('a', False)
lib.connect_material_expressions(position, '', z, '')

drop = lib.create_material_expression(mat, unreal.MaterialExpressionSubtract, -1200, 300)
lib.connect_material_expressions(z, '', drop, 'A')
drop.set_editor_property('const_b', float(m['Z_MIN']))

scale = lib.create_material_expression(mat, unreal.MaterialExpressionMultiply, -1000, 300)
lib.connect_material_expressions(drop, '', scale, 'A')
scale.set_editor_property('const_b', 1.0 / float(m['Z_RANGE']))

half = lib.create_material_expression(mat, unreal.MaterialExpressionConstant, -1000, 430)
half.set_editor_property('r', 0.5)

floor_uv = lib.create_material_expression(mat, unreal.MaterialExpressionAppendVector, -820, 300)
lib.connect_material_expressions(half, '', floor_uv, 'A')
lib.connect_material_expressions(scale, '', floor_uv, 'B')

floor_sample = lib.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -620, 300)
floor_sample.set_editor_property('texture', floors)
floor_sample.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_LINEAR_COLOR)
lib.connect_material_expressions(floor_uv, '', floor_sample, 'UVs')

combine = lib.create_material_expression(mat, unreal.MaterialExpressionMultiply, -320, 0)
lib.connect_material_expressions(plan_sample, '', combine, 'A')
lib.connect_material_expressions(floor_sample, '', combine, 'B')
lib.connect_material_property(combine, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR)
lib.recompile_material(mat)
log('ID SURFACE material built')


black_path = '%s/M_IDBlack' % ID_DIR
if not unreal.EditorAssetLibrary.does_asset_exist(black_path):
    black = tools.create_asset('M_IDBlack', ID_DIR, unreal.Material, unreal.MaterialFactoryNew())
    black.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_UNLIT)
    node = lib.create_material_expression(black, unreal.MaterialExpressionConstant3Vector, -400, 0)
    node.set_editor_property('constant', unreal.LinearColor(0.0, 0.0, 0.0, 1.0))
    lib.connect_material_property(node, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    lib.recompile_material(black)
    log('ID BLACK rebuilt')

unreal.EditorAssetLibrary.save_loaded_asset(mat)
unreal.EditorAssetLibrary.save_directory(ID_DIR, only_if_is_dirty=False)
log('ID SURFACE material saved')
