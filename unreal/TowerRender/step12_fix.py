"""Get the ground back, and stop the shot clipping.

Three things were fighting each other:

The HDRI backdrop is a dome with a floor, and its floor projects at z = 170 —
above the textured ground at z = -12, so it covered every piece of it. The dome
goes below the site now, and the grass is widened to six kilometres so its edge
falls past the horizon rather than showing as a step.

The backdrop also brings its own sky light. With ours still in the level the
scene was lit twice, which is most of why the ground clipped to white.

And the curtain wall was a near-black mirror: metallic with almost no
roughness, in a scene with no ray-traced reflections to fill it. Tinted glass
with a little more roughness reads as glass instead of as a hole.
"""
import unreal

log = unreal.log
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
lib = unreal.MaterialEditingLibrary

for actor in actors.get_all_level_actors():
    label = actor.get_actor_label()

    if label == 'HDRIBackdrop':
        actor.set_actor_location(unreal.Vector(-1564, -90, -2000), False, False)
        actor.set_editor_property('Intensity', 1.0)
        actor.set_editor_property('Size', 600000.0)
        log('BACKDROP dropped to z=-2000, size 6 km')

    elif label == 'SkyLight':
        # The backdrop carries its own; two is one too many.
        actor.set_actor_hidden_in_game(True)
        actor.get_component_by_class(unreal.SkyLightComponent).set_intensity(0.0)
        log('SKYLIGHT ours switched off (the backdrop has one)')

    elif label == 'Ground_Grass':
        actor.set_actor_scale3d(unreal.Vector(6000.0, 6000.0, 1.0))
        log('GRASS widened to 6 km')

    elif label in ('OrbitCamera', 'PanoCamera'):
        component = actor.get_cine_camera_component()
        settings = component.get_editor_property('post_process_settings')
        settings.set_editor_property('override_auto_exposure_bias', True)
        settings.set_editor_property('auto_exposure_bias', -0.6)
        settings.set_editor_property('override_auto_exposure_min_brightness', True)
        settings.set_editor_property('auto_exposure_min_brightness', 0.8)
        settings.set_editor_property('override_auto_exposure_max_brightness', True)
        settings.set_editor_property('auto_exposure_max_brightness', 1.6)
        component.set_editor_property('post_process_settings', settings)
        log('EXPOSURE tightened on %s' % label)

# -- glass that is glass rather than a hole -------------------------------- --
glass = unreal.EditorAssetLibrary.load_asset('/Game/Tower/Materials/M_GlassReal')
if glass:
    for expression in glass.get_editor_property('expression_collection').get_editor_property('expressions'):
        if isinstance(expression, unreal.MaterialExpressionConstant3Vector):
            expression.set_editor_property('constant', unreal.LinearColor(0.085, 0.105, 0.135, 1.0))
        elif isinstance(expression, unreal.MaterialExpressionConstant):
            value = expression.get_editor_property('r')
            if abs(value - 0.85) < 0.01:      # metallic
                expression.set_editor_property('r', 0.25)
            elif abs(value - 0.045) < 0.01:   # roughness
                expression.set_editor_property('r', 0.10)
    lib.recompile_material(glass)
    log('GLASS retuned')

unreal.EditorAssetLibrary.save_directory('/Game/Tower', only_if_is_dirty=False)
unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
log('FIX READY')
