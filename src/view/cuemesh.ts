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
    const tilt = 0.17
    mesh.geometry
      .applyMatrix4(
        new Matrix4()
          .identity()
          .makeRotationAxis(new Vector3(1.0, 0.0, 0.0), -tilt)
      )
      .applyMatrix4(new Matrix4().identity().makeRotationAxis(up, -Math.PI / 2))
      .applyMatrix4(
        new Matrix4()
          .identity()
          .makeTranslation(
            -length / 2 - R,
            0,
            (length / 2) * Math.sin(tilt) + R * 0.25
          )
      )
    return mesh
  }

  static createHitPoint() {
    // Create a spherical cap that conforms to ball surface
    const geometry = new SphereGeometry(
      R * 1.03, // Slightly larger than ball radius to render outside
      32, // width segments
      32, // height segments
      0, // phiStart - full circle horizontally
      Math.PI * 2, // phiLength - full circle
      0, // thetaStart - start from Y+ pole
      Math.PI * 0.125 // thetaLength - smaller cap (half the original size)
    )

    // Rotate geometry 90 degrees around X so Y+ pole becomes Z+ pole
    // This aligns with our coordinate system where Z is up
    geometry.rotateX(Math.PI / 2)

    // Shader material to create a circular spot at the north pole
    const material = new ShaderMaterial({
      uniforms: {
        hitColor: { value: new Vector3(72/255, 72/255, 206/255) },
        spotSize: { value: 0.5 },
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
          // Calculate angular distance from north pole
          // vPosition is already in object space, normalized
          vec3 pos = normalize(vPosition);
          vec3 northPole = vec3(0.0, 0.0, 1.0);

          // Use dot product to get angular distance (1 = same direction, -1 = opposite)
          float dotProduct = dot(pos, northPole);

          // Convert to angular distance (0 at pole, increases away from pole)
          float angularDist = acos(clamp(dotProduct, -1.0, 1.0)) / 3.14159; // 0-1 range

          // Normalize by spot size
          float normalizedDist = angularDist / spotSize;

          // Create soft circular gradient
          float alpha = 1.0 - smoothstep(0.5, 1.0, normalizedDist);

          // Add center glow
          float glow = pow(1.0 - clamp(normalizedDist, 0.0, 1.0), 3.0) * 0.5;

          vec3 finalColor = hitColor + vec3(glow);

          // Discard pixels outside the spot
          if (alpha < 0.05) discard;

          gl_FragColor = vec4(finalColor, alpha * 0.8);
        }
      `,
      transparent: true,
      depthTest: false, // Always visible
      depthWrite: false,
      side: DoubleSide,
    })

    const mesh = new Mesh(geometry, material)
    mesh.renderOrder = 999 // Render on top of everything
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
