export const CENTER = { x: 500, y: 400 };
export const BALL_R = 110;
export const ORBIT_R = 250;
export const AIM_R = 350;
export const CUE_W = 12;
export const CUE_H = 240;
export const AIM_LINE_LEN = 1000;
export const TABLE_FLOOR_Y = CENTER.y + BALL_R;
export const COLLISION_EPS = 0.5;
export const AXIS_X = CENTER.x;
export const ORBIT_MAX = 90;
export const CUE_ELEVATION_MAX = 90;

// Actual cue dimensions from HTML: y=-60 (cue tip top) to y=180 (cue butt bottom)
export const CUE_TIP_TOP = -60;
export const CUE_BUTT_BOTTOM = 180;

export const TIP_CENTER = { x: 0, y: CUE_TIP_TOP };
export const TIP_LEFT = { x: -CUE_W / 2, y: CUE_TIP_TOP };
export const TIP_RIGHT = { x: CUE_W / 2, y: CUE_TIP_TOP };
export const CUE_CORNERS = [
  { x: -CUE_W / 2, y: CUE_TIP_TOP },
  { x: CUE_W / 2, y: CUE_TIP_TOP },
  { x: -CUE_W / 2, y: CUE_BUTT_BOTTOM },
  { x: CUE_W / 2, y: CUE_BUTT_BOTTOM }
];

export const MIN_CONTACTS_FOR_SPIN = 2;
