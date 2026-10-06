"""Fix the ground scale and the exposure.

Two faults in the first environment pass, both visible in one frame:

The ground read as blank grey. Tiling was set against the mesh's own UVs, so a
road stretched 600 m by 16 m squeezed the texture in one axis and smeared it in
the other, and the counts were far too high anyway. These materials take their
UVs from world position instead: one tile is a fixed number of centimetres on
the ground, whatever shape the piece it lands on happens to be.

And the shot was blown out — a white ground and a black building. The scene is
lit by an HDRI now, whose brightness has nothing to do with the six-lux sun it
inherited, so the exposure is set explicitly here rather than left to a default
that was tuned for the old procedural sky.
"""
import unreal

ENV = '/Game/Tower/Env'

log = unreal.log
tools = unreal.AssetToolsHelpers.get_asset_tools()
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
lib = unreal.MaterialEditingLibrary

# centimetres of ground per texture tile
SCALE = {'asphalt': 600.0, 'paving': 300.0, 'concrete': 500.0, 'grass': 450.0}
SUN_LUX = 12.0
EXPOSURE_BIAS = 0.0
EXPOSURE_MIN, EXPOSURE_MAX = 0.6, 2.4


def world_uvs(mat, scale):
    """UVs from where a pixel is in the world, not from the mesh's own UVs."""
    position = lib.create_material_expression(mat, unreal.MaterialExpressionWorldPosition, -1500, 0)
    mask = lib.create_material_expression(mat, unreal.MaterialExpressionComponentMask, -1250, 0)
    mask.set_editor_property('r', True)
    mask.set_editor_property('g', True)
    mask.set_editor_property('b', False)
    mask.set_editor_property('a', False)
    lib.connect_material_expressions(position, '', mask, '')
    divide = lib.create_material_expression(mat, unreal.MaterialExpressionDivide, -1050, 0)
    lib.connect_material_expressions(mask, '', divide, 'A')
    divide.set_editor_property('const_b', scale)
    return divide


def rebuild(ground, scale):
    name = ground.capitalize()
    path = '%s/M_%s' % (ENV, name)
    maps = {}
    for kind in ('diff', 'nor', 'arm'):
        texture = unreal.EditorAssetLibrary.load_asset('%s/Textures/T_%s_%s' % (ENV, ground, kind))
        if texture:
            maps[kind] = texture
    if 'diff' not in maps:
        log('SKIP %s (no diffuse)' % ground)
        return None

    if unreal.EditorAssetLibrary.does_asset_exist(path):
        unreal.EditorAssetLibrary.delete_asset(path)
    mat = tools.create_asset('M_%s' % name, ENV, unreal.Material, unreal.MaterialFactoryNew())
    uvs = world_uvs(mat, scale)

    def sample(texture, y, sampler=None):
        node = lib.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -700, y)
        node.set_editor_property('texture', texture)
        if sampler:
            node.set_editor_property('sampler_type', sampler)
        lib.connect_material_expressions(uvs, '', node, 'UVs')
        return node

    lib.connect_material_property(sample(maps['diff'], -250), '', unreal.MaterialProperty.MP_BASE_COLOR)
    if 'nor' in maps:
        node = sample(maps['nor'], 100, unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
        lib.connect_material_property(node, '', unreal.MaterialProperty.MP_NORMAL)
    if 'arm' in maps:
        node = sample(maps['arm'], 450, unreal.MaterialSamplerType.SAMPLERTYPE_MASKS)
        lib.connect_material_property(node, 'G', unreal.MaterialProperty.MP_ROUGHNESS)
        lib.connect_material_property(node, 'R', unreal.MaterialProperty.MP_AMBIENT_OCCLUSION)

    lib.recompile_material(mat)
    return mat


built = {}
for ground, scale in SCALE.items():
    material = rebuild(ground, scale)
    if material:
        built[ground] = material
log('REBUILT %d ground materials on world UVs' % len(built))

# The site pieces point at the old material objects; re-hang the new ones.
WHICH = {
    'Ground_Grass': 'grass', 'Plot_Paving': 'paving', 'Road_Main': 'asphalt',
    'Road_Side': 'asphalt', 'Forecourt': 'concrete',
}
rehung = 0
for actor in actors.get_all_level_actors():
    ground = WHICH.get(actor.get_actor_label())
    if ground and ground in built:
        actor.get_component_by_class(unreal.StaticMeshComponent).set_material(0, built[ground])
        rehung += 1
log('REHUNG %d site pieces' % rehung)

# -- exposure and sun ------------------------------------------------------- --
for actor in actors.get_all_level_actors():
    label = actor.get_actor_label()
    if label == 'Sun':
        actor.get_component_by_class(unreal.DirectionalLightComponent).set_intensity(SUN_LUX)
    elif label == 'OrbitCamera' or label == 'PanoCamera':
        component = actor.get_cine_camera_component()
        settings = component.get_editor_property('post_process_settings')
        settings.set_editor_property('override_auto_exposure_method', True)
        settings.set_editor_property('auto_exposure_method', unreal.AutoExposureMethod.AEM_HISTOGRAM)
        settings.set_editor_property('override_auto_exposure_bias', True)
        settings.set_editor_property('auto_exposure_bias', EXPOSURE_BIAS)
        # Clamped top and bottom so the orbit cannot breathe between frames.
        settings.set_editor_property('override_auto_exposure_min_brightness', True)
        settings.set_editor_property('auto_exposure_min_brightness', EXPOSURE_MIN)
        settings.set_editor_property('override_auto_exposure_max_brightness', True)
        settings.set_editor_property('auto_exposure_max_brightness', EXPOSURE_MAX)
        component.set_editor_property('post_process_settings', settings)
        log('EXPOSURE set on %s' % label)

unreal.EditorAssetLibrary.save_directory('/Game/Tower', only_if_is_dirty=False)
unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
log('POLISH READY')
