"""Render equirectangular 360s at a set of stops around the building.

One camera, teleported to each stop, one frame per stop, rendered through the
panoramic pass. The heading is held at zero for every stop so the tour can
trust a single north: a walkthrough that turns the world by a different amount
at each node makes people lose their bearings between one stop and the next.
"""
import unreal

OUT = 'C:/Users/DELL/Documents/Unreal Projects/TowerRender/Saved/Renders/pano'
W, H = 4096, 2048
EYE = 160.0          # 1.6 m, standing height

# name, x, y, z  — kept clear of the geometry so no stop opens inside a wall
STOPS = [
    ('approach',  -1564.0, -7200.0,  EYE),
    ('forecourt', -1564.0, -4200.0,  EYE),
    ('podium',    -1564.0, -2300.0,  1530.0 + EYE),
    ('deck',       2600.0,  1800.0,  1530.0 + EYE),
    ('skyline',   -1564.0, -5200.0,  7000.0),
    ('roof',      -1564.0,   -90.0,  10100.0),
]

log = unreal.log
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
tools = unreal.AssetToolsHelpers.get_asset_tools()

# -- a camera for the panoramas -------------------------------------------- --
for actor in actors.get_all_level_actors():
    if actor.get_actor_label() == 'PanoCamera':
        actors.destroy_actor(actor)

cam = actors.spawn_actor_from_class(
    unreal.CineCameraActor, unreal.Vector(*STOPS[0][1:]), unreal.Rotator(0, 0, 0))
cam.set_actor_label('PanoCamera')

# A fresh camera comes with default exposure; match the orbit's so the
# panoramas and the turntable are the same photograph of the same building.
comp = cam.get_cine_camera_component()
pp = comp.get_editor_property('post_process_settings')
pp.set_editor_property('override_auto_exposure_method', True)
pp.set_editor_property('auto_exposure_method', unreal.AutoExposureMethod.AEM_HISTOGRAM)
pp.set_editor_property('override_auto_exposure_bias', True)
pp.set_editor_property('auto_exposure_bias', -0.6)
pp.set_editor_property('override_auto_exposure_min_brightness', True)
pp.set_editor_property('auto_exposure_min_brightness', 0.8)
pp.set_editor_property('override_auto_exposure_max_brightness', True)
pp.set_editor_property('auto_exposure_max_brightness', 1.6)
comp.set_editor_property('post_process_settings', pp)

# -- a sequence: one frame per stop ---------------------------------------- --
path = '/Game/Tower/Seq/PanoSeq'
if unreal.EditorAssetLibrary.does_asset_exist(path):
    unreal.EditorAssetLibrary.delete_asset(path)
seq = tools.create_asset('PanoSeq', '/Game/Tower/Seq', unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
seq.set_display_rate(unreal.FrameRate(24, 1))
seq.set_playback_start(0)
seq.set_playback_end(len(STOPS))

binding = seq.add_possessable(cam)
section = binding.add_track(unreal.MovieScene3DTransformTrack).add_section()
section.set_range(0, len(STOPS))
channels = section.get_all_channels()

# Constant keys: the camera must be exactly at a stop on that stop's frame,
# never interpolating between two of them.
CONSTANT = unreal.MovieSceneKeyInterpolation.CONSTANT
for index, (name, x, y, z) in enumerate(STOPS):
    key = unreal.FrameNumber(index)
    for channel, value in zip(channels, (x, y, z, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0)):
        channel.add_key(key, value, interpolation=CONSTANT)
    log('  stop %d %-10s [%.0f %.0f %.0f]' % (index, name, x, y, z))

cuts = seq.add_track(unreal.MovieSceneCameraCutTrack)
cut = cuts.add_section()
cut.set_range(0, len(STOPS))
bid = unreal.MovieSceneObjectBindingID()
bid.set_editor_property('guid', binding.binding_id)
cut.set_camera_binding_id(bid)
unreal.EditorAssetLibrary.save_asset(path)
log('PANO SEQUENCE %d stops' % len(STOPS))

# -- render ----------------------------------------------------------------- --
subsystem = unreal.get_editor_subsystem(unreal.MoviePipelineQueueSubsystem)
queue = subsystem.get_queue()
for job in list(queue.get_jobs()):
    queue.delete_job(job)

job = queue.allocate_new_job(unreal.MoviePipelineExecutorJob)
job.set_editor_property('job_name', 'TowerPano')
job.set_editor_property('map', unreal.SoftObjectPath('/Game/Tower/Maps/TowerOrbit'))
job.set_editor_property('sequence', unreal.SoftObjectPath(path))

config = job.get_configuration()
config.find_or_add_setting_by_class(unreal.MoviePipelinePanoramicPass)
config.find_or_add_setting_by_class(unreal.MoviePipelineImageSequenceOutput_JPG)

out = config.find_or_add_setting_by_class(unreal.MoviePipelineOutputSetting)
out.set_editor_property('output_directory', unreal.DirectoryPath(OUT))
out.set_editor_property('output_resolution', unreal.IntPoint(W, H))
out.set_editor_property('file_name_format', '{frame_number}')
out.set_editor_property('zero_pad_frame_numbers', 4)
out.set_editor_property('override_existing_output', True)

aa = config.find_or_add_setting_by_class(unreal.MoviePipelineAntiAliasingSetting)
aa.set_editor_property('spatial_sample_count', 1)
aa.set_editor_property('temporal_sample_count', 1)
aa.set_editor_property('render_warm_up_count', 24)

with open('C:/Users/DELL/Documents/Unreal Projects/TowerRender/Saved/Renders/pano-stops.csv', 'w') as handle:
    handle.write('frame,name,x,y,z\n')
    for index, (name, x, y, z) in enumerate(STOPS):
        handle.write('%04d,%s,%.0f,%.0f,%.0f\n' % (index, name, x, y, z))

log('PANO RENDER START %s  %dx%d' % (OUT, W, H))
subsystem.render_queue_with_executor(unreal.MoviePipelinePIEExecutor)
