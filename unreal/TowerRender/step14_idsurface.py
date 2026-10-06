"""Colour the tower itself for the ID pass, instead of boxes standing in for it.

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

LOOKUP = 'C:/Users/DELL/Documents/Unreal Projects/TowerRender/Saved/Lookup'
ID_DIR = '/Game/Tower/ID'
OUT = 'C:/Users/DELL/Documents/Unreal Projects/TowerRender/Saved/Renders/id'
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

# -- black for everything that is not a home -------------------------------- --
black = unreal.EditorAssetLibrary.load_asset('%s/M_IDBlack' % ID_DIR)

painted = 0
blacked = 0
for actor in actors.get_all_level_actors():
    folder = str(actor.get_folder_path())
    label = actor.get_actor_label()
    if folder == 'Units':
        actor.set_actor_hidden_in_game(True)          # the boxes are retired
    elif folder in ('Building', 'Site'):
        component = actor.get_component_by_class(unreal.StaticMeshComponent)
        wanted = mat if label in TOWER else black
        for slot in range(component.get_num_materials()):
            component.set_material(slot, wanted)
        if label in TOWER:
            painted += 1
        else:
            blacked += 1
    elif label in ('SkyAtmosphere', 'HeightFog', 'Sun', 'SkyLight', 'HDRIBackdrop'):
        actor.set_actor_hidden_in_game(True)
log('PAINTED %d tower meshes · %d blacked' % (painted, blacked))

# -- render ----------------------------------------------------------------- --
subsystem = unreal.get_editor_subsystem(unreal.MoviePipelineQueueSubsystem)
queue = subsystem.get_queue()
for job in list(queue.get_jobs()):
    queue.delete_job(job)

job = queue.allocate_new_job(unreal.MoviePipelineExecutorJob)
job.set_editor_property('job_name', 'TowerOrbitIDSurface')
job.set_editor_property('map', unreal.SoftObjectPath('/Game/Tower/Maps/TowerOrbit'))
job.set_editor_property('sequence', unreal.SoftObjectPath('/Game/Tower/Seq/OrbitSeq'))

config = job.get_configuration()
config.find_or_add_setting_by_class(unreal.MoviePipelineDeferredPass_Unlit)
config.find_or_add_setting_by_class(unreal.MoviePipelineImageSequenceOutput_PNG)

out = config.find_or_add_setting_by_class(unreal.MoviePipelineOutputSetting)
out.set_editor_property('output_directory', unreal.DirectoryPath(OUT))
out.set_editor_property('output_resolution', unreal.IntPoint(W, H))
out.set_editor_property('file_name_format', '{frame_number}')
out.set_editor_property('zero_pad_frame_numbers', 4)
out.set_editor_property('override_existing_output', True)

aa = config.find_or_add_setting_by_class(unreal.MoviePipelineAntiAliasingSetting)
aa.set_editor_property('spatial_sample_count', 1)
aa.set_editor_property('temporal_sample_count', 1)
aa.set_editor_property('override_anti_aliasing', True)
aa.set_editor_property('anti_aliasing_method', unreal.AntiAliasingMethod.AAM_NONE)
aa.set_editor_property('render_warm_up_count', 8)

log('ID SURFACE RENDER START %s' % OUT)
subsystem.render_queue_with_executor(unreal.MoviePipelinePIEExecutor)
