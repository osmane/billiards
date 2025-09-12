// src/view/assets.ts
import { Object3D, Mesh, Box3, Vector3 } from "three"
import { RuleFactory } from "../controller/rules/rulefactory"
import { importGltf } from "../utils/gltf"
import { Rules } from "../controller/rules/rules"
import { Sound } from "./sound"
import { TableMesh } from "./tablemesh"
import { CueMesh } from "./cuemesh"
import { TableGeometry } from "./tablegeometry"

export class Assets {
  ready: () => void
  rules: Rules

  // Not: GLTF.scene genelde Group/Object3D; Mesh yerine Object3D daha güvenli
  background: Object3D | Mesh
  table: Object3D | Mesh
  cue: Object3D | Mesh
  sound: Sound

  constructor(ruletype: string) {
    // Oyun kuralını oluştur ve TableGeometry’yi o moda göre ayarla
    this.rules = RuleFactory.create(ruletype, null)
    this.rules.tableGeometry()
  }

  loadFromWeb(ready: () => void) {
    this.ready = ready
    this.sound = new Sound(true)

    // 1) Arka plan modeli
    importGltf("models/background.gltf", (m) => {
      this.background = m.scene
      this.done()
    })

    // 2) Masa modeli (oyun yüzeyine göre ölçekle & merkezle)
    importGltf(this.rules.asset(), (m) => {
      this.table = m.scene

      // --- Playfield (kumaş) alt-mesh’ini seç ---
      // Öncelik: TableMesh.mesh -> doğrudan çocuklarda isimle eşleşme -> tüm ağaçta traverse -> children[0]
      let playfield: Object3D | undefined = TableMesh.mesh

      if (!playfield) {
        const kids = Array.isArray(this.table.children) ? this.table.children : []
        playfield = kids.find((n) => {
          const nm = (n.name || "").toLowerCase()
          return nm.includes("cloth") || nm.includes("playfield") || nm.includes("felt")
        })
      }

      if (!playfield) {
        this.table.traverse((o) => {
          if (playfield) return
          const nm = (o.name || "").toLowerCase()
          if (nm.includes("cloth") || nm.includes("playfield") || nm.includes("felt")) {
            playfield = o
          }
        })
      }

      if (!playfield) {
        playfield = (this.table.children && this.table.children[0]) || undefined
      }

      if (!playfield) {
        throw new Error("Playfield (cloth) mesh not found in GLTF.")
      }

      // --- Boyut ölç ---
      playfield.updateMatrixWorld(true)
      let bbox = new Box3().setFromObject(playfield)
      const size = new Vector3()
      bbox.getSize(size) // size.x ~ uzun kenar, size.y ~ kısa kenar (modele göre değişebilir)

      // TableGeometry.tableX/Y: burun-burun yarım ölçüler → hedef tam ölçüler:
      const targetLen = 2 * TableGeometry.tableX
      const targetWid = 2 * TableGeometry.tableY

      // --- Eksen/dönüklük farkına dayanıklı uniform scale ---
      // Bazı GLTF’lerde uzun eksen Y’de olabilir; ikisini de karşılaştırıp en güvenlisini seçiyoruz
      const scaleX = targetLen / (size.x || 1)
      const scaleY = targetWid / (size.y || 1)
      const scaleX_swapped = targetLen / (size.y || 1)
      const scaleY_swapped = targetWid / (size.x || 1)

      // İki olası eşlemeden “daha düzgün” olanı seç (alan bazlı sapma veya minimum ölçek farkı)
      const uniformA = Math.min(scaleX, scaleY)         // (x→len, y→wid)
      const uniformB = Math.min(scaleX_swapped, scaleY_swapped) // (x→wid, y→len)

      const useSwap = Math.abs(scaleX - scaleY) > Math.abs(scaleX_swapped - scaleY_swapped)
      const s = useSwap ? uniformB : uniformA

      this.table.scale.multiplyScalar(s)
      this.table.updateMatrixWorld(true)

      // --- X/Y’de merkeze al (Z’yi olduğu gibi bırak) ---
      bbox = new Box3().setFromObject(playfield)
      const c = new Vector3()
      bbox.getCenter(c)
      this.table.position.x -= c.x
      this.table.position.y -= c.y

      // (İsterseniz burada mm cinsinden sapmayı loglayabilirsiniz)
      // const after = new Vector3(); bbox.getSize(after);
      // console.debug("playfield target (m):", targetLen, targetWid, "actual:", after.x, after.y)

      // TableMesh.mesh’i atamak isterseniz (bazı yerlere referans gidiyor olabilir):
      // Eğer özel bir playfield mesh’iniz yoksa ana child’ı koruyun.
      if (!TableMesh.mesh) {
        TableMesh.mesh = (m.scene.children && m.scene.children[0]) as any
      }

      this.done()
    })

    // 3) Istaka modeli (özel ölçek gerekmiyor)
    importGltf("models/cue.gltf", (m) => {
      this.cue = m.scene
      CueMesh.mesh = (m.scene.children && m.scene.children[0]) as any
      this.done()
    })
  }

  // Yerelde (GLTF’siz) prosedürel masa için
  creatLocal() {
    this.sound = new Sound(false)
    TableMesh.mesh = new TableMesh().generateTable(TableGeometry.hasPockets)
    this.table = TableMesh.mesh
  }

  static localAssets(ruletype = "") {
    const assets = new Assets(ruletype)
    assets.creatLocal()
    return assets
  }

  private done() {
    // Arka plan + masa + ıstaka hazır olunca callback
    if (this.background && this.table && this.cue) {
      this.ready && this.ready()
    }
  }
}
