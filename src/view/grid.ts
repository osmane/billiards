import {
  Group,
  BufferGeometry,
  Vector3,
  Line,
  LineBasicMaterial,
  Mesh,
  CircleGeometry,
  MeshBasicMaterial,
  BoxGeometry,
  TorusGeometry
} from "three"
import { TableGeometry } from "./tablegeometry"
import { R } from "../model/physics/constants"

export class Grid {
  /**
   * Masa üzerindeki yardımcı işaretleri (grid, diamond vb.) oluşturur.
   * Oyun moduna göre ne çizeceğine karar verir.
   */
  static createMarkings(): Group {
    if (TableGeometry.hasPockets) {
      // Cepli oyunlar (Pool, Snooker) için standart çizgileri çiz.
      return this.createPoolGrid();
    } else {
      // Cepsiz oyunlar (3-Bant) için diamond noktalarını çiz.
      return this.createCaromDiamonds();
    }
  }

  /**
   * Pool/Snooker masaları için baulk line, "D" ve merkez çizgilerini çizer.
   * NİHAİ DÜZELTME: Güvenilir görünürlük için 'Line' yerine 'Mesh' kullanılmıştır.
   */
  private static createPoolGrid(): Group {
    const grid = new Group()
    const X = TableGeometry.tableX
    const Y = TableGeometry.tableY

    // Çizgiler için sabitler
    const LINE_THICKNESS = 0.002; // 2mm kalınlığında şeritler
    // TEST AMAÇLI DEĞİŞİKLİK: Çizgilerin Z pozisyonunu, topların yarıçapının 4 katı
    // yukarıya taşıyarak görünürlüklerini test ediyoruz.
    const lineZ = R * 4;
    const material = new MeshBasicMaterial({ color: 0xffffff }); // Katı beyaz

    // Dikey merkez çizgisi (Mesh olarak)
    let geometry: BufferGeometry = new BoxGeometry(LINE_THICKNESS, 2 * Y, 0.0001);
    let lineMesh = new Mesh(geometry, material);
    lineMesh.position.set(0, 0, lineZ);
    grid.add(lineMesh);

    // Yatay merkez çizgisi (Mesh olarak)
    geometry = new BoxGeometry(2 * X, LINE_THICKNESS, 0.0001);
    lineMesh = new Mesh(geometry, material);
    lineMesh.position.set(0, 0, lineZ);
    grid.add(lineMesh);

    // Baulk line (Mesh olarak)
    geometry = new BoxGeometry(2 * X, LINE_THICKNESS, 0.0001);
    lineMesh = new Mesh(geometry, material);
    lineMesh.position.set(0, Y / 2.1, lineZ);
    grid.add(lineMesh);
    
    // "D" (Yarım halka - TorusGeometry olarak)
    const dRadius = R * 11.5;
    const dGeometry = new TorusGeometry(dRadius, LINE_THICKNESS / 2, 8, 100, Math.PI);
    const dMesh = new Mesh(dGeometry, material);
    dMesh.position.set(X / 2.9, Y / 2.1, lineZ);
    grid.add(dMesh);

    return grid
  }

  /**
   * 3-Bant (Karambol) masası için standart diamond noktalarını oluşturur.
   */
  private static createCaromDiamonds(): Group {
    const diamonds = new Group();
    const visualHalfLength = TableGeometry.X;
    const visualHalfWidth = TableGeometry.Y;
    
    const cushionThickness = R * 2.0;
    const cushionHeight = R * 1.25;
    const verticalPosition = (cushionHeight - R * 0.25) / 2;
    const diamondZ = verticalPosition + cushionHeight / 2 + 0.001;

    // RENK DEĞİŞİKLİĞİ: Diamond rengi SARI olarak ayarlandı.
    const diamondMaterial = new MeshBasicMaterial({ color: 0xFFFF00 }); // Sarı renk
    const diamondRadius = R / 4;
    const diamondGeometry = new CircleGeometry(diamondRadius, 16);

    const createDiamond = (x: number, y: number) => {
      const diamond = new Mesh(diamondGeometry, diamondMaterial);
      diamond.position.set(x, y, diamondZ);
      diamonds.add(diamond);
    };

    const longRailYPos = visualHalfWidth + cushionThickness / 2;
    const longRailYNeg = -visualHalfWidth - cushionThickness / 2;
    for (let i = -3; i <= 3; i++) {
        const xPos = visualHalfLength * (i / 4.0);
        createDiamond(xPos, longRailYPos);
        createDiamond(xPos, longRailYNeg);
    }

    const shortRailXPos = visualHalfLength + cushionThickness / 2;
    const shortRailXNeg = -visualHalfLength - cushionThickness / 2;
    const yPositions = [-visualHalfWidth / 2, 0, visualHalfWidth / 2];
    for(const yPos of yPositions) {
        createDiamond(shortRailXPos, yPos);
        createDiamond(shortRailXNeg, yPos);
    }
    
    return diamonds;
  }
}

