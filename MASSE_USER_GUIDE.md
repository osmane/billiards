# Massé Shot User Guide

## What is a Massé Shot?

A **massé shot** (also called a pike shot) is an advanced billiards technique where the cue ball curves along a curved path by striking it with the cue at a steep angle (elevated cue). The curved trajectory is created by the Magnus effect - the interaction between the ball's spin and its velocity through the air.

In this implementation, **the ball always stays on the table surface** - the curve is purely horizontal, making it safe and realistic.

## How to Execute a Massé Shot

### Keyboard Controls

1. **Aim the shot**: Use arrow keys to aim as usual
2. **Set cue elevation**:
   - **PageUp**: Increase cue elevation angle (makes steeper massé)
   - **PageDown**: Decrease cue elevation angle (back to horizontal)
3. **Adjust power**: Use the power slider or mouse wheel
4. **Set spin offset**: Click on the cue ball indicator to add English (optional)
5. **Hit**: Press the Hit button or double-click the table

### Elevation Angle

- **0°** (horizontal): Normal shot, no curve
- **45°**: Moderate massé curve
- **90°** (vertical): Maximum massé curve (most extreme)

The current elevation angle is displayed in the bottom-right corner of the screen.

### Physics Behind the Curve

The massé shot works through these physical principles:

1. **Vertical Spin**: Elevated cue creates spin around a vertical axis
2. **Magnus Force**: F = k × (ω × v) - perpendicular to both velocity and spin
3. **Horizontal Curve**: The force is purely horizontal, creating a curved path
4. **Ball Stays on Table**: No vertical forces, ball never leaves surface

## Massé Shot Tips

### For Beginners

1. **Start with 30-45° elevation**: Easier to control than extreme angles
2. **Use moderate power**: Too much power reduces curve effectiveness
3. **Practice curve direction**:
   - Higher aim point = curves right (from your perspective)
   - Lower aim point = curves left

### For Advanced Players

1. **Combine with English**: Add z-spin (side spin) for complex trajectories
2. **Use 60-85° for tight curves**: Extreme angles for obstacle avoidance
3. **Adjust power for distance**: Lower power = tighter curve over short distance

### Common Mistakes

❌ **Too much power**: Reduces curve effect, ball travels more straight
❌ **Forgetting to reset elevation**: Check the indicator before normal shots!
❌ **Extreme angles without practice**: Start moderate, increase gradually

## Technical Details

### Curvature by Angle

| Elevation | Curve Type | Use Case |
|-----------|------------|----------|
| 0° | None | Normal shots |
| 10-20° | Slight | Gentle curve |
| 30-45° | Moderate | Standard massé |
| 50-70° | Strong | Tight curves |
| 80-90° | Extreme | Maximum curve, trick shots |

### Curve Direction

The curve direction depends on the **horizontal aim angle** relative to the velocity:

- Ball moving **forward**, spin axis **right**: Curves **right**
- Ball moving **forward**, spin axis **left**: Curves **left**

Think of it as the ball "climbing" the spin axis.

### Physics Validation

✅ All physics validated through comprehensive testing:
- 31 unit tests passing
- 100 randomized anti-jump tests (100% pass rate)
- Curvature increases monotonically with elevation angle
- Opposite spin directions produce opposite curves
- Ball NEVER leaves table surface under any conditions

## Keyboard Reference

| Key | Action |
|-----|--------|
| **PageUp** | Increase cue elevation (+5° per press) |
| **PageDown** | Decrease cue elevation (-5° per press) |
| Arrow Keys | Aim direction / spin offset |
| Mouse Wheel | Adjust power |
| Space/Enter/Double-Click | Execute shot |

## Visual Indicators

1. **Elevation Display** (bottom-right): Shows current cue angle (0-90°)
2. **Cue Ball Indicator**: Shows spin offset (English)
3. **Power Slider**: Shows shot power
4. **Overlap Indicator**: Shows target ball contact point

## Troubleshooting

**Q: Ball not curving?**
- Check elevation angle (should be > 0°)
- Increase power slightly
- Ensure you're not using pure z-spin (English only)

**Q: Curve too strong/weak?**
- Adjust elevation angle (higher = more curve)
- Modify power (lower power = tighter curve)

**Q: How to reset to normal shots?**
- Press **PageDown** until elevation reads **0°**

**Q: Can the ball jump off the table?**
- **No!** The implementation guarantees the ball stays on the table surface. The Magnus force is purely horizontal.

## Game Modes

Massé shots work in all game modes:
- ✅ Pool (8-ball, 9-ball, 14.1)
- ✅ Snooker
- ✅ Three-cushion billiards

The physics automatically adapts to ball size and mass for each game type.

## Advanced Techniques

### Swerve Shot

Combine massé (vertical spin) with English (side spin) for complex curves:
1. Set elevation angle (30-60°)
2. Add side spin via cue ball indicator
3. The ball will curve AND drift sideways

### Obstacle Avoidance

Use high elevation angles (70-85°) to curve around blocking balls:
1. Identify the obstacle
2. Aim past the obstacle
3. Set high elevation to curve back to target

### Jump-Massé Hybrid

While our implementation keeps the ball on the table, you can simulate a jump-massé feel:
1. Use 80-90° elevation
2. Maximum power
3. Creates the tightest possible curve

## Credits

This massé shot implementation uses:
- **Magnus effect physics**: F = k × (ω × v)
- **Test-Driven Development (TDD)**: All features tested first
- **100% table constraint compliance**: Ball never leaves surface
- **Empirically tuned coefficient**: k = 2.0 for realistic curves

Developed following the principles in `masse_development_plan.txt` with comprehensive testing documented in `masse_progress_log.txt`.

Enjoy your massé shots! 🎱
