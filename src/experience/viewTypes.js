/**
 * The registry of view types an experience can contain.
 *
 * Adding rotation / panorama / floorplan / video later is a table entry plus a
 * renderer — no changes to navigation, the editor, persistence or the asset
 * lifecycle. Types marked `available: false` are declared here so the shape is
 * settled, but they are not offered in the UI and have no renderer yet.
 */
export const VIEW_TYPES = {
  '3d': {
    id: '3d',
    label: '3D Model',
    hint: 'GLB or GLTF masterplan',
    accept: '.glb,.gltf,model/gltf-binary,model/gltf+json',
    extensions: ['glb', 'gltf'],
    multiple: true, // a .gltf may arrive with companion .bin / textures
    available: true,
  },
  image: {
    id: 'image',
    label: 'Image',
    hint: 'Render, elevation or still',
    accept: '.jpg,.jpeg,.png,.webp,image/*',
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
    multiple: false,
    available: true,
  },

  walkthrough: {
    id: 'walkthrough',
    label: 'Walkthrough',
    hint: 'Walkable interior or site, GLB',
    accept: '.glb,.gltf,model/gltf-binary,model/gltf+json',
    extensions: ['glb', 'gltf'],
    multiple: true,
    available: true,
  },

  // Real footage or renders turned round by dragging — the way Panom works.
  // A video is split into frames in the browser; a .json manifest (the demo)
  // lists prepared frames plus traced tower outlines.
  rotation: {
    id: 'rotation',
    label: '360° Rotation',
    hint: 'Drone or render orbit video',
    accept: '.mp4,.webm,.mov,.json,video/*',
    extensions: ['mp4', 'webm', 'mov', 'json'],
    multiple: false,
    available: true,
  },
  // Equirectangular 360° photos or renders; a .json manifest lists rooms.
  panorama: {
    id: 'panorama',
    label: '360° Panorama',
    hint: 'Equirectangular photo or render',
    accept: '.jpg,.jpeg,.png,.webp,.json,image/*',
    extensions: ['jpg', 'jpeg', 'png', 'webp', 'json'],
    multiple: false,
    available: true,
  },

  // Renders with a clickable layer traced on: building, floors, every flat,
  // amenity pins, and the inventory beside it. A .json manifest describes it.
  showcase: {
    id: 'showcase',
    label: 'Interactive Render',
    hint: 'Renders with clickable flats',
    accept: '.json,application/json',
    extensions: ['json'],
    multiple: false,
    available: true,
  },

  // Declared, not implemented.
  floorplan: { id: 'floorplan', label: 'Floorplan', available: false },
  video: { id: 'video', label: 'Video', available: false },
}

export const AVAILABLE_VIEW_TYPES = Object.values(VIEW_TYPES).filter(
  (type) => type.available,
)

export function getViewType(id) {
  return VIEW_TYPES[id] ?? null
}

export function viewTypeLabel(id) {
  return VIEW_TYPES[id]?.label ?? id
}

/** Does this file match what the given view type accepts? */
export function isAcceptedFile(typeId, file) {
  const type = VIEW_TYPES[typeId]
  if (!type?.extensions) return false
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return type.extensions.includes(extension)
}
