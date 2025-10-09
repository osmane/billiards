/**
 * Piqué Shot Preset Definitions
 *
 * These presets correspond to the validated test cases from the piqué shot
 * side spin validation (test/model/pique_sidespin.spec.ts).
 *
 * Each preset defines:
 * - Vertical elevation angle (65-75 degrees for piqué shots)
 * - Horizontal offset (controls curve direction: negative=left, positive=right)
 * - Power (normalized 0-1)
 * - Aim angle (default 45° northeast)
 */

export interface PiquePreset {
  id: string
  name: string
  verticalAngle: number      // degrees (0-90)
  horizontalOffset: number   // fraction of ball radius (-0.5 to +0.5)
  power: number              // normalized (0-1)
  aimAngle: number           // degrees (0-360)
}

/**
 * Preset library based on test validation data
 *
 * Test IDs correspond to PIQUE_SIDESPIN_REPORT.md results:
 * - T1-T5: 75° angle with varying horizontal offsets
 * - T6-T10: 65° angle with varying horizontal offsets
 */
export const PIQUE_PRESETS: PiquePreset[] = [
  // 75° Angle Presets (tighter curves)
  {
    id: 'T1',
    name: 'Piqué: 75° - Center Strike',
    verticalAngle: 75,
    horizontalOffset: 0.0,
    power: 0.7,
    aimAngle: 45
  },
  {
    id: 'T2',
    name: 'Piqué: 75° - Slight Right Curve',
    verticalAngle: 75,
    horizontalOffset: 0.25,
    power: 0.7,
    aimAngle: 45
  },
  {
    id: 'T3',
    name: 'Piqué: 75° - Strong Right Curve',
    verticalAngle: 75,
    horizontalOffset: 0.5,
    power: 0.7,
    aimAngle: 45
  },
  {
    id: 'T4',
    name: 'Piqué: 75° - Slight Left Curve',
    verticalAngle: 75,
    horizontalOffset: -0.25,
    power: 0.7,
    aimAngle: 45
  },
  {
    id: 'T5',
    name: 'Piqué: 75° - Strong Left Curve',
    verticalAngle: 75,
    horizontalOffset: -0.5,
    power: 0.7,
    aimAngle: 45
  },

  // 65° Angle Presets (gentler curves)
  {
    id: 'T6',
    name: 'Piqué: 65° - Center Strike',
    verticalAngle: 65,
    horizontalOffset: 0.0,
    power: 0.7,
    aimAngle: 45
  },
  {
    id: 'T7',
    name: 'Piqué: 65° - Slight Right Curve',
    verticalAngle: 65,
    horizontalOffset: 0.25,
    power: 0.7,
    aimAngle: 45
  },
  {
    id: 'T8',
    name: 'Piqué: 65° - Strong Right Curve',
    verticalAngle: 65,
    horizontalOffset: 0.5,
    power: 0.7,
    aimAngle: 45
  },
  {
    id: 'T9',
    name: 'Piqué: 65° - Slight Left Curve',
    verticalAngle: 65,
    horizontalOffset: -0.25,
    power: 0.7,
    aimAngle: 45
  },
  {
    id: 'T10',
    name: 'Piqué: 65° - Strong Left Curve',
    verticalAngle: 65,
    horizontalOffset: -0.5,
    power: 0.7,
    aimAngle: 45
  }
]

/**
 * Retrieve a preset by its ID
 * @param id - Preset identifier (e.g., 'T1', 'T2')
 * @returns The preset object or undefined if not found
 */
export function getPresetById(id: string): PiquePreset | undefined {
  return PIQUE_PRESETS.find(preset => preset.id === id)
}

/**
 * Get all presets for a specific vertical angle
 * @param angle - Vertical angle in degrees
 * @returns Array of presets matching the angle
 */
export function getPresetsByAngle(angle: number): PiquePreset[] {
  return PIQUE_PRESETS.filter(preset => preset.verticalAngle === angle)
}

/**
 * Get presets that curve in a specific direction
 * @param direction - 'left', 'right', or 'center'
 * @returns Array of presets matching the direction
 */
export function getPresetsByDirection(direction: 'left' | 'right' | 'center'): PiquePreset[] {
  switch (direction) {
    case 'left':
      return PIQUE_PRESETS.filter(p => p.horizontalOffset < 0)
    case 'right':
      return PIQUE_PRESETS.filter(p => p.horizontalOffset > 0)
    case 'center':
      return PIQUE_PRESETS.filter(p => p.horizontalOffset === 0)
    default:
      return []
  }
}
