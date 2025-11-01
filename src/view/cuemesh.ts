import { R } from "../model/physics/constants"
import {
  Group,
  Matrix4,
  Mesh,
  CylinderGeometry,
  MeshPhongMaterial,
  CanvasTexture,
  RepeatWrapping,
  LinearFilter,
  Color,
  Vector3,
  ShaderMaterial,
  DoubleSide,
  SphereGeometry,
} from "three"

export class CueMesh {
  static mesh: Mesh
  private static woodTexture: CanvasTexture | null = null
  private static readonly material = CueMesh.createCueMaterial()
  private static readonly ferruleMaterial = new MeshPhongMaterial({
    color: 0xf3f1ec,
    emissive: new Color(0x2a2a2a),
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    shininess: 60,
  })
  private static readonly tipMaterial = new MeshPhongMaterial({
    color: 0x6fa6d8,
    emissive: new Color(0x1a2b3f),
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    shininess: 80,
  })

  static readonly placermaterial = new MeshPhongMaterial({
    color: 0xccffcc,
    wireframe: false,
    flatShading: false,
    transparent: true,
    opacity: 0.5,
  })

  static indicateValid(valid) {
    CueMesh.placermaterial.color.setHex(valid ? 0xccffcc : 0xff0000)
  }

  static createPlacer() {
    const geometry = new CylinderGeometry((R * 0.01) / 0.5, R, R, 4)
    const mesh = new Mesh(geometry, CueMesh.placermaterial)
    mesh.geometry
      .applyMatrix4(
        new Matrix4()
          .identity()
          .makeRotationAxis(new Vector3(1, 0, 0), -Math.PI / 2)
      )
      .applyMatrix4(
        new Matrix4().identity().makeTranslation(0, 0, (R * 0.7) / 0.5)
      )
    mesh.visible = false
    return mesh
  }

  static createCue(tip, but, length) {
    const cueGroup = new Group()
    cueGroup.name = "cueShaft"

    const ferruleHeight = tip * 2.2
    const shaftLength = Math.max(length - ferruleHeight, tip * 8)

    const shaftGeometry = new CylinderGeometry(tip, but, shaftLength, 24)
    shaftGeometry.translate(0, -(shaftLength / 2 + ferruleHeight), 0)
    const shaftMesh = new Mesh(shaftGeometry, CueMesh.material)
    shaftMesh.castShadow = false
    cueGroup.add(shaftMesh)

    const ferruleRadiusTop = tip * 1.08
    const ferruleRadiusBottom = tip * 1.18
    const ferruleGeometry = new CylinderGeometry(
      ferruleRadiusTop,
      ferruleRadiusBottom,
      ferruleHeight,
      24
    )
    const ferruleMesh = new Mesh(ferruleGeometry, CueMesh.ferruleMaterial)
    ferruleMesh.position.y = -ferruleHeight / 2
    ferruleMesh.castShadow = false
    cueGroup.add(ferruleMesh)

    const tipRadius = ferruleRadiusTop * 0.98
    const tipGeometry = new SphereGeometry(
      tipRadius,
      24,
      16,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    )
    tipGeometry.translate(0, -tipRadius, 0)
    const tipMesh = new Mesh(tipGeometry, CueMesh.tipMaterial)
    tipMesh.castShadow = false
    tipMesh.renderOrder = 2
    cueGroup.add(tipMesh)

    return cueGroup
  }

