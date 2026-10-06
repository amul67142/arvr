"""Put a named box on every flat, and give each one its own ID colour.

The mesh has no flats in it — its geometry is grouped by material, one skin for
the whole tower. So the flats are added here: a box per home, tiling the tower
plate, each pushed twelve centimetres proud of the facade so that in the ID
pass it wins the depth test against the glass behind it. The boxes together
form a closed shell, which is what makes the far side occlude correctly.

Hidden in the beauty pass. Shown, flat and unlit, in the ID pass.
"""
import unreal

FLOORS = 25
BASE_Z = 1483.0
PITCH = 330.0
SLAB = 30.0
PLATE = (-4124.0, -1600.0, 996.0, 1420.0)   # x0 y0 x1 y1, the tower footprint
COLS, ROWS = 3, 2                            # 6 homes a floor
PROUD = 12.0
LETTERS = 'ABCDEF'
ID_DIR = '/Game/Tower/ID'

log = unreal.log
tools = unreal.AssetToolsHelpers.get_asset_tools()
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
lib = unreal.MaterialEditingLibrary


def srgb_to_linear(c):
    """A byte we want to read back out of the PNG, as the linear value to emit."""
    v = c / 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def id_colour(index):
    """Distinct bytes, far enough apart to survive any encoding wobble."""
    return (30 + (index % 12) * 20, 30 + ((index // 12) % 12) * 20, 40 + ((index // 144) % 5) * 40)


# -- the base ID material: unlit, one colour parameter --------------------- --
if unreal.EditorAssetLibrary.does_asset_exist('%s/M_ID' % ID_DIR):
    unreal.EditorAssetLibrary.delete_directory(ID_DIR)
base = tools.create_asset('M_ID', ID_DIR, unreal.Material, unreal.MaterialFactoryNew())
base.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_UNLIT)
param = lib.create_material_expression(base, unreal.MaterialExpressionVectorParameter, -400, 0)
param.set_editor_property('parameter_name', 'IDColour')
lib.connect_material_property(param, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR)
lib.recompile_material(base)
log('ID MATERIAL built')

# -- a box per home --------------------------------------------------------- --
cube = unreal.EditorAssetLibrary.load_asset('/Engine/BasicShapes/Cube')
x0, y0, x1, y1 = PLATE
cell_w = (x1 - x0) / COLS
cell_d = (y1 - y0) / ROWS

# Clear any previous run.
removed = 0
for actor in actors.get_all_level_actors():
    if str(actor.get_folder_path()) == 'Units':
        actors.destroy_actor(actor)
        removed += 1
log('CLEARED %d unit boxes' % removed)

rows = []
index = 0
for floor in range(1, FLOORS + 1):
    z0 = BASE_Z + PITCH * (floor - 1)
    z1 = z0 + PITCH - SLAB
    for row in range(ROWS):
        for col in range(COLS):
            letter = LETTERS[row * COLS + col]
            name = 'T1_F%02d_%s' % (floor, letter)

            ax0 = x0 + cell_w * col - (PROUD if col == 0 else 0)
            ax1 = x0 + cell_w * (col + 1) + (PROUD if col == COLS - 1 else 0)
            ay0 = y0 + cell_d * row - (PROUD if row == 0 else 0)
            ay1 = y0 + cell_d * (row + 1) + (PROUD if row == ROWS - 1 else 0)

            actor = actors.spawn_actor_from_object(
                cube,
                unreal.Vector((ax0 + ax1) / 2, (ay0 + ay1) / 2, (z0 + z1) / 2),
                unreal.Rotator(0, 0, 0))
            actor.set_actor_scale3d(unreal.Vector((ax1 - ax0) / 100, (ay1 - ay0) / 100, (z1 - z0) / 100))
            actor.set_actor_label(name)
            actor.set_folder_path(unreal.Name('Units'))
            actor.set_actor_hidden_in_game(True)     # invisible in the beauty pass

            r, g, b = id_colour(index)
            instance = tools.create_asset('MI_%s' % name, ID_DIR, unreal.MaterialInstanceConstant,
                                          unreal.MaterialInstanceConstantFactoryNew())
            lib.set_material_instance_parent(instance, base)
            lib.set_material_instance_vector_parameter_value(
                instance, 'IDColour',
                unreal.LinearColor(srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0))
            actor.get_component_by_class(unreal.StaticMeshComponent).set_material(0, instance)

            rows.append('%d,%d,%d,%s' % (r, g, b, name))
            index += 1

log('SPAWNED %d unit boxes over %d floors' % (index, FLOORS))

with open('C:/Users/DELL/Documents/Unreal Projects/TowerRender/Saved/Renders/colors.csv', 'w') as handle:
    handle.write('r,g,b,name\n' + '\n'.join(rows) + '\n')
log('WROTE colors.csv (%d entries)' % len(rows))

unreal.EditorAssetLibrary.save_directory('/Game/Tower', only_if_is_dirty=False)
unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
log('BOXES READY')
