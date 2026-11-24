import * as THREE from 'three'
import {
  createInkMaterial,
  createInkOutlineMaterial,
  type InkToneRole,
  type SharedInkUniforms,
} from './inkShader'
import type { InkTextureBundle } from './inkTextures'

export type MixamoActSlot = 'act1' | 'act2' | 'act4' | 'act5'

export interface MixamoSlotEntry {
  file: string
  scale?: number
  yOffset?: number
  rotationY?: number
  tone?: InkToneRole
}

export interface MixamoManifest {
  models: Partial<Record<MixamoActSlot, MixamoSlotEntry>>
}

export interface LoadedMixamoCharacter {
  group: THREE.Group
  mixer: THREE.AnimationMixer
  action: THREE.AnimationAction | null
  clipDuration: number
  setScrollProgress: (t: number) => void
  dispose: () => void
}

function wrapModelWithInkShader(
  root: THREE.Object3D,
  role: InkToneRole,
  textures: InkTextureBundle,
  shared: SharedInkUniforms,
  disposables: { mats: THREE.Material[]; geos: THREE.BufferGeometry[] },
): void {
  const toClone: THREE.Mesh[] = []

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.SkinnedMesh) {
      toClone.push(obj)
    }
  })

  toClone.forEach((mesh) => {
    const isSkinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true
    const inkMat = createInkMaterial({
      role,
      textures,
      shared,
      popOut: true,
      skinned: isSkinned,
      hatchScale: 1.7,
    })
    const hullMat = createInkOutlineMaterial({
      shared,
      popOut: true,
      skinned: isSkinned,
      thickness: 0.017,
    })

    disposables.mats.push(inkMat, hullMat)
    if (mesh.geometry) disposables.geos.push(mesh.geometry)
    mesh.material = inkMat
    mesh.renderOrder = 5
    mesh.frustumCulled = false

    // Add matching BackSide outline hull sharing the same skeleton if skinned
    if (isSkinned) {
      const skinnedSrc = mesh as THREE.SkinnedMesh
      const hullMesh = new THREE.SkinnedMesh(skinnedSrc.geometry, hullMat)
      hullMesh.skeleton = skinnedSrc.skeleton
      hullMesh.bindMatrix.copy(skinnedSrc.bindMatrix)
      hullMesh.bindMatrixInverse.copy(skinnedSrc.bindMatrixInverse)
      hullMesh.frustumCulled = false
      hullMesh.renderOrder = 5
      skinnedSrc.parent?.add(hullMesh)
    } else {
      const hullMesh = new THREE.Mesh(mesh.geometry, hullMat)
      hullMesh.position.copy(mesh.position)
      hullMesh.rotation.copy(mesh.rotation)
      hullMesh.scale.copy(mesh.scale)
      hullMesh.renderOrder = 5
      mesh.parent?.add(hullMesh)
    }
  })
}

async function loadSingleMixamoSlot(
  entry: MixamoSlotEntry,
  textures: InkTextureBundle,
  shared: SharedInkUniforms,
): Promise<LoadedMixamoCharacter | null> {
  const url = entry.file.startsWith('/') ? entry.file : `/models/${entry.file}`
  const lower = url.toLowerCase()
  const disposables = { mats: [] as THREE.Material[], geos: [] as THREE.BufferGeometry[] }

  let root: THREE.Group
  let animations: THREE.AnimationClip[] = []

  if (lower.endsWith('.fbx')) {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
    const loader = new FBXLoader()
    root = await loader.loadAsync(url)
    animations = root.animations || []
  } else {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)
    root = gltf.scene
    animations = gltf.animations || []
  }

  // Normalize height cleanly to 1.75 world units
  const box = new THREE.Box3().setFromObject(root)
  const height = Math.max(0.01, box.max.y - box.min.y)
  const normScale = (1.75 / height) * (entry.scale ?? 1.0)
  root.scale.setScalar(normScale)
  root.updateMatrixWorld(true)

  const fitted = new THREE.Box3().setFromObject(root)
  root.position.y = -fitted.min.y + (entry.yOffset ?? 0)
  root.rotation.y = entry.rotationY ?? 0

  wrapModelWithInkShader(root, entry.tone ?? 'parchment', textures, shared, disposables)

  const wrapper = new THREE.Group()
  wrapper.add(root)

  const mixer = new THREE.AnimationMixer(root)
  const clip = animations[0] ?? null
  const action = clip ? mixer.clipAction(clip) : null
  if (action) {
    action.play()
  }
  const clipDuration = clip ? Math.max(0.1, clip.duration) : 1.0

  return {
    group: wrapper,
    mixer,
    action,
    clipDuration,
    setScrollProgress: (t: number) => {
      if (!action) return
      const clamped = Math.max(0, Math.min(0.995, t))
      mixer.setTime(clamped * clipDuration)
    },
    dispose: () => {
      mixer.stopAllAction()
      disposables.mats.forEach((m) => m.dispose())
      disposables.geos.forEach((g) => g.dispose())
    },
  }
}

export async function loadOptionalMixamoModels(
  textures: InkTextureBundle,
  shared: SharedInkUniforms,
): Promise<Partial<Record<MixamoActSlot, LoadedMixamoCharacter>>> {
  try {
    const res = await fetch('/models/manifest.json')
    if (!res.ok) return {}
    const json = (await res.json()) as MixamoManifest
    if (!json?.models || typeof json.models !== 'object') return {}

    const entries = Object.entries(json.models) as [MixamoActSlot, MixamoSlotEntry | undefined][]
    const result: Partial<Record<MixamoActSlot, LoadedMixamoCharacter>> = {}

    await Promise.all(
      entries.map(async ([slot, cfg]) => {
        if (!cfg?.file) return
        try {
          const loaded = await loadSingleMixamoSlot(cfg, textures, shared)
          if (loaded) result[slot] = loaded
        } catch {
          // Ignore individual missing model file and keep procedural rigged character active
        }
      }),
    )

    return result
  } catch {
    return {}
  }
}
