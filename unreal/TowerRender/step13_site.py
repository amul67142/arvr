"""Lay the site out properly instead of one enormous lawn.

Six kilometres of aerial grass averages to a flat olive with moire in it: at
that distance the texture repeats far more often than the pixels can carry. A
neutral ground reads better and is closer to what an urban plot looks like
anyway, so the surround becomes concrete and the grass is kept for lawns beside
the building, where it is near enough to actually be seen as grass.
"""
import unreal

log = unreal.log
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
plane = unreal.EditorAssetLibrary.load_asset('/Engine/BasicShapes/Plane')
ENV = '/Game/Tower/Env'

mats = {name: unreal.EditorAssetLibrary.load_asset('%s/M_%s' % (ENV, name.capitalize()))
        for name in ('asphalt', 'paving', 'concrete', 'grass')}

# Everything laid before, replaced in one go.
for actor in actors.get_all_level_actors():
    if str(actor.get_folder_path()) == 'Site':
        actors.destroy_actor(actor)

# name, material, centre x, y, z, size x, y  (uu)
PIECES = [
    ('Ground_City', 'concrete', -1564, -90, -14, 600000, 600000),
    ('Lawn_West', 'grass', -9000, -90, -8, 9000, 26000),
    ('Lawn_East', 'grass', 5800, -90, -8, 9000, 26000),
    ('Lawn_North', 'grass', -1564, 8000, -8, 24000, 9000),
    ('Plot_Paving', 'paving', -1564, -90, -6, 26000, 16000),
    ('Forecourt', 'paving', -1564, -4600, -5, 12000, 5600),
    ('Road_Main', 'asphalt', -1564, -9000, -3, 90000, 1800),
    ('Road_Side', 'asphalt', 9000, -90, -3, 1600, 44000),
]

laid = 0
for name, ground, x, y, z, sx, sy in PIECES:
    material = mats.get(ground)
    if material is None:
        log('MISSING material for %s' % name)
        continue
    actor = actors.spawn_actor_from_object(plane, unreal.Vector(x, y, z), unreal.Rotator(0, 0, 0))
    actor.set_actor_scale3d(unreal.Vector(sx / 100.0, sy / 100.0, 1.0))
    actor.set_actor_label(name)
    actor.set_folder_path(unreal.Name('Site'))
    actor.get_component_by_class(unreal.StaticMeshComponent).set_material(0, material)
    laid += 1
log('SITE %d pieces laid' % laid)

unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
log('SITE READY')
