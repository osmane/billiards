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
    // Use a small portion of a sphere geometry - OUTSIDE the ball
    // NOTE: Three.js SphereGeometry has Y-axis as the pole by default
    const geometry = new SphereGeometry(
      R * 1.03, // Larger than ball radius to render OUTSIDE
      32, // width segments
      32, // height segments
      0, // phiStart - full circle horizontally
      Math.PI * 2, // phiLength - full circle
      0, // thetaStart - start from Y+ pole (Three.js default)
      Math.PI * 0.25 // thetaLength - smaller cap (25% of sphere)
    )

    // Rotate geometry 90 degrees around X so Y+ pole becomes Z+ pole
    // This aligns with our coordinate system where Z is up
    geometry.rotateX(Math.PI / 2)

    // Shader material to create a circular spot at the north pole
    const material = new ShaderMaterial({
      uniforms: {
        hitColor: { value: new Vector3(72/255, 72/255, 206/255) }, // Blue color
        spotSize: { value: 0.6 }, // Larger spot size to fill more of the cap
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
}
