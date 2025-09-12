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
    const visualHalfLength = TableGeometry.X;
    const visualHalfWidth = TableGeometry.Y;

    // === BÖLÜM 1: Mevcut Diamond Noktalarının Çizimi ===
    const cushionThickness = R * 2.0;
    const cushionHeight = R * 1.25;
    const verticalPosition = (cushionHeight - R * 0.25) / 2;
    const diamondZ = verticalPosition + cushionHeight / 2 + 0.001;

    const diamondMaterial = new MeshBasicMaterial({ color: 0xFFFF00 }); // Sarı renk
    const diamondRadius = R / 4;
    const diamondGeometry = new CircleGeometry(diamondRadius, 16);

    const createDiamond = (x: number, y: number) => {
      const diamond = new Mesh(diamondGeometry, diamondMaterial);
      diamond.position.set(x, y, diamondZ);
      markings.add(diamond);
    };

    // Uzun bantlardaki diamond'lar ve X konumlarının saklanması
    // --- DÜZELTME BURADA ---
    // Dizinin 'number' türünde elemanlar içereceğini belirtiyoruz.
    const xPositions: number[] = [];
    for (let i = -3; i <= 3; i++) {
      const xPos = visualHalfLength * (i / 4.0);
      xPositions.push(xPos); // Izgara çizgileri için x konumlarını sakla
      createDiamond(xPos, visualHalfWidth + cushionThickness / 2,);
      createDiamond(xPos, -visualHalfWidth - cushionThickness / 2,);
    }

    // Kısa bantlardaki diamond'lar
    const yPositions = [-visualHalfWidth / 2, 0, visualHalfWidth / 2];
    for (const yPos of yPositions) {
      createDiamond(visualHalfLength + cushionThickness / 2, yPos);
      createDiamond(-visualHalfLength - cushionThickness / 2, yPos);
    }

    // === BÖLÜM 2: İsteğiniz Üzerine Eklenen Izgara Çizgileri ===
    const LINE_THICKNESS = 0.004;
    const lineZ = -0.035;
    const lineMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });

    // Dikey çizgileri oluştur
    for (const xPos of xPositions) {
        const geometry = new BoxGeometry(LINE_THICKNESS, 2 * visualHalfWidth, 0.01);
        const lineMesh = new Mesh(geometry, lineMaterial);
        
        // SADECE VE SADECE x=0 olan merkez dikey çizgi için özel işlem yapıyoruz.
        if (xPos === 0) {
            // Çözüm A: Bu çizgiye en yüksek render önceliğini veriyoruz.
            lineMesh.renderOrder = 3; 
            // Çözüm B: Bu çizgiyi diğerlerinden fark edilemeyecek kadar az yukarı taşıyoruz.
            // Bu, render motoru için son ve kesin komut olacaktır.
            lineMesh.position.set(xPos, 0, lineZ + 0.001); 
        } else {
            // Diğer dikey çizgiler olduğu gibi kalıyor.
            lineMesh.renderOrder = 2;
            lineMesh.position.set(xPos, 0, lineZ);
        }
        
        markings.add(lineMesh);
    }

    // Yatay çizgileri oluştur
    for(const yPos of yPositions) {
        // Derinliği burada da tutarlılık için artırıyoruz.
        const geometry = new BoxGeometry(2 * visualHalfLength, LINE_THICKNESS, 0.01); // Değeri 0.0001'den 0.01'e yükselttik.
        const lineMesh = new Mesh(geometry, lineMaterial);
        lineMesh.position.set(0, yPos, lineZ);
        // Yatay çizgilerin render sırasını 1 olarak bırakıyoruz.
        lineMesh.renderOrder = 1;
        markings.add(lineMesh);
    }

    return markings;
  }
}

