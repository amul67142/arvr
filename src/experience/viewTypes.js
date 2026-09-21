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

  // Declared, not implemented.
  rotation: { id: 'rotation', label: '360° Rotation', available: false },
  panorama: { id: 'panorama', label: 'Panorama', available: false },
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
