# Touch Controls for 3D Photo Viewer

## Overview

The touch controls provide an intuitive mobile navigation experience for the 3D photo viewer that closely mirrors the desktop keyboard/mouse controls.

## Gesture Mapping

### Desktop Controls → Touch Equivalents

| Desktop Control                | Touch Gesture        | Description                                     |
| ------------------------------ | -------------------- | ----------------------------------------------- |
| Mouse drag (with pointer lock) | **One finger drag**  | Rotate camera view (yaw and pitch)              |
| Mouse wheel scroll             | **Two finger pinch** | Move forward/backward in space                  |
| WASD keys                      | **Two finger drag**  | Move left/right/forward/backward                |
| F/V keys                       | N/A                  | Up/down movement (not commonly needed in touch) |
| Click to activate              | Automatic            | Touch controls are always active                |

## Detailed Gesture Guide

### 1. One Finger Drag - Camera Rotation

**Purpose:** Look around the 3D space

- **How to use:** Touch and drag with one finger anywhere on the screen
- **Effect:** Rotates the camera view (yaw and pitch)
- **Sensitivity:** Matches mouse sensitivity (0.003 by default)
- **Pitch limit:** Restricted to ±90° to prevent camera flipping
- **Deadzone:** 3 pixels to prevent accidental rotation

```javascript
// Technical details
touchState.value.yaw -= deltaX * touchState.value.sensitivity;
touchState.value.pitch -= deltaY * touchState.value.sensitivity;
```

### 2. Two Finger Pinch - Forward/Backward Movement

**Purpose:** Move closer to or farther from photos (zoom in/out)

- **How to use:** Place two fingers on screen and pinch together (zoom out) or spread apart (zoom in)
- **Effect:** Moves camera along its forward direction vector
- **Speed:** Proportional to pinch speed, amplified 2x for better control
- **Deadzone:** 10 pixels to distinguish from two-finger drag
- **Equivalent to:** Mouse wheel scroll

```javascript
// Movement calculation
const pinchDelta = distanceChange / lastTouchDistance;
const pinchSpeed = pinchDelta * moveSpeed.value * 2;
camera.position.addScaledVector(direction, pinchSpeed);
```

### 3. Two Finger Drag - Directional Movement

**Purpose:** Move in any direction (WASD equivalent)

- **How to use:** Place two fingers on screen and drag in desired direction
- **Effect:** Simulates keyboard direction keys based on drag direction
- **Movement threshold:** 0.3 units (scaled from pixels)
- **Deadzone:** 5 pixels to distinguish from pinch
- **Acceleration:** Progressive speed increase (same as keyboard)

**Direction mapping:**

- Drag **left** → Move left (like 'A' key)
- Drag **right** → Move right (like 'D' key)
- Drag **up** → Move forward (like 'W' key)
- Drag **down** → Move backward (like 'S' key)

```javascript
// Simulated key activation
if (deltaX > threshold) simulatedKeys.value.right = true;
if (deltaY < 0) simulatedKeys.value.forward = true;
```

## Implementation Architecture

### Core Components

1. **Touch State Tracking**

   - `Map<touchId, touchData>` tracks all active touches
   - Stores initial position, current position, and start time
   - Updates on every touch move event

2. **Gesture Detection**

   - **One finger:** Activate rotation mode
   - **Two fingers:** Detect pinch vs drag based on deadzone thresholds
   - **Gesture priority:** First gesture to cross deadzone threshold wins

3. **Movement Simulation**

   - Two-finger drag creates "simulated keys" (forward, backward, left, right)
   - These keys feed into the same acceleration system as keyboard controls
   - Ensures consistent movement feel between desktop and mobile

4. **Progressive Acceleration**
   - Same acceleration curve as keyboard controls
   - Starts at `initialSpeed` (0.01 units/sec)
   - Accelerates to `maxSpeed` (45 units/sec)
   - Smooth easing over `accelerateSeconds` (12.5 sec)

