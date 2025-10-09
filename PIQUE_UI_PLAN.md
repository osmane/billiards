# Piqué Shot Preset UI - Implementation Plan

## Document Status
**Created**: 2025-10-09
**Status**: 🔄 In Progress
**Parent Task**: UI validation feature for piqué shot testing
**Related Documents**:
- Test Data: `PIQUE_SIDESPIN_REPORT.md`
- Test Suite: `test/model/pique_sidespin.spec.ts`

---

## Objective

Add a dropdown menu to the control panel containing ~10 preset piqué shots. When selected, the cue ball strike indicator updates visually, and clicking "Hit" executes the preset shot.

**Purpose**: Visual validation that test-documented behavior matches in-game experience.

---

## Requirements Summary

### User Interaction Flow
1. User selects preset from dropdown menu
2. Cue ball indicator updates to show precise strike point
3. User clicks "Hit" button
4. Shot executes using preset parameters (overrides other aiming settings)

### Preset Requirements
- Tiered selection: varying vertical elevations and horizontal offsets
- Include shots that curve left and right
- Descriptive naming: `"Piqué: 75° - Curve Right"`
- Approximately 10 presets total

---

## Implementation Plan

### Phase 1: Data Structure Design ✅

**Preset Interface**:
```typescript
interface PiquePreset {
  id: string
  name: string
  description: string
  verticalAngle: number      // degrees (0-90)
  horizontalOffset: number   // fraction of ball radius (-0.5 to +0.5)
  power: number              // normalized (0-1)
  aimAngle?: number          // optional (defaults to 45°)
}
```

**10 Preset Definitions** (based on test data):
1. **T1**: "Piqué: 75° - Center Strike" (baseline, straight)
2. **T2**: "Piqué: 75° - Slight Right Curve" (+25% offset)
3. **T3**: "Piqué: 75° - Strong Right Curve" (+50% offset)
4. **T4**: "Piqué: 75° - Slight Left Curve" (-25% offset)
5. **T5**: "Piqué: 75° - Strong Left Curve" (-50% offset)
6. **T6**: "Piqué: 65° - Center Strike" (baseline, gentler curve)
7. **T7**: "Piqué: 65° - Slight Right Curve" (+25% offset)
8. **T8**: "Piqué: 65° - Strong Right Curve" (+50% offset)
9. **T9**: "Piqué: 65° - Slight Left Curve" (-25% offset)
10. **T10**: "Piqué: 65° - Strong Left Curve" (-50% offset)

All use:
- Power: 0.7 (normalized) ≈ 2.0 m/s
- Aim angle: 45° (northeast)

---

### Phase 2: UI Components 🔄

#### 2.1: HTML Dropdown Element

**Location**: `index.html` - inside `.panel` div, near elevation indicator

```html
<div class="presetContainer">
  <label for="piquePreset">Piqué Preset:</label>
  <select id="piquePreset" class="piquePresetDropdown">
    <option value="">-- Select Preset --</option>
    <option value="T1">Piqué: 75° - Center Strike</option>
    <option value="T2">Piqué: 75° - Slight Right Curve</option>
    <option value="T3">Piqué: 75° - Strong Right Curve</option>
    <option value="T4">Piqué: 75° - Slight Left Curve</option>
    <option value="T5">Piqué: 75° - Strong Left Curve</option>
    <option value="T6">Piqué: 65° - Center Strike</option>
    <option value="T7">Piqué: 65° - Slight Right Curve</option>
    <option value="T8">Piqué: 65° - Strong Right Curve</option>
    <option value="T9">Piqué: 65° - Slight Left Curve</option>
    <option value="T10">Piqué: 65° - Strong Left Curve</option>
  </select>
</div>
```

**Styling** (add to `index.css` or inline styles):
```css
.presetContainer {
  position: absolute;
  bottom: 50px;
  right: 10px;
  background: rgba(0, 0, 0, 0.7);
  padding: 8px;
  border-radius: 5px;
  z-index: 100;
}

.presetContainer label {
  color: #fff;
  font-size: 12px;
  font-family: monospace;
  display: block;
  margin-bottom: 4px;
}

.piquePresetDropdown {
  width: 220px;
  padding: 4px;
  font-size: 12px;
  font-family: monospace;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #4CAF50;
  border-radius: 3px;
  cursor: pointer;
}
```

#### 2.2: TypeScript Preset Data

**New file**: `src/view/piquepresets.ts`

