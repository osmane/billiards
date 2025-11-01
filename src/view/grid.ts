import {
  Group,
  BufferGeometry,
  Vector3,
  Line,
  LineBasicMaterial,
  Mesh,
  CircleGeometry,
  MeshBasicMaterial,
  MeshPhongMaterial,
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
   * Pool/Snooker masaları için işaretleri çizer.
   * Bu modlarda grid çizgisi istenmediği için boş bir grup döndürür.
   */
  private static createPoolGrid(): Group {
    // Diğer oyun modlarında grid veya başka bir işaret çizilmemesi için
    // boş bir "Group" nesnesi döndürüyoruz.
    return new Group();
  }

  /**
   * 3-Bant (Karambol) masası için standart diamond noktalarını oluşturur.
   */
  private static createCaromDiamonds(): Group {
    const markings = new Group();

    /**
    * Elmasların merkezden uzaklaştıkça ne kadar içe çekileceğini belirler.
    * 0 = İçe çekme yok, tüm noktalar geometrik olarak hizalı.
    * Pozitif değerler (örn: 0.015) kenardaki noktaları içe doğru kaydırır.
    */
    const LONG_RAIL_TAPER_FACTOR = 0.009;
    const SHORT_RAIL_TAPER_FACTOR = 0.001;

    const visualHalfLength = TableGeometry.X;
    const visualHalfWidth = TableGeometry.Y;
    const cushionThickness = R * 2.0;

    const cushionHeight = R * 1.25;
    const frameWidth = R * 2.4;
    const frameGap = R * 0.15;
    const frameHeight = cushionHeight;
    const frameTopZ = -R + frameHeight;

    const frameCenterOffsetY =
      visualHalfWidth + cushionThickness + frameGap + frameWidth / 2;
    const frameCenterOffsetX =
      visualHalfLength + cushionThickness + frameGap + frameWidth / 2;

    const diamondMaterial = new MeshPhongMaterial({
      color: 0xf2f2f2,
      emissive: 0x1a1a1a,
      emissiveIntensity: 0.18,
      shininess: 4,
    });
    const diamondGeometry = new CircleGeometry(R / 4, 16);
    const diamondZ = frameTopZ + 0.001;

    const createDiamond = (x: number, y: number) => {
      const diamond = new Mesh(diamondGeometry, diamondMaterial);
      diamond.position.set(x, y, diamondZ);
      markings.add(diamond);
    };

    // --- BÖLÜM 1: Elmas Noktalar ---

    // Uzun bantlar (üst ve alt) için 7 noktayı tek döngüde oluştur:
    // i, -3'ten +3'e ilerlerken [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75] oranlarını üretir.    
    const yPosLong = frameCenterOffsetY;
    for (let i = -4; i <= 4; i++) {
      const ratio = i / 4.0;
      // Taper oranını yeni sınıra göre ayarla (Math.abs(i) / 4.0)
      const taper = LONG_RAIL_TAPER_FACTOR * (Math.abs(i) / 4.0);
      const adjustedX = visualHalfLength * ratio - Math.sign(i) * taper;

      createDiamond(adjustedX, yPosLong);
      createDiamond(adjustedX, -yPosLong);
    }

    // Kısa bantlar (sağ ve sol)
    const xPosShort = frameCenterOffsetX;
    for (let i = -2; i <= 2; i++) {
      const ratio = i / 2.0;
      // Taper oranını yeni sınıra göre ayarla (Math.abs(i) / 2.0)
      const taper = SHORT_RAIL_TAPER_FACTOR * (Math.abs(i) / 2.0);
      const adjustedY = visualHalfWidth * ratio - Math.sign(i) * taper;

      createDiamond(xPosShort, adjustedY);
      createDiamond(-xPosShort, adjustedY);
    }


    // --- BÖLÜM 2: Izgara Çizgileri ---
    // (Bu bölüm de okunabilirlik için aynı algoritmik yaklaşımla güncellendi)
    const lineMaterial = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.051 });
    const LINE_THICKNESS = 0.004;
    const lineZ = -R;

    // Dikey çizgiler
    for (let i = -4; i <= 4; i++) {
      const xPos = visualHalfLength * (i / 4.0);
      const geometry = new BoxGeometry(LINE_THICKNESS, 2 * visualHalfWidth, 0.001);
      const line = new Mesh(geometry, lineMaterial);
      line.position.set(xPos, 0, lineZ);
      markings.add(line);
    }

    // Yatay çizgiler
    for (let i = -2; i <= 2; i++) {
      const yPos = visualHalfWidth * (i / 2.0);
      const geometry = new BoxGeometry(2 * visualHalfLength, LINE_THICKNESS, 0.001);
      const line = new Mesh(geometry, lineMaterial);
      line.position.set(0, yPos, lineZ);
      markings.add(line);
    }

    return markings;
  }
}

