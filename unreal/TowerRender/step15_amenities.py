"""Build the amenity landscape north of the tower.

The podium terraces are four to seven metres wide - no room for a pool - so the
amenities sit where a real project would put them: on a landscaped podium slab
1.2 m above the ground, in the open plot north of the building.

    pool 26 x 10 m, with a timber sundeck, loungers and parasols
    clubhouse pavilion 18 x 12 m, glass, with a lounge and cafe inside
    kids' play area on rubber tiles
    a jogging track round the whole slab
    lawns, palms around the water, jacarandas in the garden, shrubs, benches, lamps

The pool is a real hole in the slab. A plane cannot have a hole, so the slab and
everything laid on it is built as a frame of four pieces round the pool, and
the basin - floor, tiled walls, water - sits inside that frame.

Everything is CC0 from Poly Haven, downloaded by scripts/fetch-amenity-assets.mjs.
Re-running clears the previous build first.
"""
import math
import os
import random
import unreal

CACHES = ('D:/ar and vr/.cache/amenity', 'D:/ar and vr/.cache/polyhaven')
ROOT = '/Game/Amenity'
FOLDER = 'Amenities'

log = unreal.log
tools = unreal.AssetToolsHelpers.get_asset_tools()
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
lib = unreal.MaterialEditingLibrary
random.seed(11)

# -- layout (cm) ------------------------------------------------------------- --
TOP = 120.0                                   # slab top
ZONE = (-9600.0, 3800.0, 6400.0, 11400.0)     # x0 y0 x1 y1
POOL = (-2500.0, 6500.0, 100.0, 7500.0)       # the hole
POOL_DECK = (-3000.0, 6000.0, 600.0, 8000.0)
SUNDECK = (-3000.0, 5000.0, 600.0, 6000.0)
CLUB = (2000.0, 6100.0, 3800.0, 7300.0)
CLUB_DOOR = (6500.0, 6900.0)                  # gap in the west wall, y range
PLAY = (-8200.0, 5200.0, -5800.0, 7600.0)
TRACK_OUT = (-9400.0, 4000.0, 6200.0, 11200.0)
TRACK_W = 300.0
WATER_Z = TOP - 18.0
POOL_FLOOR_Z = -5.0


def frame_around(outer, hole):
    """Four rectangles covering `outer` minus `hole`."""
    ox0, oy0, ox1, oy1 = outer
    hx0, hy0, hx1, hy1 = hole
    return [
        (ox0, oy0, ox1, hy0),      # south
        (ox0, hy1, ox1, oy1),      # north
        (ox0, hy0, hx0, hy1),      # west
        (hx1, hy0, ox1, hy1),      # east
    ]


# -- assets ------------------------------------------------------------------ --
def load(path):
    return unreal.EditorAssetLibrary.load_asset(path) if unreal.EditorAssetLibrary.does_asset_exist(path) else None


def import_texture(path, dest, name, data):
    asset = load('%s/%s' % (dest, name))
    if asset:
        return asset
    task = unreal.AssetImportTask()
    task.filename = path
    task.destination_path = dest
    task.destination_name = name
    task.automated = True
    task.save = True
    task.replace_existing = True
    tools.import_asset_tasks([task])
    asset = load('%s/%s' % (dest, name))
    if asset and data:
        asset.set_editor_property('srgb', False)
        asset.set_editor_property(
            'compression_settings',
            unreal.TextureCompressionSettings.TC_NORMALMAP if data == 'normal'
            else unreal.TextureCompressionSettings.TC_MASKS)
    return asset


MASK_DS = load('/InterchangeAssets/gltf/MaterialInstances/MI_Default_Mask_DS')
BLEND_PARENTS = ('MI_Default_Blend', 'MI_Default_Blend_DS')


def mask_foliage(asset):
    """Blended foliage sorts badly and casts no proper shadow; the Mask
    sibling reads the same alpha as a cut-out instead."""
    if isinstance(asset, unreal.MaterialInstanceConstant) and MASK_DS:
        parent = asset.get_editor_property('parent')
        if parent and parent.get_name() in BLEND_PARENTS:
            lib.set_material_instance_parent(asset, MASK_DS)
            lib.update_material_instance(asset)