```typescript
export interface PiquePreset {
  id: string
  name: string
  verticalAngle: number
  horizontalOffset: number
  power: number
  aimAngle: number
}

export const PIQUE_PRESETS: PiquePreset[] = [
  { id: 'T1', name: 'Piqué: 75° - Center Strike', verticalAngle: 75, horizontalOffset: 0.0, power: 0.7, aimAngle: 45 },
  { id: 'T2', name: 'Piqué: 75° - Slight Right Curve', verticalAngle: 75, horizontalOffset: 0.25, power: 0.7, aimAngle: 45 },
  { id: 'T3', name: 'Piqué: 75° - Strong Right Curve', verticalAngle: 75, horizontalOffset: 0.5, power: 0.7, aimAngle: 45 },
  { id: 'T4', name: 'Piqué: 75° - Slight Left Curve', verticalAngle: 75, horizontalOffset: -0.25, power: 0.7, aimAngle: 45 },
  { id: 'T5', name: 'Piqué: 75° - Strong Left Curve', verticalAngle: 75, horizontalOffset: -0.5, power: 0.7, aimAngle: 45 },
  { id: 'T6', name: 'Piqué: 65° - Center Strike', verticalAngle: 65, horizontalOffset: 0.0, power: 0.7, aimAngle: 45 },
  { id: 'T7', name: 'Piqué: 65° - Slight Right Curve', verticalAngle: 65, horizontalOffset: 0.25, power: 0.7, aimAngle: 45 },
  { id: 'T8', name: 'Piqué: 65° - Strong Right Curve', verticalAngle: 65, horizontalOffset: 0.5, power: 0.7, aimAngle: 45 },
  { id: 'T9', name: 'Piqué: 65° - Slight Left Curve', verticalAngle: 65, horizontalOffset: -0.25, power: 0.7, aimAngle: 45 },
  { id: 'T10', name: 'Piqué: 65° - Strong Left Curve', verticalAngle: 65, horizontalOffset: -0.5, power: 0.7, aimAngle: 45 },
]

export function getPresetById(id: string): PiquePreset | undefined {
  return PIQUE_PRESETS.find(p => p.id === id)
}
```

#### 2.3: Integration with AimInputs

**Modify**: `src/view/aiminputs.ts`

Add:
- Import preset definitions
- Reference to dropdown element
- Event listener for preset selection
- Method to apply preset parameters
- Store current preset (to override on hit)

```typescript
import { PIQUE_PRESETS, getPresetById, PiquePreset } from './piquepresets'

export class AimInputs {
  // ... existing properties
  readonly piquePresetElement: HTMLSelectElement | null
  currentPreset: PiquePreset | null = null

  constructor(container) {
    // ... existing code
    this.piquePresetElement = document.getElementById("piquePreset") as HTMLSelectElement
    this.addListeners()
  }

  addListeners() {
    // ... existing listeners
    this.piquePresetElement?.addEventListener("change", this.presetChanged)
  }

  presetChanged = (e: Event) => {
    const selectElement = e.target as HTMLSelectElement
    const presetId = selectElement.value

    if (!presetId) {
      this.currentPreset = null
      return
    }

    const preset = getPresetById(presetId)
    if (preset) {
      this.applyPreset(preset)
    }
  }

  applyPreset(preset: PiquePreset) {
    this.currentPreset = preset
    const table = this.container.table
    const cue = table.cue

    // Set aim angle
    cue.aim.angle = (preset.aimAngle * Math.PI) / 180

    // Set elevation
    cue.setElevation(preset.verticalAngle)

    // Set horizontal offset
    // horizontalOffset is fraction of radius: -0.5 to +0.5
    // UI coordinate system: x normalized to [-1, 1] range
    const uiX = preset.horizontalOffset / 0.3  // Convert to UI range (offCenterLimit = 0.3)
    const uiY = 0  // Center vertically for piqué shots
    cue.setSpin(new Vector3(uiX, uiY, 0), table)

    // Set power
    cue.setPower(preset.power)

    // Update all visual indicators
    cue.updateAimInput()
    this.container.updateTrajectoryPrediction()
  }

  // Modify hit method to use preset if active
  hit = (_) => {
    if (this.currentPreset) {
      // Apply preset one more time to ensure parameters are set
      this.applyPreset(this.currentPreset)
    }
    this.container.table.cue.setPower(this.cuePowerElement?.value)
    this.container.inputQueue.push(new Input(0, "SpaceUp"))
  }
}
```

---

### Phase 3: Cue Hit Method Enhancement 🔄

**Modify**: `src/view/cue.ts` - `hit()` method

Need to handle horizontal offset properly in spin calculation:

