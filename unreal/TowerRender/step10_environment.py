"""Give the tower somewhere to stand: real ground, and a real sky.

Until now the building floated on a flat blue plane under a procedural sky.
This imports the CC0 photographic textures, builds ground materials from them,
lays out a site - grass, a paved plot, a road past the front - and replaces the
procedural sky with an HDRI, which lights the building with the same photograph
it is standing under.

Textures that carry data rather than colour (normals, roughness, masks) are
imported with sRGB off; forgetting that is the usual reason a render comes out
looking washed and plastic.
"""
import os
import unreal

CACHE = 'D:/ar and vr/.cache/unreal-env'
ENV = '/Game/Tower/Env'

log = unreal.log
tools = unreal.AssetToolsHelpers.get_asset_tools()
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
lib = unreal.MaterialEditingLibrary

DATA_MAPS = ('nor', 'rough', 'arm', 'ao')   # not colour: no sRGB
GROUNDS = {
    'asphalt': 900.0,     # texture tiles across the piece, roughly
    'paving': 1400.0,
    'grass': 2600.0,
    'concrete': 1200.0,
}


def import_file(path, dest, name):
    task = unreal.AssetImportTask()
    task.filename = path
    task.destination_path = dest
    task.destination_name = name
    task.automated = True
    task.save = True
    task.replace_existing = True
    tools.import_asset_tasks([task])
    paths = list(task.get_editor_property('imported_object_paths') or [])
    return unreal.EditorAssetLibrary.load_asset(paths[0]) if paths else None


# -- textures --------------------------------------------------------------- --
textures = {}
for ground in GROUNDS:
    folder = os.path.join(CACHE, ground)
    if not os.path.isdir(folder):
        log('MISSING %s' % folder)
        continue
    textures[ground] = {}
    for kind in ('diff', 'nor', 'rough', 'arm', 'ao'):
        path = os.path.join(folder, '%s.jpg' % kind)
        if not os.path.isfile(path):
            continue
        texture = import_file(path, '%s/Textures' % ENV, 'T_%s_%s' % (ground, kind))
        if texture is None:
            continue
        if kind in DATA_MAPS:
            texture.set_editor_property('srgb', False)
            texture.set_editor_property(
                'compression_settings',
                unreal.TextureCompressionSettings.TC_NORMALMAP if kind == 'nor'
                else unreal.TextureCompressionSettings.TC_MASKS)
        textures[ground][kind] = texture
    log('TEXTURES %-9s %s' % (ground, ' '.join(sorted(textures[ground]))))

sky = import_file(os.path.join(CACHE, 'sky.hdr'), ENV, 'T_Sky')
log('SKY imported: %s (%s)' % (sky.get_name() if sky else 'FAILED', type(sky).__name__ if sky else '-'))


