"""Light the clubhouse from inside.

The pavilion had no fixtures, only daylight through its glass - and the roof
and two solid walls block most of that - so in the 360 the interior sat nearly
black against a bright exterior. Opening the exposure would only blow the
outside out, since a 360 frame sees both at once. A real clubhouse is lit by
its ceiling, so this adds a grid of warm panels under the roof.
"""
import unreal

INTENSITY = 60.0          # candela per panel; tune against a test frame
TOP = 120.0
CLUB = (2000.0, 6100.0, 3800.0, 7300.0)
CEILING = TOP + 450.0 - 12.0
WARM = unreal.LinearColor(1.0, 0.87, 0.72, 1.0)   # about 3500 K

log = unreal.log
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
for actor in actors.get_all_level_actors():
    if actor.get_actor_label().startswith('Club_Light'):
        actors.destroy_actor(actor)

x0, y0, x1, y1 = CLUB
placed = 0
for i, x in enumerate((x0 + 300, (x0 + x1) / 2, x1 - 300)):
    for j, y in enumerate((y0 + 300, y1 - 300)):
        light = actors.spawn_actor_from_class(unreal.RectLight, unreal.Vector(x, y, CEILING),
                                              unreal.Rotator(0.0, -90.0, 0.0))
        light.set_actor_label('Club_Light_%d%d' % (i, j))
        light.set_folder_path(unreal.Name('Amenities/Clubhouse'))
        component = light.get_component_by_class(unreal.RectLightComponent)
        component.set_mobility(unreal.ComponentMobility.MOVABLE)
        component.set_intensity(INTENSITY)
        component.set_light_color(WARM)
        component.set_editor_property('source_width', 140.0)
        component.set_editor_property('source_height', 140.0)
        component.set_editor_property('attenuation_radius', 1400.0)
        placed += 1

unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
log('CLUB LIGHTS %d panels at %.0f cd' % (placed, INTENSITY))
