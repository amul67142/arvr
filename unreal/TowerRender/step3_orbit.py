"""Build the turntable: a level sequence that walks the camera round the tower.

One key per frame, linear, with the yaw wound on past 180 degrees rather than
wrapped — a wrap would make the camera unwind the long way round between two
frames and put a spin in the middle of the orbit.
"""
import math
import unreal

FRAMES = 96
SEQ_PATH = '/Game/Tower/Seq'
SEQ_NAME = 'OrbitSeq'
TOWER_PARTS = ('glass_003', 'panels', 'profile_001', 'balcony_001', 'metal', 'floor')

log = unreal.log
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

cam = None
for actor in actors.get_all_level_actors():
    if actor.get_actor_label() == 'OrbitCamera':
        cam = actor
if cam is None:
    raise RuntimeError('OrbitCamera is not in the level — run step2 first')

# The orbit centre and radius come from where the camera was framed in step 2.
start = cam.get_actor_location()
registry = unreal.AssetRegistryHelpers.get_asset_registry()
lo = [1e9, 1e9, 1e9]
hi = [-1e9, -1e9, -1e9]
for asset in registry.get_assets_by_path(unreal.Name('/Game/Tower/Mesh'), recursive=True):
    obj = asset.get_asset()
    if isinstance(obj, unreal.StaticMesh) and obj.get_name() in TOWER_PARTS:
        b = obj.get_bounding_box()
        for i, axis in enumerate(('x', 'y', 'z')):
            lo[i] = min(lo[i], getattr(b.min, axis))
            hi[i] = max(hi[i], getattr(b.max, axis))

cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
radius = math.hypot(start.x - cx, start.y - cy)
height = start.z
look = unreal.Vector(cx, cy, hi[2] * 0.52)
log('ORBIT centre=[%.0f %.0f] radius=%.0f uu (%.0f m) height=%.0f' % (cx, cy, radius, radius / 100, height))

# -- the asset -------------------------------------------------------------- --
tools = unreal.AssetToolsHelpers.get_asset_tools()
if unreal.EditorAssetLibrary.does_asset_exist('%s/%s' % (SEQ_PATH, SEQ_NAME)):
    unreal.EditorAssetLibrary.delete_asset('%s/%s' % (SEQ_PATH, SEQ_NAME))
seq = tools.create_asset(SEQ_NAME, SEQ_PATH, unreal.LevelSequence, unreal.LevelSequenceFactoryNew())
seq.set_display_rate(unreal.FrameRate(24, 1))
seq.set_playback_start(0)
seq.set_playback_end(FRAMES)

binding = seq.add_possessable(cam)
track = binding.add_track(unreal.MovieScene3DTransformTrack)
section = track.add_section()
section.set_range(0, FRAMES)
channels = section.get_all_channels()
log('TRANSFORM channels %d' % len(channels))

LINEAR = unreal.MovieSceneKeyInterpolation.LINEAR
for f in range(FRAMES + 1):
    angle = 2 * math.pi * f / FRAMES
    x = cx + radius * math.cos(angle)
    y = cy + radius * math.sin(angle)
    # Look at the tower: yaw wound on, so it never jumps across the 180 line.
    yaw = math.degrees(math.atan2(cy - y, cx - x))
    yaw = (yaw - math.degrees(angle) + 540) % 360 - 180 + math.degrees(angle)
    pitch = math.degrees(math.atan2(look.z - height, radius))
    key = unreal.FrameNumber(f)
    for channel, value in zip(channels, (x, y, height, 0.0, pitch, yaw, 1.0, 1.0, 1.0)):
        channel.add_key(key, value, interpolation=LINEAR)

# -- the cut, so the render knows which camera to look through -------------- --
cuts = seq.add_track(unreal.MovieSceneCameraCutTrack)
cut = cuts.add_section()
cut.set_range(0, FRAMES)
# binding.binding_id is a raw Guid; the section wants it wrapped.
bid = unreal.MovieSceneObjectBindingID()
log('BINDING ID fields %s' % list(bid.to_dict().keys()))
bid.set_editor_property('guid', binding.binding_id)
cut.set_camera_binding_id(bid)

unreal.EditorAssetLibrary.save_asset('%s/%s' % (SEQ_PATH, SEQ_NAME))
log('SEQUENCE READY %s/%s  %d frames' % (SEQ_PATH, SEQ_NAME, FRAMES))