```typescript
hit(ball: Ball) {
  const aim = this.aim
  this.t = 0
  ball.state = State.Sliding
  ball.vel.copy(unitAtAngle(aim.angle).multiplyScalar(aim.power))

  // Calculate base spin from horizontal offset
  const baseSpin = cueToSpin(aim.offset, ball.vel)

  // Add vertical spin component from cue elevation
  if (aim.elevation > 0) {
    const elevationRad = (aim.elevation * Math.PI) / 180
    const verticalSpinMagnitude = ball.vel.length() * Math.sin(elevationRad) * (5 / (2 * ball.radius))

    // Spin aligned with velocity (matches test implementation)
    const aimAngleRad = aim.angle
    let spinX = verticalSpinMagnitude * Math.cos(aimAngleRad)
    let spinY = verticalSpinMagnitude * Math.sin(aimAngleRad) * 0.3

    // Apply horizontal offset rotation (if offset.x != 0)
    if (aim.offset.x !== 0) {
      // Convert UI offset to physics offset
      const horizontalOffset = aim.offset.x * 0.3  // Denormalize from UI range
      const offsetAngle = horizontalOffset * Math.PI / 4  // Max ±45° at ±0.5
      const cos = Math.cos(offsetAngle)
      const sin = Math.sin(offsetAngle)
      const originalSpinX = spinX
      const originalSpinY = spinY

      // Apply 2D rotation
      spinX = originalSpinX * cos - originalSpinY * sin
      spinY = originalSpinX * sin + originalSpinY * cos
    }

    const verticalSpin = new Vector3(spinX, spinY, 0)
    ball.rvel.copy(baseSpin).add(verticalSpin)
  } else {
    ball.rvel.copy(baseSpin)
  }

  this.container?.trajectoryRenderer?.clearTrajectories()
}
```

---

### Phase 4: Testing Checklist ⏳

**Manual UI Testing**:
- [ ] Dropdown appears in control panel
- [ ] All 10 presets listed with correct names
- [ ] Selecting preset updates cue ball indicator position
- [ ] Elevation display shows correct angle (65° or 75°)
- [ ] Power slider updates to 0.7
- [ ] Clicking "Hit" executes shot with preset parameters
- [ ] Ball curves in expected direction (left vs right)
- [ ] Strong offsets curve more than slight offsets
- [ ] 75° shots curve more than 65° shots
- [ ] Preset selection overrides manual aiming adjustments

**Visual Validation Matrix**:

| Preset | Vertical | Offset | Expected Behavior | Visual Check |
|--------|----------|--------|-------------------|--------------|
| T1 | 75° | 0% | Symmetric curve, no left/right bias | [ ] |
| T2 | 75° | +25% | Slight curve to right | [ ] |
| T3 | 75° | +50% | Strong curve to right | [ ] |
| T4 | 75° | -25% | Slight curve to left | [ ] |
| T5 | 75° | -50% | Strong curve to left | [ ] |
| T6 | 65° | 0% | Gentler symmetric curve | [ ] |
| T7 | 65° | +25% | Gentler right curve | [ ] |
| T8 | 65° | +50% | Gentler strong right | [ ] |
| T9 | 65° | -25% | Gentler left curve | [ ] |
| T10 | 65° | -50% | Gentler strong left | [ ] |

**Cross-Reference with Test Data**:
- Compare final ball positions with `PIQUE_SIDESPIN_REPORT.md` table
- Verify apex positions match expected values
- Confirm trajectory shape matches CSV plots (if visualized)

---

### Phase 5: Git Integration Strategy 📦

**Branch Strategy**:
- Create feature branch: `feature/pique-preset-ui`
- Keep development docs in local files (not committed)
- Commit only implementation code

**Commit Structure**:

**Commit 1**: Add piqué preset data structure
- `src/view/piquepresets.ts` (new)
- Message: "Add piqué shot preset definitions for UI testing"

**Commit 2**: Implement dropdown UI component
- `index.html` (modified - add dropdown)
- `index.css` or inline styles (add preset container styles)
- Message: "Add piqué preset dropdown to control panel"

**Commit 3**: Integrate preset selection with cue controls
- `src/view/aiminputs.ts` (modified - add preset handling)
- Message: "Connect piqué preset selection to cue parameters"

**Commit 4**: Enhance cue hit method for horizontal offset
- `src/view/cue.ts` (modified - update hit method)
- Message: "Implement horizontal offset spin rotation in cue hit"

**Commit 5**: Manual testing validation
- No code changes, just testing
- Optional commit of test results if documented

**Push Strategy**:
- Push feature branch to remote
- Create pull request with description referencing test reports
- **Do NOT push development docs** (`*_PLAN.md`, `*_REPORT.md`, etc.)

---

### Phase 6: Documentation (Local Only) 📝

