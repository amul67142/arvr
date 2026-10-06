"""Place the building, light it, and frame a camera on the tower.

The mesh vertices already carry their world positions, so every piece is
spawned at the origin and the building assembles itself. What has to be worked
out here is the tower's own centre and height: the podium is 116 m wide and
would drag the orbit centre off the tower if the whole model were used.
"""
import math
import unreal

DEST = '/Game/Tower/Mesh'
TOWER_PARTS = ('glass_003', 'panels', 'profile_001', 'balcony_001', 'metal', 'floor')

log = unreal.log
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
registry = unreal.AssetRegistryHelpers.get_asset_registry()


def spawn(cls, location=(0, 0, 0), pitch=0.0, yaw=0.0, label=None):
    # unreal.Rotator is (roll, pitch, yaw) — the elevation is the SECOND argument.
    actor = actors.spawn_actor_from_class(cls, unreal.Vector(*location), unreal.Rotator(0.0, pitch, yaw))
    if label:
        actor.set_actor_label(label)
    return actor


# A previous run may have got half way; start from a clean level either way.
RIG = ('Sun', 'SkyLight', 'SkyAtmosphere', 'HeightFog', 'OrbitCamera')
removed = 0
for actor in actors.get_all_level_actors():
    if str(actor.get_folder_path()) == 'Building' or actor.get_actor_label() in RIG:
        actors.destroy_actor(actor)
        removed += 1
log('CLEARED %d actors from a previous run' % removed)

# -- the building ---------------------------------------------------------- --
meshes = []
for asset in registry.get_assets_by_path(unreal.Name(DEST), recursive=True):
    obj = asset.get_asset()
    if isinstance(obj, unreal.StaticMesh):
        meshes.append(obj)

placed = []
for mesh in meshes:
    actor = actors.spawn_actor_from_object(mesh, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    actor.set_actor_label(mesh.get_name())
    actor.set_folder_path(unreal.Name('Building'))
    placed.append(actor)
log('PLACED %d building actors' % len(placed))

# -- where the tower actually stands --------------------------------------- --
lo = [1e9, 1e9, 1e9]
hi = [-1e9, -1e9, -1e9]
for mesh in meshes:
    if mesh.get_name() not in TOWER_PARTS:
        continue
    b = mesh.get_bounding_box()
    for i, axis in enumerate(('x', 'y', 'z')):
        lo[i] = min(lo[i], getattr(b.min, axis))
        hi[i] = max(hi[i], getattr(b.max, axis))

cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
base_z, top_z = lo[2], hi[2]
height = top_z - base_z
log('TOWER centre=[%.0f %.0f]  z=%.0f..%.0f  height=%.0f uu (%.1f m)' % (cx, cy, base_z, top_z, height, height / 100))
log('TOWER plate %.1f x %.1f m' % ((hi[0] - lo[0]) / 100, (hi[1] - lo[1]) / 100))

# -- light ------------------------------------------------------------------ --
sun = spawn(unreal.DirectionalLight, (0, 0, 20000), pitch=-42.0, yaw=125.0, label='Sun')
sun_light = sun.get_component_by_class(unreal.DirectionalLightComponent)
sun_light.set_mobility(unreal.ComponentMobility.MOVABLE)
sun_light.set_intensity(6.0)
sun_light.set_editor_property('atmosphere_sun_light', True)
sun_light.set_editor_property('dynamic_shadow_distance_movable_light', 60000.0)

sky = spawn(unreal.SkyLight, (0, 0, 20000), label='SkyLight')
sky_light = sky.get_component_by_class(unreal.SkyLightComponent)
sky_light.set_mobility(unreal.ComponentMobility.MOVABLE)
sky_light.set_editor_property('real_time_capture', True)

spawn(unreal.SkyAtmosphere, label='SkyAtmosphere')
fog = spawn(unreal.ExponentialHeightFog, (0, 0, 0), label='HeightFog')
fog.get_component_by_class(unreal.ExponentialHeightFogComponent).set_editor_property('fog_density', 0.008)

# -- the camera, framed on the whole building ------------------------------ --
SENSOR_W, SENSOR_H = 36.0, 20.25   # 16:9, to match the viewer
FOCAL = 35.0
look_z = base_z + height * 0.45
half = (top_z - (-1500)) / 2 * 1.12          # the podium sits below the tower base
distance = half / math.tan(math.atan(SENSOR_H / 2 / FOCAL))

cam = spawn(unreal.CineCameraActor, (cx + distance, cy, look_z), label='OrbitCamera')
comp = cam.get_cine_camera_component()
comp.set_editor_property('current_focal_length', FOCAL)
filmback = comp.get_editor_property('filmback')
filmback.set_editor_property('sensor_width', SENSOR_W)
filmback.set_editor_property('sensor_height', SENSOR_H)
comp.set_editor_property('filmback', filmback)
focus = comp.get_editor_property('focus_settings')
focus.set_editor_property('focus_method', unreal.CameraFocusMethod.DISABLE)
comp.set_editor_property('focus_settings', focus)

target = unreal.Vector(cx, cy, look_z)
cam.set_actor_rotation(unreal.MathLibrary.find_look_at_rotation(cam.get_actor_location(), target), False)
log('CAMERA at %.0f uu (%.0f m) from the tower, height %.0f uu, %.0fmm lens' % (distance, distance / 100, look_z, FOCAL))

unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).pilot_level_actor(cam)
unreal.EditorAssetLibrary.save_directory('/Game/Tower', only_if_is_dirty=False)
unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
log('SCENE READY')
