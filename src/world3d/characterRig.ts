import * as THREE from 'three'
import {
  createInkMaterial,
  createInkOutlineMaterial,
  type InkToneRole,
  type SharedInkUniforms,
} from './inkShader'
import type { InkTextureBundle } from './inkTextures'

export type CharacterBuild = 'skinny' | 'athletic' | 'bully'
export type CharacterPose =
  | 'mocked'
  | 'bullyPoint'
  | 'deadliftStrain'
  | 'phoneGaze'
  | 'overheadPress'
  | 'stairClimb'

export interface StylizedCharacter {
  group: THREE.Group
  setPose: (pose: CharacterPose, t: number, elapsed: number, seed?: number) => void
  /** Local barbell Y position matching hands during deadliftStrain or overheadPress */
  getBarAnchor: (pose: CharacterPose, t: number) => THREE.Vector3
  dispose: () => void
}

function makeTaperedSegment(
  len: number,
  rTop: number,
  rMid: number,
  rBot: number,
  radialSegments = 14,
): THREE.LatheGeometry {
  // Smooth hemispherical joint caps extend slightly past y=0 and y=-len so limbs never pinch at bends
  const topCap = rTop * 0.42
  const botCap = rBot * 0.36
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.001, topCap),
    new THREE.Vector2(rTop * 0.72, topCap * 0.62),
    new THREE.Vector2(rTop, 0),
    new THREE.Vector2(rTop * 1.03, -len * 0.16),
    new THREE.Vector2(rMid, -len * 0.48),
    new THREE.Vector2(rBot, -len * 0.88),
    new THREE.Vector2(rBot * 0.88, -len),
    new THREE.Vector2(rBot * 0.58, -len - botCap * 0.65),
    new THREE.Vector2(0.001, -len - botCap),
  ]
  const geo = new THREE.LatheGeometry(pts, radialSegments)
  geo.computeVertexNormals()
  return geo
}

function makeTorsoProfile(
  height: number,
  wBottom: number,
  wWaist: number,
  wChest: number,
  wShoulder: number,
): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(wBottom, height * 0.06),
    new THREE.Vector2(wWaist, height * 0.36),
    new THREE.Vector2(wChest, height * 0.74),
    new THREE.Vector2(wShoulder, height * 0.92),
    new THREE.Vector2(wShoulder * 0.45, height * 0.99),
    new THREE.Vector2(0.001, height),
  ]
  const geo = new THREE.LatheGeometry(pts, 16)
  // Compress Z front-to-back relative to shoulder width X for human torso proportions
  geo.scale(1.16, 1.0, 0.72)
  geo.computeVertexNormals()
  return geo
}

function makeSculptedHeadGeo(scale = 1): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.115 * scale, 18, 16)
  // Sculpt subtle jaw taper below equator & cranial depth
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i)
    let y = pos.getY(i)
    let z = pos.getZ(i)
    if (y < 0) {
      const chinT = Math.min(1, -y / (0.115 * scale))
      x *= 1 - chinT * 0.36
      z *= 1 - chinT * 0.18
      y *= 1.15
    } else {
      z *= 1.08
    }
    pos.setXYZ(i, x, y, z)
  }
  geo.computeVertexNormals()
  return geo
}

