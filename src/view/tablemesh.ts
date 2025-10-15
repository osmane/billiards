import {
  Vector3,
  Matrix4,
  Mesh,
  CylinderGeometry,
  BoxGeometry,
  MeshPhongMaterial,
  Group,
  Color,
} from "three"
import { TableGeometry } from "./tablegeometry"
import { PocketGeometry } from "./pocketgeometry"
import { R } from "../model/physics/constants"

export class TableMesh {
  logger = (_) => {}

  static mesh
  static caromSurfaces: { cloth: Mesh; cushions: Mesh[] } | null = null

  private readonly cloth = new MeshPhongMaterial({
    color: 0x4455b9,
    wireframe: false,
    flatShading: true,
    transparent: false,
  })

  private readonly cushion = new MeshPhongMaterial({
    color: 0x5465b9,
    wireframe: false,
    flatShading: true,
    transparent: false,
  })

  private readonly pocket = new MeshPhongMaterial({
    color: 0x445599,
    wireframe: false,
    flatShading: true,
    transparent: true,
    opacity: 0.3,
  })

  private readonly frameMaterial = new MeshPhongMaterial({
    color: 0x8b5a2b,
    emissive: new Color(0x2f1608),
    emissiveIntensity: 0.2,
    shininess: 35,
  })

  generateTable(hasPockets: boolean) {
    const group = new Group()
    this.addCushions(group, hasPockets)

    if (hasPockets) {
      PocketGeometry.knuckles.forEach((k) => this.knuckleCylinder(k, group))
      PocketGeometry.pocketCenters.forEach((p) =>
        this.knuckleCylinder(p, group, this.pocket)
      )

      const p = PocketGeometry.pockets.pocketNW.pocket
      const k = PocketGeometry.pockets.pocketNW.knuckleNE
      this.logger(
        "knuckle-pocket gap = " +
          (p.pos.distanceTo(k.pos) - p.radius - k.radius)
      )
    }

    this.addWoodenFrame(group)
    return group
  }

  private knuckleCylinder(knuckle, scene, material = this.cloth) {
    const mesh = this.cylinder(
      knuckle.pos,
      knuckle.radius,
      (R * 0.75) / 0.5,
      scene,
      material
    )
    mesh.position.setZ((-R * 0.25) / 0.5 / 2)
  }

  private cylinder(pos, radius, depth, scene, material) {
    const geometry = new CylinderGeometry(radius, radius, depth, 16)
    const mesh = new Mesh(geometry, material)
    mesh.position.copy(pos)
    mesh.geometry.applyMatrix4(
      new Matrix4().identity().makeRotationAxis(new Vector3(1, 0, 0), Math.PI / 2)
    )
    scene.add(mesh)
    return mesh
  }

  addCushions(scene, hasPockets) {
    TableMesh.caromSurfaces = null

    const visualHalfLength = TableGeometry.X
    const visualHalfWidth = TableGeometry.Y

    const slateThickness = R * 1.5
    const clothMesh = this.plane(
      new Vector3(0, 0, -R - slateThickness / 2),
      2 * visualHalfLength,
      2 * visualHalfWidth,
      slateThickness,
      scene,
      this.cloth
    )

    if (hasPockets) {
      return
    }

    const cushionMeshes: Mesh[] = []

    const cushionHeight = R * 1.25
    const cushionThickness = R * 2.0
    const verticalPosition = -R + cushionHeight / 2

    const fullCushionLength = 2 * visualHalfLength + 2 * cushionThickness
    const fullCushionWidth = 2 * visualHalfWidth

    cushionMeshes.push(
      this.plane(
        new Vector3(0, visualHalfWidth + cushionThickness / 2, verticalPosition),
        fullCushionLength,
        cushionThickness,
        cushionHeight,
        scene
      )
    )
    cushionMeshes.push(
      this.plane(
        new Vector3(0, -visualHalfWidth - cushionThickness / 2, verticalPosition),
        fullCushionLength,
        cushionThickness,
        cushionHeight,
        scene
      )
    )

    cushionMeshes.push(
      this.plane(
        new Vector3(visualHalfLength + cushionThickness / 2, 0, verticalPosition),
        cushionThickness,
        fullCushionWidth,
        cushionHeight,
        scene
      )
    )
    cushionMeshes.push(
      this.plane(
        new Vector3(-visualHalfLength - cushionThickness / 2, 0, verticalPosition),
        cushionThickness,
        fullCushionWidth,
        cushionHeight,
        scene
      )
    )

    TableMesh.caromSurfaces = {
      cloth: clothMesh,
      cushions: cushionMeshes,
    }
  }

  private plane(pos, x, y, z, scene, material = this.cushion) {
    const geometry = new BoxGeometry(x, y, z)
    const mesh = new Mesh(geometry, material)
    mesh.receiveShadow = true
    mesh.position.copy(pos)
    scene.add(mesh)
    return mesh
  }

  private addWoodenFrame(scene: Group) {
    const visualHalfLength = TableGeometry.X
    const visualHalfWidth = TableGeometry.Y

    const cushionHeight = R * 1.25
    const cushionThickness = R * 2.0
    const cushionVerticalCenter = -R + cushionHeight / 2

    const frameWidth = R * 2.4
    const frameGap = R * 0.15
    const frameHeight = cushionHeight
    const frameElevation = cushionVerticalCenter

    const innerOffsetY = visualHalfWidth + cushionThickness + frameGap
    const innerOffsetX = visualHalfLength + cushionThickness + frameGap

    const frameOuterX = innerOffsetX + frameWidth
    const frameOuterY = innerOffsetY + frameWidth
    const outerLength = frameOuterX * 2
    const outerWidth = frameOuterY * 2

    this.plane(
      new Vector3(0, innerOffsetY + frameWidth / 2, frameElevation),
      outerLength,
      frameWidth,
      frameHeight,
      scene,
      this.frameMaterial
    )
    this.plane(
      new Vector3(0, -innerOffsetY - frameWidth / 2, frameElevation),
      outerLength,
      frameWidth,
      frameHeight,
      scene,
      this.frameMaterial
    )

    this.plane(
      new Vector3(innerOffsetX + frameWidth / 2, 0, frameElevation),
      frameWidth,
      outerWidth,
      frameHeight,
      scene,
      this.frameMaterial
    )
    this.plane(
      new Vector3(-innerOffsetX - frameWidth / 2, 0, frameElevation),
      frameWidth,
      outerWidth,
      frameHeight,
      scene,
      this.frameMaterial
    )

  }
}