def import_model(model_id):
    """Every static mesh in one Poly Haven glTF, imported once and reused."""
    dest = '%s/Models/%s' % (ROOT, model_id)
    found = []
    if unreal.EditorAssetLibrary.does_directory_exist(dest):
        for path in unreal.EditorAssetLibrary.list_assets(dest, recursive=True, include_folder=False):
            asset = unreal.EditorAssetLibrary.load_asset(path)
            if isinstance(asset, unreal.StaticMesh):
                found.append(asset)
            else:
                mask_foliage(asset)
    if found:
        return found

    source = None
    for cache in CACHES:
        candidate = '%s/models/%s/%s.gltf' % (cache, model_id, model_id)
        if os.path.isfile(candidate):
            source = candidate
            break
    if source is None:
        log('MODEL missing %s' % model_id)
        return []

    task = unreal.AssetImportTask()
    task.filename = source
    task.destination_path = dest
    task.automated = True
    task.save = True
    task.replace_existing = True
    tools.import_asset_tasks([task])

    for path in unreal.EditorAssetLibrary.list_assets(dest, recursive=True, include_folder=False):
        asset = unreal.EditorAssetLibrary.load_asset(path)
        if isinstance(asset, unreal.StaticMesh):
            found.append(asset)
        # Blended foliage sorts badly and casts no proper shadow; the Mask
        # sibling reads the same alpha as a cut-out instead.
        else:
            mask_foliage(asset)
    log('MODEL %-26s %d mesh(es)' % (model_id, len(found)))
    return found


def surface(name, folder, scale, tint=None):
    """A world-UV PBR material from a downloaded texture set."""
    dest = '%s/Materials' % ROOT
    path = '%s/M_%s' % (dest, name)
    if load(path):
        return load(path)
    maps = {}
    for kind, data in (('diff', None), ('nor', 'normal'), ('arm', 'mask')):
        file = 'D:/ar and vr/.cache/amenity/textures/%s/%s.jpg' % (folder, kind)
        if os.path.isfile(file):
            maps[kind] = import_texture(file, '%s/Textures' % ROOT, 'T_%s_%s' % (name, kind), data)
    mat = tools.create_asset('M_%s' % name, dest, unreal.Material, unreal.MaterialFactoryNew())

    position = lib.create_material_expression(mat, unreal.MaterialExpressionWorldPosition, -1500, 0)
    mask = lib.create_material_expression(mat, unreal.MaterialExpressionComponentMask, -1250, 0)
    for channel, on in (('r', True), ('g', True), ('b', False), ('a', False)):
        mask.set_editor_property(channel, on)
    lib.connect_material_expressions(position, '', mask, '')
    uvs = lib.create_material_expression(mat, unreal.MaterialExpressionDivide, -1050, 0)
    lib.connect_material_expressions(mask, '', uvs, 'A')
    uvs.set_editor_property('const_b', scale)

    def sample(texture, y, sampler=None):
        node = lib.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -700, y)
        node.set_editor_property('texture', texture)
        if sampler:
            node.set_editor_property('sampler_type', sampler)
        lib.connect_material_expressions(uvs, '', node, 'UVs')
        return node

    if maps.get('diff'):
        colour = sample(maps['diff'], -250)
        if tint:
            multiply = lib.create_material_expression(mat, unreal.MaterialExpressionMultiply, -400, -250)
            constant = lib.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -600, -120)
            constant.set_editor_property('constant', unreal.LinearColor(tint[0], tint[1], tint[2], 1.0))
            lib.connect_material_expressions(colour, '', multiply, 'A')
            lib.connect_material_expressions(constant, '', multiply, 'B')
            lib.connect_material_property(multiply, '', unreal.MaterialProperty.MP_BASE_COLOR)
        else:
            lib.connect_material_property(colour, '', unreal.MaterialProperty.MP_BASE_COLOR)
    if maps.get('nor'):
        lib.connect_material_property(sample(maps['nor'], 100, unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL),
                                      '', unreal.MaterialProperty.MP_NORMAL)
    if maps.get('arm'):
        arm = sample(maps['arm'], 450, unreal.MaterialSamplerType.SAMPLERTYPE_MASKS)
        lib.connect_material_property(arm, 'G', unreal.MaterialProperty.MP_ROUGHNESS)
        lib.connect_material_property(arm, 'R', unreal.MaterialProperty.MP_AMBIENT_OCCLUSION)
    lib.recompile_material(mat)
    return mat


