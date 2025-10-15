import { 
  Object3D, 
  Mesh, 
  Box3, 
  Vector3, 
  Group, 
  SphereGeometry // SphereGeometry import'u gerekli
} from "three"
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
  
  // YÜKSEK ÇÖZÜNÜRLÜKLÜ TOP İÇİN EKLENEN ÖZELLİK
  ballGeometry: SphereGeometry | undefined

  // Constructor (yapıcı metot) projenizin orijinal haliyle aynı kalıyor.
  // Bu, 3-bant modunun bozulmasını engeller.
  constructor(ruletype: string) { 
    this.rules = RuleFactory.create(ruletype, null)
    this.rules.tableGeometry()
  }

  loadFromWeb(ready: () => void) {
    this.ready = ready
    this.sound = new Sound(true)

    // YÜKSEK ÇÖZÜNÜRLÜKLÜ TOP GEOMETRİSİ BURADA OLUŞTURULUYOR
    // Bu, tüm toplar için bir kez oluşturulup tekrar kullanılacak.
    this.ballGeometry = new SphereGeometry(1, 64, 32); 

    // ---- Bundan sonraki kodun tamamı projenizin orijinal haliyle aynı ----

    importGltf("models/background.gltf", (m) => {
      this.background = m.scene
      this.done()
    })

    importGltf("models/cue.gltf", (m) => {
      this.cue = m.scene
      CueMesh.mesh = (m.scene.children && m.scene.children[0]) as any
      this.done()
    })

    const tableAssetPath = this.rules.asset()
    if (tableAssetPath && tableAssetPath.length > 0) {
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
            if (playfield) {
              return
            }
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
        const targetLen = 2 * TableGeometry.X
        const targetWid = 2 * TableGeometry.Y
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
        if (!TableGeometry.hasPockets) {
          let clothMesh: Mesh | null = playfield instanceof Mesh ? playfield : null
          if (!clothMesh) {
            playfield.traverse((o) => {
              if (!clothMesh && o instanceof Mesh) {
                clothMesh = o
              }
            })
          }
          const cushionMeshes: Mesh[] = []
          this.table.traverse((o) => {
            if (!(o instanceof Mesh)) {
              return
            }
            if (o === clothMesh) {
              return
            }
            const nm = (o.name || "").toLowerCase()
            if (nm.includes("cushion") || nm.includes("rail") || nm.includes("bande") || nm.includes("bank")) {
              cushionMeshes.push(o)
            }
          })
          if (!cushionMeshes.length) {
            this.table.children.forEach((child) => {
              if (child instanceof Mesh && child !== clothMesh) {
                cushionMeshes.push(child)
              }
            })
          }
          if (clothMesh) {
            TableMesh.caromSurfaces = {
              cloth: clothMesh,
              cushions: cushionMeshes,
            }
          }
        } else {
          TableMesh.caromSurfaces = null
        }
        if (!TableMesh.mesh) {
          TableMesh.mesh = (m.scene.children && m.scene.children[0]) as any
        }
        this.done()
      })
    } else {
      console.log("No GLTF asset path provided. Generating table procedurally.");
      this.table = new TableMesh().generateTable(TableGeometry.hasPockets)
      this.done()
    }
  }

  creatLocal() {
    this.sound = new Sound(false)
    TableMesh.mesh = new TableMesh().generateTable(TableGeometry.hasPockets)
    this.table = TableMesh.mesh
    // Lokal mod için de top geometrisini oluşturmayı unutmuyoruz
    this.ballGeometry = new SphereGeometry(1, 64, 32); 
  }

  static localAssets(ruletype = ""): Assets {
    const assets = new Assets(ruletype) 
    assets.creatLocal()
    return assets
  }

  private done() {
    if (this.background && this.table && this.cue) {
      this.ready && this.ready()
    }
  }
}