  static createHitPoint() {
    const geometry = new SphereGeometry(
      R * 1.05,
      32,
      32,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.125
    )
    geometry.rotateX(Math.PI / 2)

    // Translate geometry so the cap's tip (north pole) is at (0,0,0)
    // This ensures the visual center of the mesh aligns with mesh.position
    // matching the black arrow tip position
    geometry.translate(0, 0, -R * 1.05)

    const material = new ShaderMaterial({
      uniforms: {
        hitColor: { value: new Vector3(72/255, 72/255, 206/255) },
        spotSize: { value: 0.3 },
        sphereCenter: { value: new Vector3(0, 0, -R * 1.05) },
      },
      vertexShader: `
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 hitColor;
        uniform float spotSize;
        uniform vec3 sphereCenter;
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          // Calculate position relative to sphere center (after geometry.translate)
          vec3 pos = normalize(vPosition - sphereCenter);
          vec3 northPole = vec3(0.0, 0.0, 1.0);
          float dotProduct = dot(pos, northPole);
          float angularDist = acos(clamp(dotProduct, -1.0, 1.0)) / 3.14159;
          float normalizedDist = angularDist / spotSize;
          float alpha = 1.0 - smoothstep(0.7, 1.0, normalizedDist);
          float glow = pow(1.0 - clamp(normalizedDist, 0.0, 1.0), 2.0) * 0.8;
          vec3 finalColor = hitColor + vec3(glow);
          if (alpha < 0.05) discard;
          gl_FragColor = vec4(finalColor, alpha * 0.9);
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: DoubleSide,
    })

    const mesh = new Mesh(geometry, material)
    mesh.renderOrder = 10
    mesh.visible = true
    return mesh
  }

  static createVirtualCue() {
    // Convert physical dimensions to game units
    // Carom ball diameter = 61.5mm, so R (radius) = 30.75mm
    // Virtual cue: 15mm diameter, 100mm length
    const radiusInMM = 30.75
    const virtualCueDiameterInMM = 15
    const virtualCueLengthInMM = 100

    // Scale to game units (R in game units represents 30.75mm)
    const virtualCueRadius = (virtualCueDiameterInMM / 2) / radiusInMM * R
    const virtualCueLength = virtualCueLengthInMM / radiusInMM * R

    // Create cylinder geometry along Y-axis (Three.js default)
    // We'll handle rotation via mesh rotation, not geometry pre-rotation
    const geometry = new CylinderGeometry(
      virtualCueRadius, // radiusTop
      virtualCueRadius, // radiusBottom
      virtualCueLength, // height (along Y-axis)
      16 // radialSegments
    )

    // Translate along NEGATIVE Y so one end is at origin and extends downward
    // Cylinder extends from (0,0,0) to (0, -virtualCueLength, 0)
    // This way when we rotate it, it points away from the ball surface
    geometry.translate(0, -virtualCueLength / 2, 0)

    // Bright green emissive material
    const material = new MeshPhongMaterial({
      color: 0x00ff00,
      emissive: 0x00ff00,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.85,
      shininess: 100
    })

    const mesh = new Mesh(geometry, material)
    mesh.renderOrder = 998 // Render just below hit point
    mesh.visible = true

    return mesh
  }

  private static createCueMaterial(): MeshPhongMaterial {
    // In Web Workers, 'document' is undefined. Avoid generating canvas-based textures there.
    const canUseCanvas = (typeof document !== 'undefined') || (typeof (globalThis as any).OffscreenCanvas !== 'undefined')
    const params: any = {
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      shininess: 30,
      emissive: new Color(0x4a2816),
      emissiveIntensity: 0.6,
    }
    if (canUseCanvas) {
      try { params.map = CueMesh.getWoodTexture() } catch { /* ignore in workers */ }
    }
    const material = new MeshPhongMaterial(params)
    material.needsUpdate = true
    return material
  }

  private static getWoodTexture(): CanvasTexture {
    if (!CueMesh.woodTexture) {
      // Create a canvas both in main thread and worker contexts
      let canvas: any
      if (typeof document !== 'undefined') {
        canvas = document.createElement("canvas")
        canvas.width = 512
        canvas.height = 32
      } else if (typeof (globalThis as any).OffscreenCanvas !== 'undefined') {
        canvas = new (globalThis as any).OffscreenCanvas(512, 32)
      } else {
        // Fallback: no canvas available (e.g., non-DOM worker without OffscreenCanvas)
        // Create a minimal 1x1 canvas if possible or throw to skip texture
        const tinyFactory = (globalThis as any).document?.createElement
        if (tinyFactory) {
          const tiny = tinyFactory.call((globalThis as any).document, "canvas")
          tiny.width = 1; tiny.height = 1
          CueMesh.woodTexture = new CanvasTexture(tiny as any)
          return CueMesh.woodTexture
        }
        throw new Error('No canvas available for cue texture')
      }
      const ctx = (canvas as any).getContext("2d") as any
      if (!ctx) {
        throw new Error("Unable to create canvas context for cue texture")
      }

      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0)
      gradient.addColorStop(0, "#8b5a2b")
      gradient.addColorStop(0.25, "#a4703a")
      gradient.addColorStop(0.5, "#c58b4b")
      gradient.addColorStop(0.75, "#a4703a")
      gradient.addColorStop(1, "#8b5a2b")
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const stripeCount = 40
      for (let i = 0; i < stripeCount; i++) {
        const stripeWidth = 4 + Math.random() * 16
        const stripeX = Math.random() * canvas.width
        const alpha = 0.04 + Math.random() * 0.05
        ctx.fillStyle = `rgba(60, 30, 15, ${alpha.toFixed(3)})`
        ctx.fillRect(stripeX, 0, stripeWidth, canvas.height)
      }

      CueMesh.woodTexture = new CanvasTexture(canvas as any)
      CueMesh.woodTexture.wrapS = RepeatWrapping
      CueMesh.woodTexture.wrapT = RepeatWrapping
      CueMesh.woodTexture.magFilter = LinearFilter
      CueMesh.woodTexture.minFilter = LinearFilter
      CueMesh.woodTexture.repeat.set(6, 1)
      CueMesh.woodTexture.needsUpdate = true
    }
    return CueMesh.woodTexture
  }
}