export function createStylizedCharacter({
  build,
  textures,
  shared,
  popOut = true,
  outlineThickness = 0.017,
}: {
  build: CharacterBuild
  textures: InkTextureBundle
  shared: SharedInkUniforms
  popOut?: boolean
  outlineThickness?: number
}): StylizedCharacter {
  const group = new THREE.Group()
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []

  const isBully = build === 'bully'
  const isAthletic = build === 'athletic'

  const clothRole: InkToneRole = isBully ? 'charcoal' : isAthletic ? 'charcoal' : 'parchment'
  const skinRole: InkToneRole = isBully ? 'charcoal' : 'skin'
  const hairRole: InkToneRole = 'charcoal'

  const makePair = (role: InkToneRole, scale = 1.65, forcePop = popOut) => {
    const main = createInkMaterial({
      role,
      textures,
      shared,
      popOut: forcePop,
      hatchScale: scale,
    })
    const hull = createInkOutlineMaterial({
      shared,
      popOut: forcePop,
      thickness: outlineThickness,
    })
    materials.push(main, hull)
    return { main, hull }
  }

  const skinMats = makePair(skinRole, 1.8)
  const shirtMats = makePair(clothRole, 1.55)
  const pantsMats = makePair('charcoal', 1.9)
  const hairMats = makePair(hairRole, 2.2)

  const addInkedMesh = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mats: { main: THREE.Material; hull: THREE.Material },
  ): THREE.Mesh => {
    geometries.push(geo)
    const mesh = new THREE.Mesh(geo, mats.main)
    const hull = new THREE.Mesh(geo, mats.hull)
    mesh.renderOrder = popOut ? 5 : 2
    hull.renderOrder = popOut ? 5 : 2
    parent.add(mesh, hull)
    return mesh
  }

  // Anatomy proportions tuned cleanly per build
  const shoulderHalf = isAthletic ? 0.255 : isBully ? 0.21 : 0.165
  const torsoW = isAthletic ? 0.21 : isBully ? 0.175 : 0.135
  const waistW = isAthletic ? 0.145 : isBully ? 0.155 : 0.11
  const armR = isAthletic ? 0.068 : isBully ? 0.05 : 0.036
  const forearmR = isAthletic ? 0.052 : isBully ? 0.04 : 0.03
  const thighR = isAthletic ? 0.088 : isBully ? 0.072 : 0.054
  const calfR = isAthletic ? 0.058 : isBully ? 0.05 : 0.038

  // Root Pelvis sits at standing height y = 0.88 above soles at y = 0
  const pelvis = new THREE.Group()
  pelvis.position.set(0, 0.88, 0)
  group.add(pelvis)

  const pelvisGeo = makeTorsoProfile(0.22, torsoW * 0.68, torsoW * 0.76, torsoW * 0.8, torsoW * 0.74)
  pelvisGeo.translate(0, -0.08, 0)
  addInkedMesh(pelvis, pelvisGeo, pantsMats)

  // Lower/Upper Spine & Ribcage + Collarband
  const spine = new THREE.Group()
  spine.position.set(0, 0.07, 0)
  pelvis.add(spine)

  const torsoGeo = makeTorsoProfile(0.51, waistW * 1.02, waistW, torsoW * 1.08, torsoW * 1.18)
  addInkedMesh(spine, torsoGeo, shirtMats)

  const chest = new THREE.Group()
  chest.position.set(0, 0.45, 0)
  spine.add(chest)

  const collarGeo = new THREE.TorusGeometry(isAthletic ? 0.068 : 0.056, 0.015, 8, 16)
  collarGeo.rotateX(Math.PI / 2)
  collarGeo.translate(0, 0.055, 0.01)
  addInkedMesh(chest, collarGeo, shirtMats)

  // Shoulders broaden visually with athletic deltoid caps
  const neck = new THREE.Group()
  neck.position.set(0, 0.06, 0.01)
  chest.add(neck)

  const neckGeo = makeTaperedSegment(0.11, isAthletic ? 0.056 : 0.04, 0.05, isAthletic ? 0.062 : 0.044, 10)
  neckGeo.translate(0, 0.1, 0)
  addInkedMesh(neck, neckGeo, skinMats)

  const head = new THREE.Group()
  head.position.set(0, 0.16, 0.02)
  neck.add(head)

  const headGeo = makeSculptedHeadGeo(isBully ? 1.03 : 1.0)
  addInkedMesh(head, headGeo, skinMats)

  // Sculpted manga nose ridge & recessed shadow brow bar conforming to cranial curvature
  const noseGeo = new THREE.ConeGeometry(0.013, 0.036, 4)
  noseGeo.rotateX(Math.PI * 0.42)
  noseGeo.translate(0, -0.012, 0.114)
  addInkedMesh(head, noseGeo, skinMats)

  const browGeo = new THREE.BoxGeometry(0.068, 0.01, 0.016)
  browGeo.translate(0, 0.022, 0.104)
  addInkedMesh(head, browGeo, hairMats)

  // Sculpted stylized manga hair crown tilted slightly back off forehead + swept tufts
  const hairCrownGeo = new THREE.SphereGeometry(0.121, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.56)
  hairCrownGeo.rotateX(-0.22)
  hairCrownGeo.translate(0, 0.02, -0.014)
  addInkedMesh(head, hairCrownGeo, hairMats)

  const tuftDefs: [number, number, number, number, number, number][] = [
    [-0.06, 0.09, 0.055, 0.45, 0.4, 0.35],
    [0.05, 0.1, 0.045, -0.25, -0.35, -0.3],
    [0.0, 0.115, -0.03, -0.65, 0.15, 0.0],
    [-0.085, 0.055, 0.065, 0.72, 0.55, 0.4],
    [0.08, 0.065, 0.065, 0.68, -0.5, -0.38],
  ]
  tuftDefs.forEach(([x, y, z, rx, ry, rz]) => {
    const spikeGeo = new THREE.ConeGeometry(0.036, 0.095, 5)
    spikeGeo.rotateX(rx)
    spikeGeo.rotateY(ry)
    spikeGeo.rotateZ(rz)
    spikeGeo.translate(x, y, z)
    addInkedMesh(head, spikeGeo, hairMats)
  })

  // Athletic tank straps / skinny draped sleeves
  const sleeveLen = isAthletic ? 0.12 : 0.24
  const sleeveGeo = makeTaperedSegment(sleeveLen, armR * 1.32, armR * 1.24, armR * 1.12, 12)
  const upperArmGeo = makeTaperedSegment(0.28, armR, armR * 0.96, armR * 0.84, 12)
  const foreArmGeo = makeTaperedSegment(0.26, forearmR, forearmR * 0.92, forearmR * 0.72, 12)
  const handGeo = new THREE.SphereGeometry(forearmR * 0.96, 12, 10)
  handGeo.scale(0.9, 1.25, 0.72)
  handGeo.computeVertexNormals()
  handGeo.translate(0, -0.032, 0)

  const buildArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * shoulderHalf, 0.0, 0)
    chest.add(shoulder)

    if (!isAthletic) {
      addInkedMesh(shoulder, sleeveGeo.clone(), shirtMats)
    } else {
      const deltCap = new THREE.SphereGeometry(armR * 1.32, 12, 10)
      addInkedMesh(shoulder, deltCap, skinMats)
    }
    addInkedMesh(shoulder, upperArmGeo.clone(), skinMats)

    const elbow = new THREE.Group()
    elbow.position.set(0, -0.28, 0)
    shoulder.add(elbow)
    addInkedMesh(elbow, foreArmGeo.clone(), skinMats)

    const hand = new THREE.Group()
    hand.position.set(0, -0.26, 0)
    elbow.add(hand)
    addInkedMesh(hand, handGeo.clone(), skinMats)

    // Extended pointing index finger continuing strictly along -Y so forward-raised arm points horizontally!
    if (isBully && side === 1) {
      const pointFinger = new THREE.CylinderGeometry(0.008, 0.015, 0.145, 8)
      pointFinger.translate(0, -0.09, 0.012)
      addInkedMesh(hand, pointFinger, skinMats)
    }

    return { shoulder, elbow, hand }
  }

  const armL = buildArm(-1)
  const armR_rig = buildArm(1)
  geometries.push(sleeveGeo, upperArmGeo, foreArmGeo, handGeo)

  // Sculpted tapered sneaker geometry & rounded muscular legs
  const thighGeo = makeTaperedSegment(0.42, thighR, thighR * 0.94, thighR * 0.82, 12)
  const calfGeo = makeTaperedSegment(0.41, calfR * 1.02, calfR * 1.12, calfR * 0.72, 12)
  const shoeGeo = makeTaperedSegment(0.18, 0.046, 0.042, 0.032, 10)
  shoeGeo.rotateX(-Math.PI / 2)
  shoeGeo.scale(1.0, 0.72, 1.0)
  shoeGeo.translate(0, -0.025, 0.005)

  const buildLeg = (side: -1 | 1) => {
    const hip = new THREE.Group()
    hip.position.set(side * (torsoW * 0.52), 0.0, 0)
    pelvis.add(hip)
    addInkedMesh(hip, thighGeo.clone(), pantsMats)

    const knee = new THREE.Group()
    knee.position.set(0, -0.42, 0)
    hip.add(knee)
    addInkedMesh(knee, calfGeo.clone(), pantsMats)

    const foot = new THREE.Group()
    foot.position.set(0, -0.41, 0)
    knee.add(foot)
    addInkedMesh(foot, shoeGeo.clone(), pantsMats)

    return { hip, knee, foot }
  }

  const legL = buildLeg(-1)
  const legR = buildLeg(1)
  geometries.push(thighGeo, calfGeo, shoeGeo)

  const resetTransforms = () => {
    pelvis.position.set(0, 0.88, 0)
    pelvis.rotation.set(0, 0, 0)
    spine.rotation.set(0, 0, 0)
    chest.rotation.set(0, 0, 0)
    neck.rotation.set(0, 0, 0)
    head.rotation.set(0, 0, 0)

    armL.shoulder.rotation.set(0, 0, 0.08)
    armL.elbow.rotation.set(-0.18, 0, 0)
    armR_rig.shoulder.rotation.set(0, 0, -0.08)
    armR_rig.elbow.rotation.set(-0.18, 0, 0)

    legL.hip.rotation.set(0, 0, 0)
    legL.knee.rotation.set(0, 0, 0)
    legL.foot.rotation.set(0, 0, 0)
    legR.hip.rotation.set(0, 0, 0)
    legR.knee.rotation.set(0, 0, 0)
    legR.foot.rotation.set(0, 0, 0)
  }

  return {
    group,
    setPose: (pose, t, elapsed, seed = 0) => {
      resetTransforms()
      const stepped = Math.floor(elapsed * 8.0) / 8.0
      const breath = Math.sin(stepped * 2.2 + seed) * 0.025
      const clampedT = Math.max(0, Math.min(1, t))

      if (pose === 'mocked') {
        spine.rotation.x = 0.2 + clampedT * 0.14 + breath * 0.5
        chest.rotation.x = 0.1 + breath * 0.4
        head.rotation.x = 0.26 + clampedT * 0.12
        head.rotation.z = Math.sin(stepped * 1.4) * 0.03
        armL.shoulder.rotation.set(0.14, 0, -0.06)
        armL.elbow.rotation.x = -0.25
        armR_rig.shoulder.rotation.set(0.14, 0, 0.06)
        armR_rig.elbow.rotation.x = -0.25
        legL.hip.rotation.z = -0.03
        legR.hip.rotation.z = 0.03
      } else if (pose === 'bullyPoint') {
        const lean = 0.16 + clampedT * 0.12
        spine.rotation.x = lean
        spine.rotation.y = Math.sin(stepped * 1.8 + seed) * 0.06
        head.rotation.x = -0.1 + Math.sin(stepped * 5.0 + seed) * 0.05
        armR_rig.shoulder.rotation.set(-1.44 + Math.sin(stepped * 3.0 + seed) * 0.07, -0.04, 0.06)
        armR_rig.elbow.rotation.x = -0.06
        armL.shoulder.rotation.set(0.22, 0, 0.32)
        armL.elbow.rotation.x = -1.1
        legL.hip.rotation.x = -0.1
        legR.hip.rotation.x = 0.12
      } else if (pose === 'deadliftStrain') {
        const pull = Math.sin(clampedT * Math.PI) * 0.24
        const tremble = Math.sin(stepped * 22.0) * (0.015 + pull * 0.06)
        pelvis.position.y = 0.58 + pull * 0.2
        spine.rotation.x = 0.94 - pull * 0.2 + tremble
        head.rotation.x = -0.35 + breath
        // Keep arms hanging straight down onto the barbell bar at z ~ 0.34, y ~ 0.30
        armL.shoulder.rotation.set(-1.02 + pull * 0.12, 0, -0.14)
        armL.elbow.rotation.x = -0.05
        armR_rig.shoulder.rotation.set(-1.02 + pull * 0.12, 0, 0.14)
        armR_rig.elbow.rotation.x = -0.05
        legL.hip.rotation.set(-0.96 + pull * 0.22, 0, -0.08)
        legL.knee.rotation.x = 1.08 - pull * 0.26
        legR.hip.rotation.set(-0.96 + pull * 0.22, 0, 0.08)
        legR.knee.rotation.x = 1.08 - pull * 0.26
      } else if (pose === 'phoneGaze') {
        pelvis.position.y = 0.52
        spine.rotation.x = 0.26 - clampedT * 0.14 + breath * 0.4
        head.rotation.x = 0.48 - clampedT * 0.26
        armL.shoulder.rotation.set(-0.78, 0.28, -0.15)
        armL.elbow.rotation.x = -1.35
        armR_rig.shoulder.rotation.set(-0.78, -0.28, 0.15)
        armR_rig.elbow.rotation.x = -1.35
        legL.hip.rotation.set(-1.35, 0, -0.12)
        legL.knee.rotation.x = 1.38
        legR.hip.rotation.set(-1.35, 0, 0.12)
        legR.knee.rotation.x = 1.38
      } else if (pose === 'overheadPress') {
        const drive = Math.min(1, clampedT * 1.15)
        const dip = Math.sin(Math.min(1, clampedT * 4) * Math.PI) * 0.06
        pelvis.position.y = 0.86 - dip
        spine.rotation.x = -0.08 * drive + breath * 0.3
        head.rotation.x = -0.06 - drive * 0.08
        // Transition smoothly from front-rack at collarbone to overhead lockout
        const shoulderAngle = -1.15 - drive * 1.78
        const elbowAngle = -1.85 + drive * 1.65
        armL.shoulder.rotation.set(shoulderAngle, 0, -0.26 + drive * 0.14)
        armL.elbow.rotation.x = elbowAngle
        armR_rig.shoulder.rotation.set(shoulderAngle, 0, 0.26 - drive * 0.14)
        armR_rig.elbow.rotation.x = elbowAngle
        legL.hip.rotation.set(-0.12 + dip * 2, 0, -0.14)
        legL.knee.rotation.x = 0.16 + dip * 3
        legR.hip.rotation.set(-0.12 + dip * 2, 0, 0.14)
        legR.knee.rotation.x = 0.16 + dip * 3
      } else {
        // stairClimb: confident rhythmic 4.5-cycle alternating stair stride
        const phase = clampedT * Math.PI * 5.0
        const s = Math.sin(phase)
        pelvis.position.y = 0.86 + Math.abs(Math.cos(phase)) * 0.055
        pelvis.rotation.y = s * 0.06
        spine.rotation.x = -0.06 + breath * 0.4
        head.rotation.x = -0.08
        legL.hip.rotation.x = -0.35 + s * 0.48
        legL.knee.rotation.x = Math.max(0.08, -s * 0.72 + 0.35)
        legR.hip.rotation.x = -0.35 - s * 0.48
        legR.knee.rotation.x = Math.max(0.08, s * 0.72 + 0.35)
        armL.shoulder.rotation.x = -s * 0.38
        armL.elbow.rotation.x = -0.32 - Math.max(0, s) * 0.35
        armR_rig.shoulder.rotation.x = s * 0.38
        armR_rig.elbow.rotation.x = -0.32 - Math.max(0, -s) * 0.35
      }
    },
    getBarAnchor: (pose, t) => {
      const clampedT = Math.max(0, Math.min(1, t))
      if (pose === 'deadliftStrain') {
        const pull = Math.sin(clampedT * Math.PI) * 0.24
        return new THREE.Vector3(0, 0.29 + pull * 0.22, 0.34)
      }
      if (pose === 'overheadPress') {
        const drive = Math.min(1, clampedT * 1.15)
        return new THREE.Vector3(0, 1.38 + drive * 0.62, 0.22 - drive * 0.2)
      }
      return new THREE.Vector3(0, 1.0, 0.2)
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
    },
  }
}
