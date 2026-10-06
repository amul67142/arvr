"""An orbit video: the camera circling the building, as a studio would deliver.

This is the input Panom takes - a turntable flythrough - which gets split
into frames and becomes the draggable orbit. One degree per frame, 360
frames, 12 s at 30 fps: the frame number is the angle, which keeps the
split-to-frames step trivial and lets a hotspot pass line up later.

Higher than the old hotspot orbit, like a drone: from 115 m the amenity
landscape north of the tower is in shot rather than hidden behind it.
"""
import math
import unreal

FRAMES = 360
FPS = 30
RADIUS = 32000.0
HEIGHT = 11500.0
LOOK_Z = 4000.0
CENTRE = (-1564.0, 2500.0)          # between the tower and the amenities
START_DEG = 90.0                    # begin on the north side, facing the lit face
FOCAL = 30.0
W, H = 1920, 1080
SEQ = '/Game/Tower/Seq/OrbitVideo'
OUT = 'C:/Users/DELL/Documents/Unreal Projects/TowerRender/Saved/Renders/orbit_video'

log = unreal.log
tools = unreal.AssetToolsHelpers.get_asset_tools()
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

# The queue may still reference an older sequence; clear it first.
subsystem = unreal.get_editor_subsystem(unreal.MoviePipelineQueueSubsystem)
queue = subsystem.get_queue()
for job in list(queue.get_jobs()):
    queue.delete_job(job)

for actor in actors.get_all_level_actors():
    if actor.get_actor_label() == 'VideoCamera':
        actors.destroy_actor(actor)
cam = actors.spawn_actor_from_class(unreal.CineCameraActor, unreal.Vector(0, 0, HEIGHT), unreal.Rotator(0, 0, 0))
cam.set_actor_label('VideoCamera')
comp = cam.get_cine_camera_component()
comp.set_editor_property('current_focal_length', FOCAL)
filmback = comp.get_editor_property('filmback')
filmback.set_editor_property('sensor_width', 36.0)
filmback.set_editor_property('sensor_height', 20.25)
comp.set_editor_property('filmback', filmback)
focus = comp.get_editor_property('focus_settings')
focus.set_editor_property('focus_method', unreal.CameraFocusMethod.DISABLE)
comp.set_editor_property('focus_settings', focus)
pp = comp.get_editor_property('post_process_settings')
for prop, value in (('auto_exposure_method', unreal.AutoExposureMethod.AEM_HISTOGRAM),
                    ('auto_exposure_bias', -0.6),
                    ('auto_exposure_min_brightness', 0.8),
                    ('auto_exposure_max_brightness', 1.6)):
    pp.set_editor_property('override_' + prop, True)
    pp.set_editor_property(prop, value)
comp.set_editor_property('post_process_settings', pp)

if unreal.EditorAssetLibrary.does_asset_exist(SEQ):
    seq = unreal.EditorAssetLibrary.load_asset(SEQ)
    for old in list(seq.get_bindings()):
        old.remove()
    for old in list(seq.get_tracks()):
        seq.remove_track(old)
else:
    seq = tools.create_asset('OrbitVideo', '/Game/Tower/Seq', unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
seq.set_display_rate(unreal.FrameRate(FPS, 1))
seq.set_playback_start(0)
seq.set_playback_end(FRAMES)

binding = seq.add_possessable(cam)
section = binding.add_track(unreal.MovieScene3DTransformTrack).add_section()
section.set_range(0, FRAMES)
channels = section.get_all_channels()
LINEAR = unreal.MovieSceneKeyInterpolation.LINEAR

cx, cy = CENTRE
pitch = math.degrees(math.atan2(LOOK_Z - HEIGHT, RADIUS))
for f in range(FRAMES + 1):
    deg = START_DEG + 360.0 * f / FRAMES
    a = math.radians(deg)
    x = cx + RADIUS * math.cos(a)
    y = cy + RADIUS * math.sin(a)
    yaw = deg + 180.0                     # facing the centre, wound on - never wraps
    for channel, value in zip(channels, (x, y, HEIGHT, 0.0, pitch, yaw, 1.0, 1.0, 1.0)):
        channel.add_key(unreal.FrameNumber(f), value, interpolation=LINEAR)

cut = seq.add_track(unreal.MovieSceneCameraCutTrack).add_section()
cut.set_range(0, FRAMES)
bid = unreal.MovieSceneObjectBindingID()
bid.set_editor_property('guid', binding.binding_id)
cut.set_camera_binding_id(bid)
unreal.EditorAssetLibrary.save_asset(SEQ)
log('ORBIT VIDEO sequence %d frames, radius %.0f m, height %.0f m, pitch %.1f' % (
    FRAMES, RADIUS / 100, HEIGHT / 100, pitch))

job = queue.allocate_new_job(unreal.MoviePipelineExecutorJob)
job.set_editor_property('job_name', 'OrbitVideo')
job.set_editor_property('map', unreal.SoftObjectPath('/Game/Tower/Maps/TowerOrbit'))
job.set_editor_property('sequence', unreal.SoftObjectPath(SEQ))
config = job.get_configuration()
config.find_or_add_setting_by_class(unreal.MoviePipelineDeferredPassBase)
jpg = config.find_or_add_setting_by_class(unreal.MoviePipelineImageSequenceOutput_JPG)
try:
    jpg.set_editor_property('quality', 95)
except Exception:
    pass
out = config.find_or_add_setting_by_class(unreal.MoviePipelineOutputSetting)
out.set_editor_property('output_directory', unreal.DirectoryPath(OUT))
out.set_editor_property('output_resolution', unreal.IntPoint(W, H))
out.set_editor_property('file_name_format', '{frame_number}')
out.set_editor_property('zero_pad_frame_numbers', 4)
out.set_editor_property('override_existing_output', True)
aa = config.find_or_add_setting_by_class(unreal.MoviePipelineAntiAliasingSetting)
aa.set_editor_property('spatial_sample_count', 1)
aa.set_editor_property('temporal_sample_count', 4)
aa.set_editor_property('render_warm_up_count', 32)

log('ORBIT VIDEO RENDER START %s' % OUT)
subsystem.render_queue_with_executor(unreal.MoviePipelinePIEExecutor)
