import { R } from "../model/physics/constants"

function getDefaultPoolDimensions(radius: number) {
  const tableX = radius * 43;
  const tableY = radius * 21;
  return {
    tableX: tableX,
    tableY: tableY,
    X: tableX + radius,
    Y: tableY + radius,
  }
}
const initialDimensions = getDefaultPoolDimensions(R);

export class TableGeometry {
  static tableX: number = initialDimensions.tableX; // FİZİK SINIRI
  static tableY: number = initialDimensions.tableY; // FİZİK SINIRI
  static X: number = initialDimensions.X;           // GÖRSEL SINIR
  static Y: number = initialDimensions.Y;           // GÖRSEL SINIR
  static hasPockets: boolean = true;

  static scaleToRadius(R: number) {
    const dims = getDefaultPoolDimensions(R);
    TableGeometry.tableX = dims.tableX;
    TableGeometry.tableY = dims.tableY;
    TableGeometry.X = dims.X;
    TableGeometry.Y = dims.Y;
    TableGeometry.hasPockets = true;
  }

  static setCaromDimensions(length: number, width: number, ballRadius: number) {
    this.hasPockets = false;

    // 1. GÖRSEL SINIRLARI AYARLA (Masanın tam yarı ölçüleri)
    this.X = length / 2;
    this.Y = width / 2;

    // 2. FİZİKSEL SINIRLARI AYARLA (Top merkezinin hareket alanı)
    this.tableX = this.X - ballRadius;
    this.tableY = this.Y - ballRadius;
  }
}