```javascript
// Acceleration logic (same as keyboard)
const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const ratio = Math.min(1, holdTimes[dir] / accelerateSeconds.value);
const easedTarget = initSpeed + (maxSpeed - initSpeed) * easeOutCubic(ratio);
```

### Event Flow

```
Touch Start → Store touch data → Determine touch count
     ↓
Touch Move → Calculate deltas → Detect gesture type
     ↓
Execute:
  - 1 finger → Rotate camera
  - 2 fingers (pinch) → Move forward/back
  - 2 fingers (drag) → Simulate WASD keys
     ↓
Touch End → Reset gesture states → Clear simulated keys
```

## Configuration

### Speed Profile

```javascript
touchControls.value.setSpeedProfile({
  initial: 0.01, // Starting speed
  max: 45, // Maximum speed
  accelerateInSeconds: 12.5, // Time to reach max
});
```

### Sensitivity

```javascript
// Rotation sensitivity (0.003 = same as mouse)
touchControls.value.setTouchSensitivity(0.0025);
```

### World Scale

```javascript
// Overall movement scale multiplier
touchControls.value.setWorldScale(2);
```

## Performance Optimizations

1. **Passive: false** - Prevents default touch behavior for smooth control
2. **Touch-action: none** - Disables browser touch gestures (zoom, scroll)
3. **Deadzone thresholds** - Prevents accidental gesture activation
4. **Gesture priority** - Only one gesture type active at a time
5. **Minimal reflows** - Updates only camera position/rotation (no DOM changes)

## Browser Compatibility

- **iOS Safari:** ✅ Full support
- **Chrome Mobile:** ✅ Full support
- **Firefox Mobile:** ✅ Full support
- **Samsung Internet:** ✅ Full support

**Requirements:**

- Touch Events API (supported by all modern mobile browsers)
- WebGL (required for 3D rendering anyway)

## Usage Example

```javascript
import { useTouchControls } from "@/composables/3d-viewer/useTouchControls.js";

// Initialize
const touchControls = useTouchControls(camera, domElement);

// Setup (add event listeners)
touchControls.setup();

// Update loop (call every frame)
function animate() {
  touchControls.update();
  requestAnimationFrame(animate);
}

// Cleanup (remove event listeners)
touchControls.cleanup();
```

## Comparison with Keyboard Controls

| Feature           | Keyboard/Mouse            | Touch                   |
| ----------------- | ------------------------- | ----------------------- |
| Camera rotation   | Mouse drag (pointer lock) | One finger drag         |
| Movement speed    | WASD keys                 | Two finger drag         |
| Zoom in/out       | Mouse wheel               | Two finger pinch        |
| Activation        | Click stage               | Always active           |
| Speed control     | Wheel scroll              | Pinch speed             |
| Acceleration      | Progressive (hold key)    | Progressive (hold drag) |
| Multi-directional | Multiple keys             | Drag direction          |

## Tips for Users

1. **Look around:** Use one finger to explore the space
2. **Get closer:** Pinch out (spread fingers) to move forward
3. **Navigate:** Use two fingers to move in any direction
4. **Combine gestures:** Rotate while moving for smooth navigation
5. **Be gentle:** Small movements provide fine control

## Troubleshooting

### Camera not rotating

- Check that touch events are not blocked by other UI elements
- Verify `touch-action: none` is applied to container

### Movement feels slow

- Increase `maxSpeed` configuration
- Increase `worldScale` multiplier
- Decrease `accelerateInSeconds` for faster acceleration

### Gestures feel laggy

- Ensure `passive: false` on touch listeners
- Check for performance bottlenecks in main animation loop
- Verify GPU acceleration is enabled

### Pinch not working

- Increase two-finger drag deadzone
- Check for conflicts with browser zoom gestures
- Verify touch events are reaching the handler

## Future Enhancements

- [ ] Three-finger tap to reset camera position
- [ ] Four-finger swipe for quick teleport
- [ ] Haptic feedback on gesture start/end (iOS)
- [ ] Configurable gesture sensitivity per user
- [ ] Custom gesture recording/playback
- [ ] Gyroscope integration for tilt controls
