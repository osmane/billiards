import { R } from "../model/physics/constants"
import { up } from "../utils/utils"
import {
  Matrix4,
  Mesh,
  CylinderGeometry,
  MeshPhongMaterial,
  Vector3,
  ShaderMaterial,
  CircleGeometry,
  MeshBasicMaterial,
  DoubleSide,
  SphereGeometry,
  TubeGeometry,
  CatmullRomCurve3,
  BufferGeometry,
} from "three"

export class CueMesh {
  static mesh: Mesh

  private static readonly material = new MeshPhongMaterial({
    color: 0x885577,
    wireframe: false,
    flatShading: false,
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

  private static readonly helpermaterial = new ShaderMaterial({
    uniforms: {
      lightDirection: { value: new Vector3(0, 0, 1) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;  
      void main() {
        vNormal = normal;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      uniform vec3 lightDirection;
      void main() {
        float intensity = dot(vNormal, lightDirection);
        vec3 color = vec3(1.0, 1.0, 1.0);
        vec3 finalColor = color * intensity;
        gl_FragColor = vec4(finalColor, 0.05 * (1.0-vUv.y));
      }
    `,
    wireframe: false,
    transparent: true,
  })

  static createHelper() {
    const geometry = new CylinderGeometry(R, R, (R * 30) / 0.5, 12, 1, true)
    const mesh = new Mesh(geometry, this.helpermaterial)
    mesh.geometry
      .applyMatrix4(new Matrix4().identity().makeRotationAxis(up, -Math.PI / 2))
      .applyMatrix4(
        new Matrix4()
          .identity()
          .makeTranslation((R * 15) / 0.5, 0, (-R * 0.01) / 0.5)
      )
    mesh.visible = false
    mesh.renderOrder = -1
    mesh.material.depthTest = false
    return mesh
  }

  static updateHelperGeometry(mesh: Mesh, trajectoryPoints: Vector3[] | null) {
    // If no trajectory points or too few, use straight helper
    if (!trajectoryPoints || trajectoryPoints.length < 2) {
      // Revert to straight cylinder if needed
      if (!(mesh.geometry instanceof CylinderGeometry)) {
        mesh.geometry.dispose()
        mesh.geometry = new CylinderGeometry(R, R, (R * 30) / 0.5, 12, 1, true)
        mesh.geometry
          .applyMatrix4(new Matrix4().identity().makeRotationAxis(up, -Math.PI / 2))
          .applyMatrix4(
            new Matrix4()
              .identity()
              .makeTranslation((R * 15) / 0.5, 0, (-R * 0.01) / 0.5)
          )
      }
      return
    }

    // Create curved tube geometry from trajectory points
    // Limit points to reasonable length for aiming guide (similar to straight helper)
    const maxHelperLength = (R * 30) / 0.5 // Same as straight helper length
    const filteredPoints: Vector3[] = []
    let accumulatedLength = 0

    // Start from first point (cue ball position at hit)
    filteredPoints.push(trajectoryPoints[0].clone())

    for (let i = 1; i < trajectoryPoints.length; i++) {
      const segmentLength = trajectoryPoints[i].distanceTo(trajectoryPoints[i - 1])

      if (accumulatedLength + segmentLength > maxHelperLength) {
        // Interpolate final point to reach exact max length
        const remainingLength = maxHelperLength - accumulatedLength
        const ratio = remainingLength / segmentLength
        const finalPoint = trajectoryPoints[i - 1].clone().lerp(trajectoryPoints[i], ratio)
        filteredPoints.push(finalPoint)
        break
      }

      filteredPoints.push(trajectoryPoints[i].clone())
      accumulatedLength += segmentLength
    }

    // Need at least 2 points for curve
    if (filteredPoints.length < 2) {
      return
    }

    // Create smooth curve through points
    const curve = new CatmullRomCurve3(filteredPoints, false, 'centripetal', 0.3)

    // Create tube geometry along curve
    const tubeRadius = R * 0.95 // Slightly smaller than ball radius for visibility
    const tubularSegments = Math.max(30, filteredPoints.length * 8)
    const radialSegments = 12
    const newGeometry = new TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, false)

    // Replace geometry
    mesh.geometry.dispose()
    mesh.geometry = newGeometry
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
    const geometry = new CylinderGeometry(tip, but, length, 11)
    const mesh = new Mesh(geometry, CueMesh.material)
    mesh.castShadow = false

    // Translate along NEGATIVE Y so one end is at origin and extends downward
    // This matches the virtual cue approach - cue extends from (0,0,0) to (0, -length, 0)
    geometry.translate(0, -length / 2, 0)

    return mesh
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

    const material = new ShaderMaterial({
      uniforms: {
        hitColor: { value: new Vector3(72/255, 72/255, 206/255) },
        spotSize: { value: 0.3 },
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
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          vec3 pos = normalize(vPosition);
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

    console.log('Virtual cue created:')
    console.log('  - Length (game units):', virtualCueLength)
    console.log('  - Radius (game units):', virtualCueRadius)
    console.log('  - R (ball radius):', R)
    console.log('  - Length/R ratio:', (virtualCueLength / R).toFixed(2))

    return mesh
  }
}