# -- ground materials ------------------------------------------------------- --
def ground_material(name, maps, tiling):
    path = '%s/M_%s' % (ENV, name)
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        unreal.EditorAssetLibrary.delete_asset(path)
    mat = tools.create_asset('M_%s' % name, ENV, unreal.Material, unreal.MaterialFactoryNew())

    coord = lib.create_material_expression(mat, unreal.MaterialExpressionTextureCoordinate, -1000, 0)
    coord.set_editor_property('u_tiling', tiling)
    coord.set_editor_property('v_tiling', tiling)

    def sample(texture, y, sampler=None):
        node = lib.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -700, y)
        node.set_editor_property('texture', texture)
        if sampler:
            node.set_editor_property('sampler_type', sampler)
        lib.connect_material_expressions(coord, '', node, 'UVs')
        return node

    if 'diff' in maps:
        lib.connect_material_property(sample(maps['diff'], -250), '', unreal.MaterialProperty.MP_BASE_COLOR)
    if 'nor' in maps:
        node = sample(maps['nor'], 100, unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
        lib.connect_material_property(node, '', unreal.MaterialProperty.MP_NORMAL)
    if 'arm' in maps:
        # Poly Haven packs ambient occlusion, roughness and metalness into RGB.
        node = sample(maps['arm'], 450, unreal.MaterialSamplerType.SAMPLERTYPE_MASKS)
        lib.connect_material_property(node, 'G', unreal.MaterialProperty.MP_ROUGHNESS)
        lib.connect_material_property(node, 'R', unreal.MaterialProperty.MP_AMBIENT_OCCLUSION)
    elif 'rough' in maps:
        node = sample(maps['rough'], 450, unreal.MaterialSamplerType.SAMPLERTYPE_MASKS)
        lib.connect_material_property(node, '', unreal.MaterialProperty.MP_ROUGHNESS)

    lib.recompile_material(mat)
    return mat


built = {}
for ground, tiling in GROUNDS.items():
    if ground in textures and textures[ground]:
        built[ground] = ground_material(ground.capitalize(), textures[ground], tiling)
log('BUILT %d ground materials' % len(built))


# -- the site --------------------------------------------------------------- --
plane = unreal.EditorAssetLibrary.load_asset('/Engine/BasicShapes/Plane')
for actor in actors.get_all_level_actors():
    if str(actor.get_folder_path()) == 'Site':
        actors.destroy_actor(actor)

# name, material, centre x, y, z, size x, y  (uu)
PIECES = [
    ('Ground_Grass', 'grass', -1564, -90, -12, 120000, 120000),
    ('Plot_Paving', 'paving', -1564, -90, -6, 26000, 16000),
    ('Road_Main', 'asphalt', -1564, -9000, -3, 60000, 1600),
    ('Road_Side', 'asphalt', 7000, -90, -3, 1400, 30000),
    ('Forecourt', 'concrete', -1564, -4600, -2, 11000, 5200),
]
for name, ground, x, y, z, sx, sy in PIECES:
    material = built.get(ground)
    if material is None:
        continue
    actor = actors.spawn_actor_from_object(plane, unreal.Vector(x, y, z), unreal.Rotator(0, 0, 0))
    actor.set_actor_scale3d(unreal.Vector(sx / 100.0, sy / 100.0, 1.0))
    actor.set_actor_label(name)
    actor.set_folder_path(unreal.Name('Site'))
    actor.get_component_by_class(unreal.StaticMeshComponent).set_material(0, material)
log('SITE %d pieces laid' % len(PIECES))


# -- the sky ---------------------------------------------------------------- --
for actor in actors.get_all_level_actors():
    if actor.get_actor_label() == 'HDRIBackdrop':
        actors.destroy_actor(actor)

backdrop = None
if sky is not None:
    blueprint = unreal.EditorAssetLibrary.load_blueprint_class('/HDRIBackdrop/Blueprints/HDRIBackdrop')
    if blueprint:
        backdrop = actors.spawn_actor_from_class(blueprint, unreal.Vector(-1564, -90, 0), unreal.Rotator(0, 0, 0))
        backdrop.set_actor_label('HDRIBackdrop')
        for prop, value in (('Cubemap', sky), ('Intensity', 1.2), ('Size', 200000.0)):
            try:
                backdrop.set_editor_property(prop, value)
            except Exception as error:
                log('HDRI BACKDROP could not set %s: %s' % (prop, error))
        log('HDRI BACKDROP placed')
    else:
        log('HDRI BACKDROP blueprint not found')

# The procedural sky would draw over the photograph.
for actor in actors.get_all_level_actors():
    if actor.get_actor_label() == 'SkyAtmosphere' and backdrop is not None:
        actor.set_actor_hidden_in_game(True)
    if actor.get_actor_label() == 'SkyLight':
        actor.get_component_by_class(unreal.SkyLightComponent).set_editor_property('real_time_capture', True)

unreal.EditorAssetLibrary.save_directory('/Game/Tower', only_if_is_dirty=False)
unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
log('ENVIRONMENT READY')
