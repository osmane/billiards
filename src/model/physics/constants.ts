export const g = 9.8
export let mu = 0.00985
export let muS = 0.16
export let muC = 0.85
export let rho = 0.034
export let e = 0.86

// Mathaven specific
// Coefficient of restitution
export let ee = 0.98

// Coefficient of sliding friction (table)
export let μs = 0.212

// Coefficient of sliding friction (cushion)
export let μw = 0.14

export let Mz: number
export let Mxy: number
export let I: number

// Fixed angle of cushion contact point above ball center
export const sinθ = 2 / 5
// Fixed angle of cushion contact point above ball center
export const cosθ = Math.sqrt(21) / 5

// src/model/physics/constants.ts

export const CAROM_TABLE_LENGTH = 2.84;     // Oynanabilir alan (banttan banta) uzunluk
export const CAROM_TABLE_WIDTH = 1.42;     // Oynanabilir alan (banttan banta) genişlik
export const CAROM_BALL_DIAMETER = 0.0615;   // 61.5 mm

export let BALL_MASS = 0.165; // kg

export const POOL_BALL_RADIUS = 0.05715 / 2;   // 57.15 mm (2 1/4")
export const SNOOKER_BALL_RADIUS = 0.0525 / 2; // 52.5 mm (2 1/16")
export const CAROM_BALL_RADIUS = 0.0615 / 2;   // 61.5 mm

// (yeni) Kütleler (kg) — tipik aralıklar; gerekirse kalibre et:
export const POOL_BALL_MASS = 0.17;     // 0.165–0.17 kg yaygın
export const SNOOKER_BALL_MASS = 0.142; // ~142 g
export const CAROM_BALL_MASS = 0.21;    // 0.205–0.215 kg

// Zaten var: global parametreler ve setter’lar
export let R = POOL_BALL_RADIUS;
export let m = POOL_BALL_MASS;

export function setR(radius: number) {
  R = radius;
  refresh?.();
}

refresh()

function refresh() {
  Mz = ((mu * m * g * 2) / 3) * rho
  Mxy = (7 / (5 * Math.sqrt(2))) * R * mu * m * g
  I = (2 / 5) * m * R * R
}

export function setm(val: number) {
  m = val;
  refresh?.();
}
export function setmu(val: number) {
  mu = val
  refresh()
}
export function setrho(val: number) {
  rho = val
  refresh()
}
export function setmuS(val: number) {
  muS = val
}
export function sete(val: number) {
  e = val
}
export function setmuC(val: number) {
  muC = val
}
export function setμs(val: number) {
  μs = val
}
export function setμw(val: number) {
  μw = val
}
export function setee(val: number) {
  ee = val
}
