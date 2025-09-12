// src/view/assets.ts
import { Object3D, Mesh, Box3, Vector3, Group } from "three"
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

  background: Object3D | Mesh
  table: Object3D | Mesh
  sound: Sound
  cue: Object3D | Mesh

  constructor(ruletype: string) {
    this.rules = RuleFactory.create(ruletype, null)
    this.rules.tableGeometry()
  }

  loadFromWeb(ready: () => void) {
    this.ready = ready
    this.sound = new Sound(true)

    // 1) Arka plan modelini yükle (Bu kısım değişmiyor)
    importGltf("models/background.gltf", (m) => {
      this.background = m.scene
      this.done()
    })

    // 2) Istaka modelini yükle (Bu kısım değişmiyor)
    importGltf("models/cue.gltf", (m) => {
      this.cue = m.scene
      CueMesh.mesh = (m.scene.children && m.scene.children[0]) as any
      this.done()
    })

    // --- YENİ MANTIK BAŞLANGICI: MASA YÜKLEME ---
    // Önce oyun kurallarından asset yolunu alıyoruz
    const tableAssetPath = this.rules.asset()

    // Eğer bir asset yolu belirtilmişse (Pool, Snooker vb. için)
    if (tableAssetPath && tableAssetPath.length > 0) {
      // MEVCUT GLTF YÜKLEME VE ÖLÇEKLENDİRME MANTIĞI BURADA ÇALIŞACAK
      importGltf(tableAssetPath, (m) => {
        this.table = m.scene

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

        playfield.updateMatrixWorld(true)
        let bbox = new Box3().setFromObject(playfield)
        const size = new Vector3()
        bbox.getSize(size)

        const targetLen = 2 * TableGeometry.X // Görsel tam uzunluk
        const targetWid = 2 * TableGeometry.Y // Görsel tam genişlik

        const scaleX = targetLen / (size.x || 1)
        const scaleY = targetWid / (size.y || 1)
        const scaleX_swapped = targetLen / (size.y || 1)
        const scaleY_swapped = targetWid / (size.x || 1)
        
        const useSwap = Math.abs(scaleX - scaleY) > Math.abs(scaleX_swapped - scaleY_swapped)
        const s = useSwap ? Math.min(scaleX_swapped, scaleY_swapped) : Math.min(scaleX, scaleY)

        this.table.scale.multiplyScalar(s)
        this.table.updateMatrixWorld(true)

        bbox = new Box3().setFromObject(playfield)
        const c = new Vector3()
        bbox.getCenter(c)
        this.table.position.x -= c.x
        this.table.position.y -= c.y

        if (!TableMesh.mesh) {
          TableMesh.mesh = (m.scene.children && m.scene.children[0]) as any
        }
        
        this.done()
      })
    } else {
      // EĞER ASSET YOLU BOŞ İSE (3-Bant modu için)
      // Masayı GLTF'den yüklemek yerine TableMesh ile dinamik olarak oluştur.
      console.log("No GLTF asset path provided. Generating table procedurally.");
      this.table = new TableMesh().generateTable(TableGeometry.hasPockets)
      this.done()
    }
    // --- YENİ MANTIK SONU ---
  }

  // creatLocal ve localAssets fonksiyonları değişmeden kalabilir
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
    // Arka plan, masa ve ıstaka yüklendiğinde oyunu başlat
    if (this.background && this.table && this.cue) {
      this.ready && this.ready()
    }
  }
}
