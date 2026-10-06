"""Swing the sun round to light the side of the tower the amenities face.

The amenities are north of the tower and the sun was in the south-east, so
from the pool, the garden and the track the tower was a black silhouette. The
HDRI's own sun sits where the directional light does - measured off a frame,
both land at the same column of the panorama - so the two are rotated by the
same angle and the sky still agrees with the shadows. North-east is morning
light, which also reads right for a residential brochure.
"""
import unreal

DELTA = 100.0      # degrees, both sun and sky

log = unreal.log
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
for actor in actors.get_all_level_actors():
    label = actor.get_actor_label()
    if label in ('Sun', 'HDRIBackdrop'):
        rotation = actor.get_actor_rotation()
        rotation.yaw = rotation.yaw + DELTA
        actor.set_actor_rotation(rotation, False)
        log('LIGHT %s yaw -> %.1f (pitch %.1f)' % (label, rotation.yaw, rotation.pitch))
unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
log('LIGHT READY')
