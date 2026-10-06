"""The 360 video: nine slow shots through the site, joined by fades to black.

Built for a headset as much as a screen, which sets the rules:

  constant speed within a shot     acceleration is what makes people queasy
  camera always level              no pitch, no roll, ever
  walking pace on the ground       about 2.5-3.5 m/s
  cuts hidden inside fades         a jump between two places is fine in black

Each shot faces the way it travels, so a viewer who never turns their head
still sees where they are going. Motion blur is off: a 360 frame that smears
across a cut is visible from every direction at once.

Set TEST to a (start, end) frame range to time a handful of frames before
committing to the whole render.
"""
import unreal

FPS = 30
EYE_GROUND = 165.0
EYE_SLAB = 290.0
FADE = 12
TEST = None                     # e.g. (240, 246) - renders to a separate _test folder
PATCH = [(0, 510), (1050, 1380)]  # ranges re-rendered into the real folder, one queued job each
OUT = 'C:/Users/DELL/Documents/Unreal Projects/TowerRender/Saved/Renders/tour360'
W, H = 4096, 2048
SEQ = '/Game/Tower/Seq/Tour360'

# name, seconds, start (x, y, z), end (x, y, z), yaw (0 = +X, 90 = +Y)
SHOTS = [
    # Opening from the north, where the tower is lit and the whole amenity
    # landscape is laid out below. Same 17 s as the two ground-level shots it
    # replaced, so every later frame of an earlier render stays valid.
    ('AerialNorth', 9, (4500, 24000, 7000), (1500, 19000, 6000), -110.0),
    ('Descent',     8, (-1500, 16500, 2400), (-1500, 12500, 900), -90.0),
    ('Garden',     8, (-1200, 3400, EYE_SLAB), (-1200, 5300, EYE_SLAB), 90.0),
    ('Pool',      10, (-2800, 6220, EYE_SLAB), (0, 6220, EYE_SLAB), 0.0),
    ('Clubhouse', 11, (300, 6700, EYE_SLAB), (3250, 6700, EYE_SLAB), 0.0),
    ('KidsPlay',   8, (-5550, 5300, EYE_SLAB), (-5950, 7200, EYE_SLAB), 102.0),
    ('Track',     10, (-7600, 11050, EYE_SLAB), (-3600, 11050, EYE_SLAB), 0.0),
    ('Rise',      12, (-1500, 3300, 450), (-1500, 3300, 9200), -90.0),
    ('Aerial',    10, (-1500, 3300, 11600), (-1500, -1200, 12600), -90.0),
]

log = unreal.log
tools = unreal.AssetToolsHelpers.get_asset_tools()
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

# The render queue can still hold the last job's sequence. Clear it before
# touching anything that job points at - deleting a sequence it still
# references is an access violation, which is how this crashed the editor once.
subsystem = unreal.get_editor_subsystem(unreal.MoviePipelineQueueSubsystem)
queue = subsystem.get_queue()
for job in list(queue.get_jobs()):
    queue.delete_job(job)

# -- the camera, with the same exposure as the stills ----------------------- --
for actor in actors.get_all_level_actors():
    if actor.get_actor_label() == 'TourCamera':
        actors.destroy_actor(actor)
cam = actors.spawn_actor_from_class(unreal.CineCameraActor, unreal.Vector(*SHOTS[0][2]), unreal.Rotator(0, 0, 0))
cam.set_actor_label('TourCamera')
comp = cam.get_cine_camera_component()
pp = comp.get_editor_property('post_process_settings')
for prop, value in (('auto_exposure_method', unreal.AutoExposureMethod.AEM_HISTOGRAM),
                    ('auto_exposure_bias', -0.6),
                    ('auto_exposure_min_brightness', 0.8),
                    ('auto_exposure_max_brightness', 1.6),
                    ('motion_blur_amount', 0.0)):
    pp.set_editor_property('override_' + prop, True)
    pp.set_editor_property(prop, value)
comp.set_editor_property('post_process_settings', pp)

# -- the sequence ----------------------------------------------------------- --
# Reuse the asset and empty it, rather than deleting something that may be
# open or referenced elsewhere.
if unreal.EditorAssetLibrary.does_asset_exist(SEQ):
    seq = unreal.EditorAssetLibrary.load_asset(SEQ)
    for old in list(seq.get_bindings()):
        old.remove()
    for old in list(seq.get_tracks()):
        seq.remove_track(old)