def flat(name, colour, roughness=0.6, metallic=0.0, opacity=None, specular=0.5):
    """A plain material: painted steel, fabric, plastic, glass."""
    dest = '%s/Materials' % ROOT
    path = '%s/M_%s' % (dest, name)
    if load(path):
        return load(path)
    mat = tools.create_asset('M_%s' % name, dest, unreal.Material, unreal.MaterialFactoryNew())
    if opacity is not None:
        mat.set_editor_property('blend_mode', unreal.BlendMode.BLEND_TRANSLUCENT)
        try:
            mat.set_editor_property('translucency_lighting_mode',
                                    unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
        except Exception:
            pass
    rgb = lib.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -500, 0)
    rgb.set_editor_property('constant', unreal.LinearColor(colour[0], colour[1], colour[2], 1.0))
    lib.connect_material_property(rgb, '', unreal.MaterialProperty.MP_BASE_COLOR)
    for value, slot, y in ((roughness, unreal.MaterialProperty.MP_ROUGHNESS, 150),
                           (metallic, unreal.MaterialProperty.MP_METALLIC, 260),
                           (specular, unreal.MaterialProperty.MP_SPECULAR, 370)):
        node = lib.create_material_expression(mat, unreal.MaterialExpressionConstant, -500, y)
        node.set_editor_property('r', value)
        lib.connect_material_property(node, '', slot)
    if opacity is not None:
        node = lib.create_material_expression(mat, unreal.MaterialExpressionConstant, -500, 480)
        node.set_editor_property('r', opacity)
        lib.connect_material_property(node, '', unreal.MaterialProperty.MP_OPACITY)
    lib.recompile_material(mat)
    return mat


