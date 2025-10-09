# Piqué Coordinate System Fix

## Status
**Created**: 2025-10-09
**Commit**: 5cc5f55
**Status**: ✅ Fixed - Coordinate Sign Corrected

---

## Problem

Strike point indicator was appearing in the **LOWER half** of the ball (causing backspin/draw shot) instead of the **UPPER half** (required for piqué topspin curve).

---

## Root Cause

**Coordinate system misunderstanding**:
- In this aiming system: **Positive Y = Up, Negative Y = Down**
- Implementation incorrectly used: `uiY = -0.6` (thinking negative was up)
- Result: Strike point positioned **below center** → backspin → no curve

---

## Solution

**Changed Y-offset sign** in `src/view/aiminputs.ts:170`:

```typescript
// WRONG (was):
const uiY = -0.6  // This positioned BELOW center ❌

// CORRECT (now):
const uiY = 0.6   // This positions ABOVE center ✅
```

---

## Expected Behavior Now

1. ✅ Strike indicator appears in **UPPER half** of cue ball
2. ✅ Generates **topspin** (not backspin)
3. ✅ Produces **curved trajectories** via Magnus effect
4. ✅ Left presets curve left, right presets curve right

---

## Validation

### Visual Check
- [ ] Select any piqué preset from dropdown
- [ ] Strike indicator should be in **TOP portion** of cue ball (not bottom)

### Physics Check
- [ ] Execute shot
- [ ] Ball should **curve** (not travel straight or draw back)
- [ ] Direction matches preset name (left/right/center)

---

## Git History

```
5cc5f55 - Fix coordinate inversion: use positive Y for upper strike point
4628672 - Fix piqué preset
02c8618 - Fix piqué preset strike point to upper half of ball
```

---

**Status**: ✅ Ready for testing
**Build**: ✅ Successful (4078ms)
