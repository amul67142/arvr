/**
 * The bundled demos: every view type, wired end to end. Files are served from
 * public/demo, so unlike uploads they can be fetched again after a reload.
 * Views shared between demos (the interiors) keep one id, so unit types link
 * to them in either project.
 */
export const DEMO_PROJECTS = {
  'aravali-vista': {
    title: 'Aravali Vista',
    summary: 'Four-tower masterplan, 3BHK walkthrough and amenities',
    project: { id: 'aravali-vista-demo', name: 'Aravali Vista', startViewId: 'masterplan' },
    views: [
      { id: 'masterplan', name: 'Masterplan', type: '3d', src: '/demo/masterplan.glb' },
      { id: 'tower-d-exterior', name: 'Tower D Exterior', type: 'image', src: '/demo/tower-d-render.png' },
      { id: '3bhk-walkthrough', name: '3BHK Walkthrough', type: 'walkthrough', src: '/demo/unit-3bhk.glb' },
      { id: 'amenities-walkthrough', name: 'Amenities Walkthrough', type: 'walkthrough', src: '/demo/amenities.glb' },
      { id: 'master-bedroom', name: 'Master Bedroom (3ds Max)', type: 'walkthrough', src: '/demo/master-bedroom.glb' },
    ],
  },
  'skyline-heights': {
    title: 'Skyline Heights',
    summary: 'A 35-floor tower on its own plot, floor by floor',
    project: { id: 'skyline-heights-demo', name: 'Skyline Heights', startViewId: 'tower-and-site' },
    views: [
      { id: 'tower-and-site', name: 'Tower & Site', type: '3d', src: '/demo/skyline.glb' },
      { id: '3bhk-walkthrough', name: '3BHK Walkthrough', type: 'walkthrough', src: '/demo/unit-3bhk.glb' },
      { id: 'master-bedroom', name: 'Master Bedroom (3ds Max)', type: 'walkthrough', src: '/demo/master-bedroom.glb' },
    ],
  },
  'horizon-one': {
    title: 'Horizon One',
    summary: 'A real tower you turn by dragging — pick a floor off the building, then a home',
    project: { id: 'horizon-one-demo', name: 'Horizon One', startViewId: 'aerial-360' },
    views: [
      { id: 'aerial-360', name: 'Aerial 360', type: 'rotation', src: '/demo/horizon/orbit.json' },
      { id: 'unit-360', name: '3BHK · 360° Tour', type: 'panorama', src: '/demo/sample-tour/tour.json' },
      { id: '3bhk-walkthrough', name: '3BHK Walkthrough', type: 'walkthrough', src: '/demo/unit-3bhk.glb' },
    ],
    // Tower → floor → home → plan → 360° tour or 3D walkthrough.
    unitTypeTargets: { '3BHK': '3bhk-walkthrough', '4BHK': null },
  },
  // A pipeline test rather than a project: the synthetic delivery from
  // scripts/mock-studio.mjs, made clickable by baked hotspots. Needs the three
  // build scripts to have been run; see docs/HOTSPOT-PIPELINE-PLAN.md.
  'mock-tower': {
    title: 'Mock Tower (pipeline test)',
    summary: 'Synthetic renders with every flat, balcony and floor clickable from baked hotspots',
    project: { id: 'mock-tower-demo', name: 'Mock Tower', startViewId: 'mock-orbit' },
    views: [{ id: 'mock-orbit', name: 'Tower Orbit', type: 'rotation', src: '/demo/mock/orbit.json' }],
  },
  'unreal-tower': {
    title: 'Unreal Tower (engine render)',
    summary: 'Rendered in Unreal Engine, every home traced from an object-ID pass rather than projected',
    project: { id: 'unreal-tower-demo', name: 'Unreal Tower', startViewId: 'unreal-orbit' },
    views: [
      { id: 'unreal-orbit', name: 'Tower Orbit', type: 'rotation', src: '/demo/unreal-tower/orbit.json' },
      { id: 'unreal-drone', name: 'Drone Orbit (from video)', type: 'rotation', src: '/demo/unreal-orbit/orbit.json' },
      { id: 'unreal-site-360', name: 'Site Walkthrough', type: 'panorama', src: '/demo/unreal-tower/tour/tour.json' },
    ],
  },
  // The CGTrader 21-storey slab in the same Unreal scene: its flats were
  // coloured automatically from the model's own floors and balcony stacks.
  'unreal-highrise': {
    title: 'Highrise Residences (engine render)',
    summary: '21 floors, 8 homes a floor — every home found from the model itself, no drawing',
    project: { id: 'unreal-highrise-demo', name: 'Highrise Residences', startViewId: 'highrise-orbit' },
    views: [{ id: 'highrise-orbit', name: 'Drone Orbit', type: 'rotation', src: '/demo/unreal-highrise/orbit.json' }],
  },
  'maple-court': {
    title: 'Maple Court',
    summary: 'Professional renders with every flat clickable, filters and inventory — the Panom way',
    project: { id: 'maple-court-demo', name: 'Maple Court', startViewId: 'showcase' },
    views: [{ id: 'showcase', name: 'Maple Court', type: 'showcase', src: '/demo/maple/showcase.json' }],
  },
}
