# Unreal scripts

The Python that builds and renders the two Unreal test scenes. The projects
themselves live in `Documents/Unreal Projects/` (content and renders are too
large for git); these are copies of their `Content/Python` folders.

- `TowerRender/` - the curved tower: import, scene, environment, amenities,
  360 tour, orbit video (`step19`) and its ID pass (`step20`). Run in the
  editor console with `py "<path>"`.
- `HighriseRender/` - the 21-storey slab (CGTrader, free licence) in the same
  scene. `hr1_setup` imports and places it, `hr2_idsurface` builds the ID
  material from `node scripts/make-id-lookup.mjs <Saved/Lookup> highrise`,
  `hr3`/`hr4` render the orbit video and its ID pass, `hr5` restores the look.
  `hr_run.py` chains the renders:
  `UnrealEditor.exe HighriseRender.uproject -ExecCmds="py C:/Users/DELL/hr_run.py"`.

Then, in this repo: `import-unreal-render.mjs` -> `trace-masks.mjs` ->
`build-unreal-project.mjs` (see the script headers).
