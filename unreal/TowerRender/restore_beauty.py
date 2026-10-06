"""Put the level back in its beauty state after an ID pass.

The ID pass blacks the building and the site, paints the tower with lookup
colours and hides the sky. This restores the look as the environment work left
it: HDRI backdrop on, its own sky light doing the fill, the procedural sky and
our old sky light kept off so the scene is not lit twice.
"""
import unreal

log = unreal.log
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
load = unreal.EditorAssetLibrary.load_asset

LOOK = {
    '_GlassReal': 'M_GlassReal', '_WhiteGrey': 'M_WhiteGrey', 'aluminum2': 'M_aluminum2',
    'Ceramic_Black': 'M_Ceramic_Black', 'Plaster': 'M_Plaster', 'AO': 'M_AO',
}
look = {k: load('/Game/Tower/Materials/%s' % v) for k, v in LOOK.items()}
SITE = {
    'Ground_City': 'M_Concrete', 'Lawn_West': 'M_Grass', 'Lawn_East': 'M_Grass', 'Lawn_North': 'M_Grass',
    'Plot_Paving': 'M_Paving', 'Forecourt': 'M_Paving', 'Road_Main': 'M_Asphalt', 'Road_Side': 'M_Asphalt',
}
site = {k: load('/Game/Tower/Env/%s' % v) for k, v in SITE.items()}
SHOWN = ('HDRIBackdrop', 'Sun', 'HeightFog')
HIDDEN = ('SkyAtmosphere', 'SkyLight')

counts = {'building': 0, 'site': 0, 'units': 0}
for actor in actors.get_all_level_actors():
    folder = str(actor.get_folder_path())
    label = actor.get_actor_label()
    if folder == 'Building':
        component = actor.get_component_by_class(unreal.StaticMeshComponent)
        mesh = component.get_editor_property('static_mesh')
        for slot, material in enumerate(mesh.get_editor_property('static_materials')):
            name = str(material.get_editor_property('material_slot_name')).lower()
            for key, built in look.items():
                if built and key.lower().strip('_') in name:
                    component.set_material(slot, built)
                    break
        counts['building'] += 1
    elif folder == 'Site' and site.get(label):
        actor.get_component_by_class(unreal.StaticMeshComponent).set_material(0, site[label])
        counts['site'] += 1
    elif folder == 'Units':
        actor.set_actor_hidden_in_game(True)
        counts['units'] += 1
    elif folder.startswith('Amenities'):
        actor.set_actor_hidden_in_game(False)       # an ID pass hides the gardens
    elif label in SHOWN:
        actor.set_actor_hidden_in_game(False)
    elif label in HIDDEN:
        actor.set_actor_hidden_in_game(True)

unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
log('BEAUTY RESTORED building %(building)d · site %(site)d · units hidden %(units)d' % counts)
