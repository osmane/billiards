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
      this.table = m.scene;
      TableMesh.mesh = m.scene.children[0];

      // 1) Use the main table mesh (children[0]) for measuring playfield size.
      const playfield = TableMesh.mesh;
      playfield.updateMatrixWorld(true);

      // 2) Measure its bounding box in X (length) and Y (width) – Z is height!
      let bbox = new Box3().setFromObject(playfield);
      const size = new Vector3();
      bbox.getSize(size);

      // TableGeometry.tableX/Y are half-dimensions; multiply by 2 for full nose‑to‑nose size.
      const targetLength = TableGeometry.tableX * 2;
      const targetWidth = TableGeometry.tableY * 2;

      // 3) Compute a uniform scale factor using size.x and size.y.
      const scaleX = targetLength / (size.x || 1);
      const scaleY = targetWidth / (size.y || 1);
      const uniformScale = Math.min(scaleX, scaleY);

      // Apply the uniform scale to the whole table scene.
      this.table.scale.multiplyScalar(uniformScale);
      this.table.updateMatrixWorld(true);

      // 4) Recompute the bounding box after scaling and re-centre the model.
      bbox = new Box3().setFromObject(playfield);
      const center = new Vector3();
      bbox.getCenter(center);
      this.table.position.x -= center.x;
      this.table.position.y -= center.y; // y-axis is the table’s short dimension
      // leave z unchanged

      this.done();
    });

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
