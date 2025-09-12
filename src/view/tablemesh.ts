import {
  Vector3,
  Matrix4,
  Mesh,
  CylinderGeometry,
  BoxGeometry,
  MeshPhongMaterial,
  PointLight,
  Group,
} from "three"
import { TableGeometry } from "./tablegeometry"
import { PocketGeometry } from "./pocketgeometry"
import { R } from "../model/physics/constants"

export class TableMesh {
  logger = (_) => { }

  static mesh

  generateTable(hasPockets: boolean) {
    const group = new Group()
    const light = new PointLight(0xf0f0e8, 22.0)
    light.position.set(0, 0, R * 50)
    group.add(light)
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
    return group
  }

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

  private knuckleCylinder(knuckle, scene, material = this.cloth) {
    const k = this.cylinder(
      knuckle.pos,
      knuckle.radius,
      (R * 0.75) / 0.5,
      scene,
      material
    )
    k.position.setZ((-R * 0.25) / 0.5 / 2)
  }

  private cylinder(pos, radius, depth, scene, material) {
    const geometry = new CylinderGeometry(radius, radius, depth, 16)
    const mesh = new Mesh(geometry, material)
    mesh.position.copy(pos)
    mesh.geometry.applyMatrix4(
      new Matrix4()
        .identity()
        .makeRotationAxis(new Vector3(1, 0, 0), Math.PI / 2)
    )
    scene.add(mesh)
    return mesh
  }

  addCushions(scene, hasPockets) {
    const visualHalfLength = TableGeometry.X; // Görsel yarı uzunluk
    const visualHalfWidth = TableGeometry.Y;  // Görsel yarı genişlik

    // Masa yatağını (slate) çiz
    const slateThickness = R * 1.5;
    this.plane(
      new Vector3(0, 0, -R - slateThickness / 2),
      2 * visualHalfLength, // Tam genişlik
      2 * visualHalfWidth,  // Tam uzunluk
      slateThickness,
      scene,
      this.cloth // Yeşil çuha materyali
    );

    if (hasPockets) {
      // Cepli masalar için mevcut kod
      // ...
    } else {
      // --- DEĞİŞİKLİK BURADA ---
      // 3-Bant (Karambol) masası için cepsiz, düz bantlar çiz
      const cushionHeight = R * 1.25;
      const cushionThickness = R * 2.0;
      const verticalPosition = -R + (cushionHeight / 2);

      // Uzun bantların (oyun yüzeyinin dışındaki) tam uzunluğunu hesapla
      const fullCushionLength = 2 * visualHalfLength + 2 * cushionThickness;
      // Kısa bantların (oyun yüzeyinin dışındaki) tam uzunluğunu hesapla
      const fullCushionWidth = 2 * visualHalfWidth;

      // Uzun bantlar (Doğu/Batı)
      this.plane(new Vector3(0, visualHalfWidth + cushionThickness / 2, verticalPosition),
        fullCushionLength, cushionThickness, cushionHeight, scene);
      this.plane(new Vector3(0, -visualHalfWidth - cushionThickness / 2, verticalPosition),
        fullCushionLength, cushionThickness, cushionHeight, scene);

      // Kısa bantlar (Kuzey/Güney)
      this.plane(new Vector3(visualHalfLength + cushionThickness / 2, 0, verticalPosition),
        cushionThickness, fullCushionWidth, cushionHeight, scene);
      this.plane(new Vector3(-visualHalfLength - cushionThickness / 2, 0, verticalPosition),
        cushionThickness, fullCushionWidth, cushionHeight, scene);
    }
  }

  private plane(pos, x, y, z, scene, material = this.cushion) {
    const geometry = new BoxGeometry(x, y, z);
    const mesh = new Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.position.copy(pos);
    scene.add(mesh);
  }
}