else:
    seq = tools.create_asset('Tour360', '/Game/Tower/Seq', unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
seq.set_display_rate(unreal.FrameRate(FPS, 1))
total = sum(int(s[1] * FPS) for s in SHOTS)
seq.set_playback_start(0)
seq.set_playback_end(total)

binding = seq.add_possessable(cam)
section = binding.add_track(unreal.MovieScene3DTransformTrack).add_section()
section.set_range(0, total)
channels = section.get_all_channels()
LINEAR = unreal.MovieSceneKeyInterpolation.LINEAR

cuts = []
frame = 0
for name, seconds, start, end, yaw in SHOTS:
    length = int(seconds * FPS)
    last = frame + length - 1
    for at, point in ((frame, start), (last, end)):
        for channel, value in zip(channels, (point[0], point[1], point[2], 0.0, 0.0, yaw, 1.0, 1.0, 1.0)):
            channel.add_key(unreal.FrameNumber(at), float(value), interpolation=LINEAR)
    log('  shot %-10s frames %4d-%4d  %.1f m at %.1f m/s' % (
        name, frame, last,
        ((end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2 + (end[2] - start[2]) ** 2) ** 0.5 / 100.0,
        ((end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2 + (end[2] - start[2]) ** 2) ** 0.5 / 100.0 / seconds))
    cuts.append(frame)
    frame += length

cut_track = seq.add_track(unreal.MovieSceneCameraCutTrack)
cut = cut_track.add_section()
cut.set_range(0, total)
bid = unreal.MovieSceneObjectBindingID()
bid.set_editor_property('guid', binding.binding_id)
cut.set_camera_binding_id(bid)

# -- fades: out of black, and through black at every cut -------------------- --
fade_section = seq.add_track(unreal.MovieSceneFadeTrack).add_section()
fade_section.set_range(0, total)
fade = fade_section.get_all_channels()[0]


def key(at, value):
    fade.add_key(unreal.FrameNumber(max(0, min(total, at))), value, interpolation=LINEAR)


key(0, 1.0)
key(FADE, 0.0)
for at in cuts[1:]:
    key(at - FADE, 0.0)
    key(at - 1, 1.0)
    key(at, 1.0)
    key(at + FADE, 0.0)
key(total - FADE, 0.0)
key(total, 1.0)

unreal.EditorAssetLibrary.save_asset(SEQ)
log('TOUR360 sequence: %d shots, %d frames, %.0f s' % (len(SHOTS), total, total / float(FPS)))

# -- render ----------------------------------------------------------------- --
if TEST:
    ranges = [TEST]
elif PATCH:
    ranges = PATCH if isinstance(PATCH, list) else [PATCH]
else:
    ranges = [None]


def add_job(frame_range):
    job = queue.allocate_new_job(unreal.MoviePipelineExecutorJob)
    job.set_editor_property('job_name', 'Tour360' + ('_%d-%d' % frame_range if frame_range else ''))
    job.set_editor_property('map', unreal.SoftObjectPath('/Game/Tower/Maps/TowerOrbit'))
    job.set_editor_property('sequence', unreal.SoftObjectPath(SEQ))

    config = job.get_configuration()
    config.find_or_add_setting_by_class(unreal.MoviePipelinePanoramicPass)
    jpg = config.find_or_add_setting_by_class(unreal.MoviePipelineImageSequenceOutput_JPG)
    try:
        jpg.set_editor_property('quality', 95)
    except Exception:
        pass

    out = config.find_or_add_setting_by_class(unreal.MoviePipelineOutputSetting)
    out.set_editor_property('output_directory', unreal.DirectoryPath(OUT + ('_test' if TEST else '')))
    out.set_editor_property('output_resolution', unreal.IntPoint(W, H))
    out.set_editor_property('file_name_format', '{frame_number}')
    out.set_editor_property('zero_pad_frame_numbers', 5)
    out.set_editor_property('override_existing_output', True)
    if frame_range:
        out.set_editor_property('use_custom_playback_range', True)
        out.set_editor_property('custom_start_frame', frame_range[0])
        out.set_editor_property('custom_end_frame', frame_range[1])

    aa = config.find_or_add_setting_by_class(unreal.MoviePipelineAntiAliasingSetting)
    aa.set_editor_property('spatial_sample_count', 2)
    aa.set_editor_property('temporal_sample_count', 1)
    aa.set_editor_property('render_warm_up_count', 32)

    cvars = config.find_or_add_setting_by_class(unreal.MoviePipelineConsoleVariableSetting)
    for name, value in (('r.MotionBlurQuality', 0.0), ('r.DefaultFeature.MotionBlur', 0.0)):
        cvars.add_or_update_console_variable(name, value)


for frame_range in ranges:
    add_job(frame_range)
log('TOUR360 RENDER START %s %s: %s' % (OUT, 'TEST' if TEST else 'PATCH' if PATCH else 'FULL', ranges))
subsystem.render_queue_with_executor(unreal.MoviePipelinePIEExecutor)
