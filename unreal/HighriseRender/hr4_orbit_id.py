"""The high-rise ID pass (a copy of step20): every Highrise_ actor gets the lookup colours.

The ID pass for the orbit video: same camera, every home a flat colour.

Uses the surface lookup from step 14, so the coloured regions are the tower's
own curved facade rather than boxes. The amenity landscape is hidden: its
lit materials would come out as stray colours in an unlit pass, and at 320 m
nothing in it stands higher than the first residential floor, so hiding it
changes no home's outline. Run restore_beauty.py afterwards.
"""
import unreal

SEQ = '/Game/Highrise/Seq/OrbitVideo'
OUT = 'C:/Users/DELL/Documents/Unreal Projects/HighriseRender/Saved/Renders/orbitv/id'
TOWER = ('glass_003', 'panels', 'profile_001', 'balcony_001', 'balcony_003', 'metal', 'floor')
W, H = 1920, 1080

log = unreal.log
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
load = unreal.EditorAssetLibrary.load_asset

subsystem = unreal.get_editor_subsystem(unreal.MoviePipelineQueueSubsystem)
queue = subsystem.get_queue()
for job in list(queue.get_jobs()):
    queue.delete_job(job)

surface = load('/Game/Highrise/ID/M_IDSurface')
black = load('/Game/Highrise/ID/M_IDBlack')
if not surface or not black:
    raise RuntimeError('ID materials missing - run hr2_idsurface.py first')

counts = {'painted': 0, 'blacked': 0, 'hidden': 0}
for actor in actors.get_all_level_actors():
    folder = str(actor.get_folder_path())
    label = actor.get_actor_label()
    if folder in ('Building', 'Site'):
        component = actor.get_component_by_class(unreal.StaticMeshComponent)
        wanted = surface if label.startswith('Highrise_') else black
        for slot in range(component.get_num_materials()):
            component.set_material(slot, wanted)
        counts['painted' if label.startswith('Highrise_') else 'blacked'] += 1
    elif folder == 'Units' or folder.startswith('Amenities') or label in (
            'SkyAtmosphere', 'HeightFog', 'Sun', 'SkyLight', 'HDRIBackdrop'):
        actor.set_actor_hidden_in_game(True)
        counts['hidden'] += 1
log('ORBIT ID painted %(painted)d · blacked %(blacked)d · hidden %(hidden)d' % counts)

job = queue.allocate_new_job(unreal.MoviePipelineExecutorJob)
job.set_editor_property('job_name', 'OrbitVideoID')
job.set_editor_property('map', unreal.SoftObjectPath('/Game/Tower/Maps/TowerOrbit'))
job.set_editor_property('sequence', unreal.SoftObjectPath(SEQ))
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
cvars = config.find_or_add_setting_by_class(unreal.MoviePipelineConsoleVariableSetting)
for name, value in (('r.Tonemapper.Quality', 0.0), ('r.DefaultFeature.AutoExposure', 0.0),
                    ('r.DefaultFeature.Bloom', 0.0), ('r.DefaultFeature.MotionBlur', 0.0),
                    ('r.MotionBlurQuality', 0.0), ('r.ScreenPercentage', 100.0)):
    cvars.add_or_update_console_variable(name, value)

log('ORBIT ID RENDER START %s' % OUT)
subsystem.render_queue_with_executor(unreal.MoviePipelinePIEExecutor)
