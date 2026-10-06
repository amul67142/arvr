"""Turn Nanite off for the amenity models.

Interchange imported every Poly Haven model as a Nanite mesh. Nanite simplifies
by screen area, and a leaf card is a flat sliver with almost none - so at any
real distance the leaves are simplified out of existence and the tree renders
as bare branches, which is exactly what the test frames showed. The thicker
trunk survives, which is why the problem looked like a material fault.

These models are a few thousand triangles each; Nanite buys nothing here.
"""
import unreal

log = unreal.log
meshes = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)

changed = 0
for path in unreal.EditorAssetLibrary.list_assets('/Game/Amenity/Models', recursive=True, include_folder=False):
    mesh = unreal.EditorAssetLibrary.load_asset(path)
    if not isinstance(mesh, unreal.StaticMesh):
        continue
    settings = mesh.get_editor_property('nanite_settings')
    if not settings.get_editor_property('enabled'):
        continue
    settings.set_editor_property('enabled', False)
    try:
        meshes.set_nanite_settings(mesh, settings, apply_changes=True)
    except Exception:
        mesh.set_editor_property('nanite_settings', settings)
    unreal.EditorAssetLibrary.save_loaded_asset(mesh)
    changed += 1
log('NANITE disabled on %d amenity meshes' % changed)