def water():
    """Translucent, so the tiles show through; two panning wave normals."""
    path = '%s/Materials/M_Water' % ROOT
    if load(path):
        return load(path)
    normal = import_texture('D:/ar and vr/.cache/amenity/generated/water_nor.png',
                            '%s/Textures' % ROOT, 'T_water_nor', 'normal')
    mat = tools.create_asset('M_Water', '%s/Materials' % ROOT, unreal.Material, unreal.MaterialFactoryNew())
    mat.set_editor_property('blend_mode', unreal.BlendMode.BLEND_TRANSLUCENT)
    try:
        mat.set_editor_property('translucency_lighting_mode',
                                unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
    except Exception:
        pass

    position = lib.create_material_expression(mat, unreal.MaterialExpressionWorldPosition, -1600, 0)
    mask = lib.create_material_expression(mat, unreal.MaterialExpressionComponentMask, -1400, 0)
    for channel, on in (('r', True), ('g', True), ('b', False), ('a', False)):
        mask.set_editor_property(channel, on)
    lib.connect_material_expressions(position, '', mask, '')

    samples = []
    for index, (scale, sx, sy) in enumerate(((420.0, 0.012, 0.006), (190.0, -0.009, 0.014))):
        uv = lib.create_material_expression(mat, unreal.MaterialExpressionDivide, -1200, index * 300)
        lib.connect_material_expressions(mask, '', uv, 'A')
        uv.set_editor_property('const_b', scale)
        pan = lib.create_material_expression(mat, unreal.MaterialExpressionPanner, -1000, index * 300)
        pan.set_editor_property('speed_x', sx)
        pan.set_editor_property('speed_y', sy)
        lib.connect_material_expressions(uv, '', pan, 'Coordinate')
        node = lib.create_material_expression(mat, unreal.MaterialExpressionTextureSample, -780, index * 300)
        node.set_editor_property('texture', normal)
        node.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
        lib.connect_material_expressions(pan, '', node, 'UVs')
        samples.append(node)
    blend = lib.create_material_expression(mat, unreal.MaterialExpressionAdd, -520, 150)
    lib.connect_material_expressions(samples[0], '', blend, 'A')
    lib.connect_material_expressions(samples[1], '', blend, 'B')
    lib.connect_material_property(blend, '', unreal.MaterialProperty.MP_NORMAL)

    for value, slot, y in (((0.02, 0.16, 0.19), unreal.MaterialProperty.MP_BASE_COLOR, -300),
                           (0.02, unreal.MaterialProperty.MP_ROUGHNESS, 500),
                           (1.0, unreal.MaterialProperty.MP_SPECULAR, 600),
                           (0.55, unreal.MaterialProperty.MP_OPACITY, 700)):
        if isinstance(value, tuple):
            node = lib.create_material_expression(mat, unreal.MaterialExpressionConstant3Vector, -500, y)
            node.set_editor_property('constant', unreal.LinearColor(value[0], value[1], value[2], 1.0))
        else:
            node = lib.create_material_expression(mat, unreal.MaterialExpressionConstant, -500, y)
            node.set_editor_property('r', value)
        lib.connect_material_property(node, '', slot)
    lib.recompile_material(mat)
    return mat


# -- clear the previous build ------------------------------------------------ --
removed = 0
for actor in actors.get_all_level_actors():
    if str(actor.get_folder_path()).startswith(FOLDER):
        actors.destroy_actor(actor)
        removed += 1
log('AMENITY cleared %d actors' % removed)

M = {
    'grass': load('/Game/Tower/Env/M_Grass'),
    'concrete': load('/Game/Tower/Env/M_Concrete'),
    'paving': load('/Game/Tower/Env/M_Paving'),
    'pool_tiles': surface('PoolTiles', 'pool_tiles', 110.0),
    'pool_deck': surface('PoolDeck', 'pool_deck', 180.0, tint=(1.05, 1.02, 0.96)),
    'timber': surface('Timber', 'timber_deck', 260.0),
    'track': surface('Track', 'track', 420.0),
    'play': surface('Play', 'play', 220.0, tint=(0.55, 0.85, 1.0)),
    'gravel': surface('Gravel', 'gravel', 160.0),
    'water': water(),
    'glass': flat('Glass', (0.75, 0.85, 0.9), roughness=0.04, opacity=0.18, specular=1.0),
    'frame': flat('DarkFrame', (0.03, 0.03, 0.035), roughness=0.35, metallic=0.8),
    'white': flat('Render', (0.86, 0.85, 0.82), roughness=0.75),
    'fabric': flat('Canvas', (0.93, 0.91, 0.86), roughness=0.9),
    'steel': flat('Steel', (0.6, 0.6, 0.62), roughness=0.3, metallic=1.0),
    'play_red': flat('PlayRed', (0.75, 0.12, 0.06), roughness=0.5),
    'play_yellow': flat('PlayYellow', (0.95, 0.68, 0.05), roughness=0.5),
    'play_teal': flat('PlayTeal', (0.02, 0.45, 0.5), roughness=0.5),
}
log('AMENITY materials ready: %s' % ', '.join(k for k, v in M.items() if v))

CUBE = load('/Engine/BasicShapes/Cube')
PLANE = load('/Engine/BasicShapes/Plane')
CYLINDER = load('/Engine/BasicShapes/Cylinder')
CONE = load('/Engine/BasicShapes/Cone')
count = {'n': 0}


def box(label, x0, y0, z0, x1, y1, z1, material, mesh=None, sub='Hardscape'):
    actor = actors.spawn_actor_from_object(mesh or CUBE, unreal.Vector((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
                                           unreal.Rotator(0, 0, 0))
    actor.set_actor_scale3d(unreal.Vector(max(x1 - x0, 1) / 100.0, max(y1 - y0, 1) / 100.0, max(z1 - z0, 1) / 100.0))
    actor.set_actor_label(label)
    actor.set_folder_path(unreal.Name('%s/%s' % (FOLDER, sub)))
    if material:
        actor.get_component_by_class(unreal.StaticMeshComponent).set_material(0, material)
    count['n'] += 1
    return actor


def slab(label, rect, z, material, sub='Hardscape'):
    x0, y0, x1, y1 = rect
    actor = actors.spawn_actor_from_object(PLANE, unreal.Vector((x0 + x1) / 2, (y0 + y1) / 2, z),
                                           unreal.Rotator(0, 0, 0))
    actor.set_actor_scale3d(unreal.Vector((x1 - x0) / 100.0, (y1 - y0) / 100.0, 1.0))
    actor.set_actor_label(label)
    actor.set_folder_path(unreal.Name('%s/%s' % (FOLDER, sub)))
    actor.get_component_by_class(unreal.StaticMeshComponent).set_material(0, material)
    count['n'] += 1
    return actor


VARIANTS = ('shrub_02', 'searsia_lucida', 'fern_02', 'potted_plant_02', 'potted_plant_04')


def place(model_id, x, y, z, yaw=0.0, scale=1.0, sub='Planting'):
    meshes = import_model(model_id)
    if model_id in VARIANTS and len(meshes) > 1:
        # These ship several plants in one file; one per spot, and recentred.
        mesh = random.choice(meshes)
        b = mesh.get_bounding_box()
        cx, cy = (b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2
        angle = math.radians(yaw)
        x -= (cx * math.cos(angle) - cy * math.sin(angle)) * scale
        y -= (cx * math.sin(angle) + cy * math.cos(angle)) * scale
        meshes = [mesh]
    for mesh in meshes:
        actor = actors.spawn_actor_from_object(mesh, unreal.Vector(x, y, z), unreal.Rotator(0.0, 0.0, yaw))
        actor.set_actor_scale3d(unreal.Vector(scale, scale, scale))
        actor.set_actor_label('%s_%d' % (model_id, count['n']))
        actor.set_folder_path(unreal.Name('%s/%s' % (FOLDER, sub)))
        count['n'] += 1


# -- the podium slab, with the pool cut out of it ---------------------------- --
for index, rect in enumerate(frame_around(ZONE, POOL)):
    box('Slab_%d' % index, rect[0], rect[1], -14.0, rect[2], rect[3], TOP, M['concrete'])
    slab('Lawn_%d' % index, rect, TOP + 0.5, M['grass'], sub='Landscape')

# Pool deck and timber sundeck, laid over the lawn.
for index, rect in enumerate(frame_around(POOL_DECK, POOL)):
    slab('PoolDeck_%d' % index, rect, TOP + 1.5, M['pool_deck'], sub='Pool')
slab('Sundeck', SUNDECK, TOP + 1.5, M['timber'], sub='Pool')

# The basin: floor, four tiled walls, water.
px0, py0, px1, py1 = POOL
slab('PoolFloor', POOL, POOL_FLOOR_Z, M['pool_tiles'], sub='Pool')
WALL = 12.0
box('PoolWall_S', px0, py0, POOL_FLOOR_Z, px1, py0 + WALL, TOP + 1.0, M['pool_tiles'], sub='Pool')
box('PoolWall_N', px0, py1 - WALL, POOL_FLOOR_Z, px1, py1, TOP + 1.0, M['pool_tiles'], sub='Pool')
box('PoolWall_W', px0, py0, POOL_FLOOR_Z, px0 + WALL, py1, TOP + 1.0, M['pool_tiles'], sub='Pool')
box('PoolWall_E', px1 - WALL, py0, POOL_FLOOR_Z, px1, py1, TOP + 1.0, M['pool_tiles'], sub='Pool')
slab('Water', (px0 + WALL, py0 + WALL, px1 - WALL, py1 - WALL), WATER_Z, M['water'], sub='Pool')
# Coping: a white stone lip round the edge.
for name, rect in (('S', (px0 - 30, py0 - 30, px1 + 30, py0)), ('N', (px0 - 30, py1, px1 + 30, py1 + 30)),
                   ('W', (px0 - 30, py0, px0, py1)), ('E', (px1, py0, px1 + 30, py1))):
    box('Coping_%s' % name, rect[0], rect[1], TOP, rect[2], rect[3], TOP + 6.0, M['white'], sub='Pool')

# Jogging track, round the slab.
tx0, ty0, tx1, ty1 = TRACK_OUT
for name, rect in (('S', (tx0, ty0, tx1, ty0 + TRACK_W)), ('N', (tx0, ty1 - TRACK_W, tx1, ty1)),
                   ('W', (tx0, ty0 + TRACK_W, tx0 + TRACK_W, ty1 - TRACK_W)),
                   ('E', (tx1 - TRACK_W, ty0 + TRACK_W, tx1, ty1 - TRACK_W))):
    slab('Track_%s' % name, rect, TOP + 1.0, M['track'], sub='Track')

# Paths: from the track to the sundeck, and from the pool deck to the clubhouse.
slab('Path_Deck', (-1500.0, ty0 + TRACK_W, -900.0, SUNDECK[1]), TOP + 1.2, M['paving'], sub='Landscape')
slab('Path_Club', (POOL_DECK[2], 6450.0, CLUB[0], 6950.0), TOP + 1.2, M['paving'], sub='Landscape')
slab('Path_Play', (PLAY[2], 6100.0, POOL_DECK[0], 6500.0), TOP + 1.2, M['gravel'], sub='Landscape')

# Kids' play area.
slab('PlayFloor', PLAY, TOP + 1.3, M['play'], sub='Play')
cx, cy = (PLAY[0] + PLAY[2]) / 2, (PLAY[1] + PLAY[3]) / 2
box('PlayTower', cx - 120, cy - 120, TOP, cx + 120, cy + 120, TOP + 190, M['play_yellow'], sub='Play')
box('PlayRoof', cx - 150, cy - 150, TOP + 330, cx + 150, cy + 150, TOP + 350, M['play_red'], sub='Play')
for dx in (-110, 110):
    for dy in (-110, 110):
        box('PlayPost', cx + dx - 8, cy + dy - 8, TOP + 190, cx + dx + 8, cy + dy + 8, TOP + 330, M['steel'], sub='Play')
slide = box('PlaySlide', cx + 120, cy - 45, TOP + 60, cx + 470, cy + 45, TOP + 76, M['play_teal'], sub='Play')
slide.set_actor_rotation(unreal.Rotator(0.0, -28.0, 0.0), False)
slide.set_actor_location(unreal.Vector(cx + 270, cy, TOP + 100), False, False)
# Swing frame.
sx, sy = cx - 500, cy + 650
for dx in (-220, 220):
    box('SwingLeg', sx + dx - 7, sy - 7, TOP, sx + dx + 7, sy + 7, TOP + 250, M['play_red'], sub='Play')
box('SwingBeam', sx - 230, sy - 8, TOP + 245, sx + 230, sy + 8, TOP + 262, M['play_red'], sub='Play')
for dx in (-100, 100):
    box('SwingSeat', sx + dx - 30, sy - 12, TOP + 45, sx + dx + 30, sy + 12, TOP + 52, M['play_teal'], sub='Play')
    box('SwingRope', sx + dx - 1.5, sy - 1.5, TOP + 52, sx + dx + 1.5, sy + 1.5, TOP + 245, M['steel'], sub='Play')

# -- clubhouse pavilion ------------------------------------------------------ --
cx0, cy0, cx1, cy1 = CLUB
H = 450.0
box('Club_Floor', cx0, cy0, TOP, cx1, cy1, TOP + 12, M['timber'], sub='Clubhouse')
box('Club_Roof', cx0 - 120, cy0 - 120, TOP + H, cx1 + 120, cy1 + 120, TOP + H + 35, M['white'], sub='Clubhouse')
box('Club_Back', cx0, cy1 - 25, TOP, cx1, cy1, TOP + H, M['white'], sub='Clubhouse')     # solid north wall
box('Club_East', cx1 - 25, cy0, TOP, cx1, cy1, TOP + H, M['white'], sub='Clubhouse')
box('Club_GlassS', cx0, cy0, TOP + 12, cx1, cy0 + 4, TOP + H, M['glass'], sub='Clubhouse')
d0, d1 = CLUB_DOOR
box('Club_GlassW1', cx0, cy0, TOP + 12, cx0 + 4, d0, TOP + H, M['glass'], sub='Clubhouse')
box('Club_GlassW2', cx0, d1, TOP + 12, cx0 + 4, cy1, TOP + H, M['glass'], sub='Clubhouse')
for x in range(int(cx0), int(cx1) + 1, 300):                                          # mullions
    box('Club_Mullion', x - 4, cy0 - 4, TOP + 12, x + 4, cy0 + 4, TOP + H, M['frame'], sub='Clubhouse')
for y in (cy0, d0, d1, cy1):
    box('Club_Mullion', cx0 - 4, y - 4, TOP + 12, cx0 + 4, y + 4, TOP + H, M['frame'], sub='Clubhouse')

# Lounge and cafe inside.
place('sofa_02', cx0 + 900, cy1 - 170, TOP + 12, yaw=180.0, sub='Clubhouse')
place('sofa_02', cx0 + 1400, cy1 - 170, TOP + 12, yaw=180.0, sub='Clubhouse')
place('modern_coffee_table_01', cx0 + 1150, cy1 - 420, TOP + 12, sub='Clubhouse')
for dx, yaw in ((-160, 90.0), (160, -90.0)):
    place('modern_arm_chair_01', cx0 + 1150 + dx, cy1 - 460, TOP + 12, yaw=yaw, sub='Clubhouse')
for x in (cx0 + 350, cx0 + 800):
    place('outdoor_table_chair_set_01', x, cy0 + 300, TOP + 12, yaw=random.uniform(0, 90), sub='Clubhouse')
for x, y in ((cx0 + 120, cy1 - 120), (cx1 - 140, cy1 - 140), (cx1 - 140, cy0 + 140)):
    place('potted_plant_02', x, y, TOP + 12, yaw=random.uniform(0, 360), sub='Clubhouse')

# -- poolside ----------------------------------------------------------------- --
for i, x in enumerate(range(-2650, 400, 620)):
    place('vintage_day_bed', x, 5500.0, TOP + 1.5, yaw=90.0, sub='Poolside')
for x in (-2340, -1100, 140):
    box('Parasol_Pole', x - 3, 5220 - 3, TOP, x + 3, 5220 + 3, TOP + 260, M['steel'], sub='Poolside')
    canopy = actors.spawn_actor_from_object(CONE, unreal.Vector(x, 5220.0, TOP + 275), unreal.Rotator(0, 0, 0))
    canopy.set_actor_scale3d(unreal.Vector(3.0, 3.0, 0.45))
    canopy.set_actor_label('Parasol_Canopy')
    canopy.set_folder_path(unreal.Name('%s/Poolside' % FOLDER))
    canopy.get_component_by_class(unreal.StaticMeshComponent).set_material(0, M['fabric'])

# Palms round the water.
PALMS = [(-3350, 5300), (-3350, 7000), (-3350, 8400), (-1600, 8450), (-100, 8450), (950, 8400),
         (950, 7200), (950, 5300), (-5200, 8900), (-500, 9400)]
for i, (x, y) in enumerate(PALMS):
    place('island_tree_0%d' % (i % 3 + 1), x, y, TOP, yaw=random.uniform(0, 360),
          scale=random.uniform(1.7, 2.3))

# Jacarandas in the garden.
for x, y in ((-7600, 9600), (-4200, 10300), (1600, 10000), (4700, 9500), (-8600, 8200), (4700, 5000)):
    place('jacaranda_tree', x, y, TOP, yaw=random.uniform(0, 360), scale=random.uniform(0.9, 1.15))

# Shrubs along the inner edge of the track.
SHRUBS = ('shrub_02', 'searsia_lucida', 'fern_02')
inner = TRACK_W + 180
edges = []
for x in range(int(tx0 + inner), int(tx1 - inner), 650):
    edges.append((x, ty0 + inner))
    edges.append((x, ty1 - inner))
for y in range(int(ty0 + inner), int(ty1 - inner), 650):
    edges.append((tx0 + inner, y))
    edges.append((tx1 - inner, y))
for i, (x, y) in enumerate(edges):
    if -1700 < x < -700 and y < 5000:          # keep the path clear
        continue
    place(SHRUBS[i % 3], x + random.uniform(-80, 80), y + random.uniform(-80, 80), TOP,
          yaw=random.uniform(0, 360), scale=random.uniform(1.4, 2.2), sub='Planting')

# Benches, picnic tables and lamps.
for x in (-7000, -3000, 1000, 4500):
    place('painted_wooden_bench', x, ty1 - TRACK_W - 120, TOP, yaw=180.0, sub='Furniture')
for y in (6000, 9000):
    place('painted_wooden_bench', tx0 + TRACK_W + 120, y, TOP, yaw=90.0, sub='Furniture')
for x, y in ((3000, 9600), (4700, 8200), (-6300, 9800)):
    place('wooden_picnic_table', x, y, TOP, yaw=random.uniform(0, 180), sub='Furniture')
for x in range(int(tx0), int(tx1) + 1, 2000):
    place('street_lamp_01', x, ty0 - 60, TOP, yaw=90.0, sub='Furniture')
    place('street_lamp_01', x, ty1 + 60, TOP, yaw=-90.0, sub='Furniture')
for y in (CLUB[1] + 150, CLUB[3] - 150):
    place('planter_box_01', CLUB[0] - 160, y, TOP, sub='Furniture')

# -- the forecourt, south, where the camera arrives ------------------------- --
for x in (-6800, -4400, 1400, 3800):
    place('island_tree_0%d' % (int(abs(x)) % 3 + 1), x, -7000, -5, yaw=random.uniform(0, 360), scale=2.1,
          sub='Forecourt')
for x in (-6000, -3000, 0, 3000):
    place('street_lamp_02', x, -7550, -5, yaw=90.0, sub='Forecourt')
for x in (-3200, 200):
    place('planter_box_02', x, -2600, -5, sub='Forecourt')

unreal.EditorAssetLibrary.save_directory(ROOT, only_if_is_dirty=False)
unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
log('AMENITIES READY: %d actors' % count['n'])
