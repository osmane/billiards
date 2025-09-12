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
    const markings = new Group();
    
    // --- DEĞİŞİKLİK BURADA BAŞLIYOR ---

    // 1. Gerekli tüm boyutları tanımla: Hem fiziksel (hesaplama için) hem de görsel (çizim için)
    const physicalHalfLength = TableGeometry.tableX;
    const physicalHalfWidth = TableGeometry.tableY;
    const visualHalfLength = TableGeometry.X;
    const visualHalfWidth = TableGeometry.Y;
    
    const cushionThickness = R * 2.0;

    const diamondMaterial = new MeshBasicMaterial({ color: 0xFFFF00 }); // Sarı renk
    const diamondRadius = R / 4;
    const diamondGeometry = new CircleGeometry(diamondRadius, 16);

    const createDiamond = (x: number, y: number) => {
      const diamond = new Mesh(diamondGeometry, diamondMaterial);
      const cushionHeight = R * 1.25;
      const diamondZ = -R + cushionHeight + 0.0001;
      diamond.position.set(x, y, diamondZ);
      markings.add(diamond);
    };

    // 2. Diamond ve Grid pozisyonlarını FİZİKSEL boyutlara göre hesapla
    const xPositions: number[] = [];
    for (let i = -3; i <= 3; i++) {
      // HESAPLAMAYI FİZİKSEL GENİŞLİKLE YAP
      const xPos = physicalHalfLength * (i / 4.0);
      xPositions.push(xPos); 
    }

    // 3. Hesaplanan FİZİKSEL pozisyonları kullanarak diamond'ları GÖRSEL konumlara (bantların üzerine) yerleştir.
    for (const xPos of xPositions) {
        createDiamond(xPos, visualHalfWidth + cushionThickness / 2);
        createDiamond(xPos, -visualHalfWidth - cushionThickness / 2);
    }
    
    // Y ekseni için de aynı düzeltmeyi yap
    const yPositions = [
        -physicalHalfWidth / 2, 
        0, 
        physicalHalfWidth / 2
    ];
    for (const yPos of yPositions) {
      createDiamond(visualHalfLength + cushionThickness / 2, yPos);
      createDiamond(-visualHalfLength - cushionThickness / 2, yPos);
    }

    // === BÖLÜM 2: Izgara Çizgileri ===
    const LINE_THICKNESS = 0.004;
    const lineZ = -0.035;
    const lineMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });

    // 4. Dikey çizgileri, FİZİKSEL pozisyonlara göre ama GÖRSEL uzunlukta çiz.
    for (const xPos of xPositions) {
      // Çizginin uzunluğu hala masanın tamamını kaplamalı (visualHalfWidth)
      const geometry = new BoxGeometry(LINE_THICKNESS, 2 * visualHalfWidth, 0.01);
      const lineMesh = new Mesh(geometry, lineMaterial);
      
      if (xPos === 0) {
        lineMesh.renderOrder = 3;
        lineMesh.position.set(xPos, 0, lineZ + 0.001);
      } else {
        lineMesh.renderOrder = 2;
        lineMesh.position.set(xPos, 0, lineZ);
      }
      markings.add(lineMesh);
    }

    // 5. Yatay çizgileri, FİZİKSEL pozisyonlara göre ama GÖRSEL uzunlukta çiz.
    for (const yPos of yPositions) {
      // Çizginin uzunluğu hala masanın tamamını kaplamalı (visualHalfLength)
      const geometry = new BoxGeometry(2 * visualHalfLength, LINE_THICKNESS, 0.01); 
      const lineMesh = new Mesh(geometry, lineMaterial);
      lineMesh.position.set(0, yPos, lineZ);
      lineMesh.renderOrder = 1;
      markings.add(lineMesh);
    }

    return markings;
  }
}