**Create**: `PIQUE_UI_IMPLEMENTATION.md` (local, not committed)
- Implementation notes
- Screenshots of UI (if available)
- Visual validation results
- Known issues or limitations
- Future improvements

**Update**: `activeInstructions.txt` (after completion)
- Mark task as complete
- Add any follow-up tasks or observations

---

## Technical Considerations

### Coordinate System Mapping

**Test Coordinate System** (physics):
- `horizontalOffset`: -0.5 to +0.5 (fraction of ball radius)
- Used directly in spin rotation formula

**UI Coordinate System** (normalized):
- `aim.offset.x`: Normalized by `offCenterLimit` (0.3)
- Range: -1.0 to +1.0 in UI terms
- Need conversion: `physicsOffset = uiOffset * 0.3`

**Conversion Functions**:
```typescript
// UI to Physics
function uiToPhysicsOffset(uiX: number): number {
  return uiX * 0.3  // offCenterLimit
}

// Physics to UI
function physicsToUIOffset(physicsX: number): number {
  return physicsX / 0.3
}
```

### Spin Calculation Alignment

**Test Implementation** (`pique_sidespin.spec.ts:80-110`):
```typescript
const spinX = spinMagnitude * Math.cos(aimAngleRad)
const spinY = spinMagnitude * Math.sin(aimAngleRad) * 0.3

if (horizontalOffset !== 0) {
  const offsetAngle = horizontalOffset * Math.PI / 4
  const cos = Math.cos(offsetAngle)
  const sin = Math.sin(offsetAngle)
  spinX = originalSpinX * cos - originalSpinY * sin
  spinY = originalSpinX * sin + originalSpinY * cos
}
```

**Current Production** (`src/view/cue.ts:66-81`):
- Uses perpendicular spin axis: `upCross(unitAtAngle(aim.angle))`
- This is the OLD implementation that was fixed during testing

**Required Change**: Align production code with test implementation
- Use aligned spin (not perpendicular)
- Apply horizontal offset rotation

---

## Success Criteria

### Functional Requirements
- ✅ Dropdown menu appears in control panel
- ✅ 10 presets listed with descriptive names
- ✅ Preset selection updates cue ball indicator
- ✅ Preset selection updates elevation display
- ✅ Preset selection updates power slider
- ✅ Hit button executes preset shot (overrides manual settings)
- ✅ Ball trajectories match test data expectations

### Visual Validation
- ✅ Left offsets produce left curves
- ✅ Right offsets produce right curves
- ✅ Strong offsets curve more than slight offsets
- ✅ 75° shots have tighter curves than 65° shots
- ✅ Center strikes show symmetric behavior

### Code Quality
- ✅ No breaking changes to existing functionality
- ✅ Clean separation of concerns (presets module)
- ✅ Type-safe TypeScript implementation
- ✅ Proper event handling and cleanup

---

## Timeline Estimate

**Total**: 3-4 hours

| Phase | Task | Estimated Time |
|-------|------|----------------|
| 1 | Data structure design | 30 min |
| 2 | UI components (HTML/CSS) | 30 min |
| 3 | TypeScript integration | 60 min |
| 4 | Cue hit method enhancement | 45 min |
| 5 | Testing and validation | 45 min |
| 6 | Git commits and documentation | 30 min |

---

## Risk Assessment

### Low Risk
- ✅ HTML/CSS additions (non-breaking)
- ✅ New preset data file (isolated module)
- ✅ Dropdown event handling (standard pattern)

### Medium Risk
- ⚠️ Coordinate system conversion (needs careful testing)
- ⚠️ Preset overriding manual settings (user confusion possible)
- ⚠️ Power slider synchronization with preset

### High Risk
- 🔴 **Cue hit method changes** (affects all shots, not just presets)
  - Current implementation uses perpendicular spin
  - Test implementation uses aligned spin
  - Need to ensure backward compatibility

**Mitigation**:
- Test existing shots before/after changes
- Consider adding elevation check: only use new logic if `elevation > 0`
- Add feature flag or configuration option

---

## Future Enhancements

1. **Preset Import/Export**: Allow users to save custom presets
2. **Visual Trajectory Preview**: Show expected path before hitting
3. **Comparison Mode**: Side-by-side view of multiple presets
4. **Extended Preset Library**: Add 85°, 55°, 45° angle variations
5. **Preset Categories**: Group by angle, offset, or curve direction
6. **Hotkeys**: Assign keyboard shortcuts to presets (1-9, 0)
7. **Mobile Optimization**: Improve dropdown usability on touch devices

---

**Document End**

**Status**: 🔄 Ready to implement
**Next Step**: Create `piquepresets.ts` data file
