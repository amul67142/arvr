"""What is standing in the open map: the building actors and their bounds."""
import unreal

actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
world = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
unreal.log('PROBE world %s' % world.get_path_name())
for actor in actors.get_all_level_actors():
    if str(actor.get_folder_path()) == 'Building':
        origin, extent = actor.get_actor_bounds(False)
        unreal.log('PROBE building %s  centre (%.0f %.0f %.0f)  half (%.0f %.0f %.0f)' % (
            actor.get_actor_label(), origin.x, origin.y, origin.z, extent.x, extent.y, extent.z))
unreal.log('PROBE done')
