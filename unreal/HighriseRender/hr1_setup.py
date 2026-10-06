"""The 21-storey high-rise, swapped in for the curved tower.

The site, gardens, pool, clubhouse, sky and lighting all came across with the
project; only the building changes. This makes a copy of the old map, imports
the new FBX at a real-world scale, removes the old tower and its podium, and
stands the new building where the old one stood.

Scale: the model is drawn small - a storey is 200 units, which would be a 2 m
floor - so it comes in at 1.5x for a 3 m storey.

Writes Saved/Lookup/building.json (where the building ended up) for
scripts/make-id-lookup.mjs, so the flat colours fit it without anyone measuring.
"""
import json
import os
import unreal

PROJECT = 'C:/Users/DELL/Documents/Unreal Projects/HighriseRender'
FBX = PROJECT + '/SourceArt/highrise.fbx'
MAP = '/Game/Tower/Maps/TowerOrbit'
MESH_DIR = '/Game/Highrise/Mesh'
SCALE = 1.5
SITE_CENTRE = (-1564.0, -90.0)   # where the old tower stood, mid-plot

log = unreal.log
assets = unreal.EditorAssetLibrary
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
levels = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)

# -- a copy of the old scene ------------------------------------------------- --
# This project is itself the copy: its TowerOrbit map becomes the high-rise
# scene. (Saving the map under a new name did not switch the editor to it, so
# the changes landed in TowerOrbit anyway - simpler to say so outright.)
levels.load_level(MAP)

# -- the building ------------------------------------------------------------- --
task = unreal.AssetImportTask()
task.filename = FBX
task.destination_path = MESH_DIR
task.automated = True
task.save = True
task.replace_existing = True
opts = unreal.FbxImportUI()
opts.import_mesh = True
opts.import_as_skeletal = False
opts.import_materials = True
opts.import_textures = True
opts.static_mesh_import_data.combine_meshes = True
opts.static_mesh_import_data.convert_scene = True
opts.static_mesh_import_data.import_uniform_scale = SCALE
opts.static_mesh_import_data.generate_lightmap_u_vs = False
task.options = opts
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
paths = list(task.get_editor_property('imported_object_paths') or [])
meshes = [m for m in (assets.load_asset(p) for p in paths) if isinstance(m, unreal.StaticMesh)]
log('IMPORTED %d objects, %d meshes' % (len(paths), len(meshes)))

# -- out with the old tower ---------------------------------------------------- --
removed = 0
for actor in actors.get_all_level_actors():
    if str(actor.get_folder_path()) in ('Building', 'Units'):
        actors.destroy_actor(actor)
        removed += 1
log('REMOVED %d old building actors' % removed)

# -- in with the new, centred on the plot, standing on the ground --------------- --
placed = []
for mesh in meshes:
    actor = actors.spawn_actor_from_object(mesh, unreal.Vector(0, 0, 0), unreal.Rotator(0, 0, 0))
    actor.set_actor_label('Highrise_%s' % mesh.get_name())
    actor.set_folder_path(unreal.Name('Building'))
    # Thin railings and mullions: keep every one of them, as the foliage taught us.
    try:
        nanite = mesh.get_editor_property('nanite_settings')
        if nanite.get_editor_property('enabled'):
            nanite.set_editor_property('enabled', False)
            mesh.set_editor_property('nanite_settings', nanite)
    except Exception as reason:
        log('nanite setting skipped: %s' % reason)
    placed.append(actor)

lo = [1e9] * 3
hi = [-1e9] * 3
for actor in placed:
    origin, extent = actor.get_actor_bounds(False)
    for i, axis in enumerate(('x', 'y', 'z')):
        lo[i] = min(lo[i], getattr(origin, axis) - getattr(extent, axis))
        hi[i] = max(hi[i], getattr(origin, axis) + getattr(extent, axis))
shift = unreal.Vector(SITE_CENTRE[0] - (lo[0] + hi[0]) / 2, SITE_CENTRE[1] - (lo[1] + hi[1]) / 2, -lo[2])
for actor in placed:
    actor.set_actor_location(actor.get_actor_location() + shift, False, False)
lo = [lo[0] + shift.x, lo[1] + shift.y, lo[2] + shift.z]
hi = [hi[0] + shift.x, hi[1] + shift.y, hi[2] + shift.z]
log('HIGHRISE x %.0f..%.0f  y %.0f..%.0f  z %.0f..%.0f  (%.1f x %.1f x %.1f m)' % (
    lo[0], hi[0], lo[1], hi[1], lo[2], hi[2], (hi[0] - lo[0]) / 100, (hi[1] - lo[1]) / 100, (hi[2] - lo[2]) / 100))

slots = []
for mesh in meshes:
    for material in mesh.get_editor_property('static_materials'):
        slots.append(str(material.get_editor_property('material_slot_name')))
log('MATERIAL SLOTS %s' % ', '.join(slots))

# The model has no roof; whether the top needs a slab is decided after a look.

os.makedirs(PROJECT + '/Saved/Lookup', exist_ok=True)
with open(PROJECT + '/Saved/Lookup/building.json', 'w') as handle:
    json.dump({'min': lo, 'max': hi, 'centre': SITE_CENTRE, 'scale': SCALE, 'slots': slots}, handle, indent=2)

assets.save_directory('/Game/Highrise', only_if_is_dirty=False)
levels.save_current_level()
log('HIGHRISE SETUP DONE')
