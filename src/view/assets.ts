import { Mesh, Box3, Vector3 } from "three"
import { RuleFactory } from "../controller/rules/rulefactory"
import { importGltf } from "../utils/gltf"
import { Rules } from "../controller/rules/rules"
import { Sound } from "./sound"
import { TableMesh } from "./tablemesh"
import { CueMesh } from "./cuemesh"
import { TableGeometry } from "./tablegeometry"

export class Assets {
  ready
  rules: Rules
  background: Mesh
  table: Mesh
  cue: Mesh

  sound: Sound

  constructor(ruletype) {
    // Create rule instance and set up table geometry for current mode
    this.rules = RuleFactory.create(ruletype, null)
    this.rules.tableGeometry()
  }

  loadFromWeb(ready) {
    this.ready = ready
    this.sound = new Sound(true)
    // Load background model
    importGltf("models/background.gltf", (m) => {
      this.background = m.scene
      this.done()
    })
    // Load table model and scale it to match TableGeometry dimensions
    importGltf(this.rules.asset(), (m) => {
      // Raw Three.js scene (already scaled in importGltf by R/0.5)
      this.table = m.scene
      TableMesh.mesh = m.scene.children[0]

      // Compute bounding box of the loaded table mesh
      const bbox = new Box3().setFromObject(this.table)
      const size = new Vector3()
      bbox.getSize(size)

      // TableGeometry.tableX/Y are half-lengths, so multiply by 2 for full dimensions
      const targetLengthX = TableGeometry.tableX * 2
      const targetLengthZ = TableGeometry.tableY * 2

      // Calculate a uniform scaling factor based on width and length
      const scaleX = targetLengthX / (size.x || 1)
      const scaleZ = targetLengthZ / (size.z || 1)
      const uniformScale = Math.min(scaleX, scaleZ)

      // Apply the uniform scale to the entire table scene
      this.table.scale.multiplyScalar(uniformScale)
      this.table.updateMatrixWorld(true)

      // Optional: re-centre the model on the origin (0,0) in the XZ-plane
      const center = new Vector3()
      bbox.getCenter(center)
      this.table.position.x -= center.x * uniformScale
      this.table.position.z -= center.z * uniformScale

      // Notify that this asset has finished loading
      this.done()
    })
    // Load cue model (no additional scaling needed)
    importGltf("models/cue.gltf", (m) => {
      // m: GLTF object; m.scene holds the Three.js scene; m.scene.children[0] is the mesh
      this.cue = m
      CueMesh.mesh = m.scene.children[0]
      this.done()
    })
  }

  creatLocal() {
    this.sound = new Sound(false)
    // Generate a procedural table when running locally; uses TableGeometry values
    TableMesh.mesh = new TableMesh().generateTable(TableGeometry.hasPockets)
    this.table = TableMesh.mesh
  }

  static localAssets(ruletype = "") {
    const assets = new Assets(ruletype)
    assets.creatLocal()
    return assets
  }

  private done() {
    // Once all three assets (background, table, cue) are loaded, invoke the callback
    if (this.background && this.table && this.cue) {
      this.ready()
    }
  }
}
