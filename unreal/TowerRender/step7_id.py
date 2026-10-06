"""Render the ID pass: the same 96 camera positions, flat colour per home.

Identical camera, identical sequence — so a polygon traced out of an ID frame
lands exactly on the matching beauty frame. The building goes black so it still
occludes but reads as background, the boxes come out of hiding, and every
smoothing step that would blend two homes' colours together is switched off.
"""
import unreal

OUT = 'C:/Users/DELL/Documents/Unreal Projects/TowerRender/Saved/Renders/id'
ID_DIR = '/Game/Tower/ID'
W, H = 1920, 1080

log = unreal.log
tools = unreal.AssetToolsHelpers.get_asset_tools()
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
lib = unreal.MaterialEditingLibrary

# -- black, unlit: present for occlusion, invisible as an identity ---------- --
path = '%s/M_IDBlack' % ID_DIR
if not unreal.EditorAssetLibrary.does_asset_exist(path):
    black = tools.create_asset('M_IDBlack', ID_DIR, unreal.Material, unreal.MaterialFactoryNew())
    black.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_UNLIT)
    node = lib.create_material_expression(black, unreal.MaterialExpressionConstant3Vector, -400, 0)
    node.set_editor_property('constant', unreal.LinearColor(0.0, 0.0, 0.0, 1.0))
    lib.connect_material_property(node, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    lib.recompile_material(black)
else:
    black = unreal.EditorAssetLibrary.load_asset(path)

blacked = 0
shown = 0
for actor in actors.get_all_level_actors():
    folder = str(actor.get_folder_path())
    if folder == 'Building':
        component = actor.get_component_by_class(unreal.StaticMeshComponent)
        for slot in range(component.get_num_materials()):
            component.set_material(slot, black)
        blacked += 1
    elif folder == 'Units':
        actor.set_actor_hidden_in_game(False)
        shown += 1
log('BLACKED %d building actors · SHOWING %d unit boxes' % (blacked, shown))

# The sky would light nothing (everything is unlit now) but it would still be
# a bright background colour that could collide with an ID; make it black.
for actor in actors.get_all_level_actors():
    if actor.get_actor_label() in ('SkyAtmosphere', 'HeightFog', 'Sun', 'SkyLight'):
        actor.set_actor_hidden_in_game(True)

# -- the render ------------------------------------------------------------- --
subsystem = unreal.get_editor_subsystem(unreal.MoviePipelineQueueSubsystem)
queue = subsystem.get_queue()
for job in list(queue.get_jobs()):
    queue.delete_job(job)

job = queue.allocate_new_job(unreal.MoviePipelineExecutorJob)
job.set_editor_property('job_name', 'TowerOrbitID')
job.set_editor_property('map', unreal.SoftObjectPath('/Game/Tower/Maps/TowerOrbit'))
job.set_editor_property('sequence', unreal.SoftObjectPath('/Game/Tower/Seq/OrbitSeq'))

config = job.get_configuration()
try:
    config.find_or_add_setting_by_class(unreal.MoviePipelineDeferredPass_Unlit)
    log('PASS unlit deferred')
except Exception:
    config.find_or_add_setting_by_class(unreal.MoviePipelineDeferredPassBase)
    log('PASS deferred (unlit class not available)')
config.find_or_add_setting_by_class(unreal.MoviePipelineImageSequenceOutput_PNG)

out = config.find_or_add_setting_by_class(unreal.MoviePipelineOutputSetting)
out.set_editor_property('output_directory', unreal.DirectoryPath(OUT))
out.set_editor_property('output_resolution', unreal.IntPoint(W, H))
out.set_editor_property('file_name_format', '{frame_number}')
out.set_editor_property('zero_pad_frame_numbers', 4)
out.set_editor_property('override_existing_output', True)

# One sample, no accumulation: an averaged pixel is a colour that means nothing.
aa = config.find_or_add_setting_by_class(unreal.MoviePipelineAntiAliasingSetting)
aa.set_editor_property('spatial_sample_count', 1)
aa.set_editor_property('temporal_sample_count', 1)
aa.set_editor_property('override_anti_aliasing', True)
aa.set_editor_property('anti_aliasing_method', unreal.AntiAliasingMethod.AAM_NONE)
aa.set_editor_property('render_warm_up_count', 8)

cvars = config.find_or_add_setting_by_class(unreal.MoviePipelineConsoleVariableSetting)
WANTED = {
    'r.ToneCurve': 0.0,
    'r.Tonemapper.Quality': 0.0,
    'r.Tonemapper.Sharpen': 0.0,
    'r.DefaultFeature.AutoExposure': 0.0,
    'r.DefaultFeature.Bloom': 0.0,
    'r.DefaultFeature.MotionBlur': 0.0,
    'r.DefaultFeature.AntiAliasing': 0.0,
    'r.PostProcessAAQuality': 0.0,
    'r.MotionBlurQuality': 0.0,
    'r.ScreenPercentage': 100.0,
}
for name, value in WANTED.items():
    cvars.add_or_update_console_variable(name, value)
log('CVARS %d applied' % len(WANTED))

log('ID RENDER START %s' % OUT)
subsystem.render_queue_with_executor(unreal.MoviePipelinePIEExecutor)
