"""Put the scene back the way the beauty pass wants it.

The ID pass blacks the building, shows the unit boxes and hides the sky. This
undoes exactly those three things and touches nothing else — in particular not
the camera, which the orbit sequence has already been built around.
"""
import unreal

log = unreal.log
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

MATCH = {
    '_GlassReal': 'M_GlassReal', '_WhiteGrey': 'M_WhiteGrey', 'aluminum2': 'M_aluminum2',
    'Ceramic_Black': 'M_Ceramic_Black', 'Plaster': 'M_Plaster', 'AO': 'M_AO',
}
loaded = {k: unreal.EditorAssetLibrary.load_asset('/Game/Tower/Materials/%s' % v) for k, v in MATCH.items()}

restored = 0
hidden = 0
for actor in actors.get_all_level_actors():
    folder = str(actor.get_folder_path())
    if folder == 'Building':
        component = actor.get_component_by_class(unreal.StaticMeshComponent)
        mesh = component.get_editor_property('static_mesh')
        for slot, material in enumerate(mesh.get_editor_property('static_materials')):
            name = str(material.get_editor_property('material_slot_name')).lower()
            for key, built in loaded.items():
                if built and key.lower().strip('_') in name:
                    component.set_material(slot, built)
                    restored += 1
                    break
    elif folder == 'Units':
        actor.set_actor_hidden_in_game(True)
        hidden += 1
    elif actor.get_actor_label() in ('SkyAtmosphere', 'HeightFog', 'Sun', 'SkyLight'):
        actor.set_actor_hidden_in_game(False)

log('RESTORED %d material slots · hid %d unit boxes' % (restored, hidden))
unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
log('LOOK RESTORED')
