# Keyboard Shortcuts

This document lists all keyboard shortcuts available in the billiards game.

## Aiming Mode

### Cue Rotation
- **Arrow Left** - Rotate cue counterclockwise
- **Arrow Right** - Rotate cue clockwise
- **Mouse/Touch Drag (Horizontal)** - Rotate cue (2x speed)

### Spin Control
- **Arrow Up** - Increase vertical spin (hit higher on ball)
- **Arrow Down** - Decrease vertical spin (hit lower on ball)
- **Shift + Arrow Left** - Increase horizontal spin (right side)
- **Shift + Arrow Right** - Decrease horizontal spin (left side)

### Power Control
- **Space** (Hold) - Charge power
- **Space** (Release) - Take the shot
- **Mouse Wheel** - Adjust power up/down
- **Power Slider** - Adjust power with vertical slider

### Camera Controls
- **O** - Toggle camera mode (top view / 3D view)
- **Numpad +** - Lower camera height
- **Numpad -** - Raise camera height
- **Mouse/Touch Drag (Vertical)** - Adjust camera height

### Helper & Visualization
- **H** - Toggle helper line (aiming guide)
- **D** - Toggle debug mode (shows physics constants panel, ball traces, and spin axis arrows)

### Other Controls
- **F** - Toggle fullscreen mode
- **P** - Export scene as GLTF (for debugging/development)

## Place Ball Mode

When placing the cue ball (after a foul or at the start):

### Ball Movement
- **Arrow Left** - Move ball right
- **Arrow Right** - Move ball left
- **I** - Move ball forward
- **K** - Move ball backward
- **J** - Move ball left
- **L** - Move ball right
- **Mouse/Touch Drag** - Move ball in 2D

### Confirm Placement
- **Space** - Confirm ball placement and enter aiming mode

## Touch/Mouse Controls

### 3D View Canvas
- **Single Tap/Click** - Adjust spin on the cue ball (2D panel)
- **Double Click** - Take the shot (equivalent to Space release)
- **Drag** - Rotate cue (horizontal) or adjust camera height (vertical)
- **Drag on Top Half or Ctrl+Drag** - Half-speed rotation (for precision)

### Power Slider
- **Click/Drag** - Adjust shot power

### 2D Cue Ball Panel
- **Click/Drag** - Set spin position (English/side spin)
- **In Massé Mode** - Extended hit area (0.8 radius vs 0.3 normal)

## UI Buttons

### Menu Buttons
- **🎥 Camera** - Toggle camera mode
- **↻ Replay** - Replay current break
- **⎌ Retry** - Retry from break position
- **⬀ Share** - Share current game/shot
- **🎯 Target** - Toggle trajectory prediction (3-cushion mode)
- **🌀 Massé** - Toggle massé mode (steep angle shots)

### Massé Mode
When massé mode is active:
- **Massé Preset Dropdown** - Select preset angles:
  - 85° - Near vertical shot
  - 75° - Steep angle shot
  - 65° - Medium massé shot
  - 45° - Shallow massé shot
  - 0° - Horizontal shot
  - Each angle has Left (⬅) and Right (➡) spin variants

## Replay Mode

When replaying a break or watching a replay:

### Automatic Features
- **Ball Traces** - Automatically enabled (shows path of ball movement)
- **Spin Visualization** - Enabled on break events (shows spin axis arrows on balls)
- **Top View Camera** - Automatically switches to top view for better visualization

### Available Controls
- All camera controls (O, Numpad +/-, etc.) work during replay
- **D** - Toggle debug panel to adjust physics constants
- **H** - Toggle helper visualization

## Debug Mode Features (D Key)

When debug mode is activated with the **D** key, the following features are enabled:

### Physics Constants Panel
Adjustable sliders for physics simulation parameters:
- **R** - Ball radius
- **m** - Ball mass
- **e** - Coefficient of restitution (bounce)
- **mu** - Rolling friction coefficient
- **muS** - Sliding friction coefficient
- **muC** - Cushion friction coefficient
- **rho** - Air density (drag)
- **μs** - Spin friction coefficient
- **μw** - Wall friction coefficient
- **ee** - Energy efficiency

### Ball Traces
- Shows the path each ball has traveled
- Lines are drawn from ball starting position to current position
- Automatically reset when a new shot is taken
- Useful for analyzing shot outcomes and ball paths

### Spin Axis Visualization
- 3D arrows displayed on each ball showing the current spin axis
- Arrow direction indicates rotation axis
- Helps understand how spin affects ball motion
- Updates in real-time as balls move and spin changes

## Notes

- **Control Key** - Slows down all timed inputs to 1/3 speed for precision
- **Shift Key** - Modifies arrow keys for horizontal spin control
- **Mobile Devices** - Touch gestures replace mouse/keyboard controls
- **Canvas Focus** - Keyboard shortcuts only work when the game canvas has focus
- **Debug Mode** - Debug features (D key) are development tools and may impact performance

## Technical Details

### Key Event Processing
- Keys are processed through the `Keyboard` class
- Events include elapsed time for smooth, rate-independent controls
- Most controls scale with time held (continuous actions)
- Some keys trigger on release (KeyUp) for single actions

### Mouse/Touch Scaling
- Top half of screen or Ctrl+drag: 0.5x speed
- Bottom half: 1.0x speed
- Horizontal drag: 0.8x speed (vertical movement)
- Gesture pinch: 0.33x speed

### Massé Mode Effects
- Increases off-center hit limit from 0.3 to 0.8
- Enables Magnus effect for ball trajectory
- Allows cue elevation angle adjustment
- Expands 2D hit area visualization
