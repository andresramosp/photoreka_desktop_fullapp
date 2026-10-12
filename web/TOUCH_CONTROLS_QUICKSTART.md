# Touch Controls - Quick Start Guide

## For Users

### Mobile Gestures

1. **Look Around**: Drag with one finger
2. **Move Forward/Back**: Pinch two fingers in/out
3. **Move Around**: Drag with two fingers in any direction
4. **Tips**: Combine gestures smoothly for best experience

### First Time Setup

- Hints will appear automatically on first visit
- Check "Don't show again" to hide them permanently
- Access hints anytime from the Navigation Controls menu

## For Developers

### Basic Usage

```javascript
import { useTouchControls } from "@/composables/3d-viewer/useTouchControls.js";

// Initialize
const touchControls = useTouchControls(camera, domElement);

// Setup (adds event listeners)
touchControls.setup();

// In animation loop
function animate() {
  touchControls.update();
  requestAnimationFrame(animate);
}

// Cleanup when done
touchControls.cleanup();
```

### Configuration

```javascript
// Speed profile (same as keyboard)
touchControls.setSpeedProfile({
  initial: 0.01, // Starting speed
  max: 45, // Max speed
  accelerateInSeconds: 12.5, // Acceleration time
});

// Rotation sensitivity
touchControls.setTouchSensitivity(0.0025);

// Movement scale
touchControls.setWorldScale(2);

// Enable/disable
touchControls.enable();
touchControls.disable();
```

### Integration Pattern

```vue
<template>
  <div ref="containerRef" class="viewer-container">
    <TresCanvas>
      <TresPerspectiveCamera ref="cameraRef" />
      <!-- Your 3D content -->
    </TresCanvas>

    <!-- Show hints on mobile -->
    <TouchControlsHints v-if="isMobile" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useTouchControls } from "@/composables/3d-viewer/useTouchControls.js";
import { useIsMobile } from "@/composables/useIsMobile.js";
import TouchControlsHints from "./TouchControlsHints.vue";

const { isMobile } = useIsMobile();
const containerRef = ref();
const cameraRef = ref();
const touchControls = ref(null);

onMounted(() => {
  if (isMobile.value) {
    touchControls.value = useTouchControls(cameraRef.value, containerRef.value);
    touchControls.value.setup();
  }
});

onUnmounted(() => {
  if (touchControls.value) {
    touchControls.value.cleanup();
  }
});

function animate() {
  if (touchControls.value) {
    touchControls.value.update();
  }
  requestAnimationFrame(animate);
}
</script>

<style scoped>
.viewer-container {
  touch-action: none; /* Important! */
  -webkit-user-select: none;
  user-select: none;
}
</style>
```

### CSS Requirements

**Critical:** Add these styles to your container:

```css
.container {
  touch-action: none; /* Disable browser gestures */
  -webkit-touch-callout: none; /* Disable callout on iOS */
  -webkit-user-select: none; /* Disable text selection */
  user-select: none;
}
```

### Device Detection

Use the existing `useIsMobile` composable:

```javascript
import { useIsMobile } from "@/composables/useIsMobile.js";

const { isMobile } = useIsMobile();

if (isMobile.value) {
  // Initialize touch controls
} else {
  // Initialize keyboard/mouse controls
}
```

## Testing

### Quick Test Checklist

1. **Rotation:**

   - [ ] Drag left/right rotates camera horizontally
   - [ ] Drag up/down rotates camera vertically
   - [ ] Pitch stops at ±90° (can't flip over)

2. **Pinch Zoom:**

   - [ ] Pinch out moves forward
   - [ ] Pinch in moves backward
   - [ ] Speed matches pinch velocity

3. **Two-Finger Movement:**

   - [ ] Drag left moves camera left
   - [ ] Drag right moves camera right
   - [ ] Drag up moves camera forward
   - [ ] Drag down moves camera backward

4. **Edge Cases:**
   - [ ] Three fingers doesn't break anything
   - [ ] Quick gesture switches work smoothly
   - [ ] No lag or stutter during movement

### Test Devices

- iPhone (Safari) - iOS 14+
- Android phone (Chrome) - Android 10+
- iPad (Safari)
- Android tablet

### Browser Console

Check for these logs:

```
📱 Touch controls initialized
📱 Touch controls enabled
🤏 Pinch gesture detected (on pinch)
✋ Two-finger drag detected (on drag)
```

## Troubleshooting

### Camera Not Rotating

**Problem:** One-finger drag doesn't rotate camera

**Solutions:**

1. Check CSS: `touch-action: none` applied?
2. Verify event listeners attached: Check console for "Touch controls initialized"
3. Check z-index: Another element blocking touch events?
4. Test on real device (not emulator)

### Pinch Not Working

**Problem:** Two-finger pinch doesn't move camera

**Solutions:**

1. Increase deadzone: `PINCH_DEADZONE` in useTouchControls.js
2. Check browser zoom: Disable in viewport meta tag
3. Test pinch magnitude: Log distance change in console
4. Verify not triggering drag: Check gesture detection order

### Movement Too Slow

**Problem:** Two-finger drag movement is sluggish

**Solutions:**

```javascript
// Increase max speed
touchControls.setSpeedProfile({ max: 80 });

// Increase world scale
touchControls.setWorldScale(3);

// Decrease acceleration time
touchControls.setSpeedProfile({ accelerateInSeconds: 8 });
```

### Gestures Feel Laggy

**Problem:** Input lag or stuttering

**Solutions:**

1. Check FPS: Should be 60fps
2. Reduce scene complexity
3. Enable GPU acceleration
4. Profile with Chrome DevTools
5. Check `passive: false` on listeners

## API Reference

### Methods

| Method                             | Parameters | Description                      |
| ---------------------------------- | ---------- | -------------------------------- |
| `setup()`                          | none       | Add event listeners              |
| `cleanup()`                        | none       | Remove event listeners           |
| `update()`                         | none       | Update camera (call every frame) |
| `enable()`                         | none       | Enable touch controls            |
| `disable()`                        | none       | Disable touch controls           |
| `setMoveSpeed(speed)`              | number     | Set max movement speed           |
| `setTouchSensitivity(sensitivity)` | number     | Set rotation sensitivity         |
| `setInitialSpeed(speed)`           | number     | Set starting speed               |
| `setAccelerationRate(rate)`        | number     | Set acceleration rate            |
| `setWorldScale(scale)`             | number     | Set overall movement scale       |
| `setSpeedProfile(profile)`         | object     | Set speed configuration          |
| `setCameraPosition(x, y, z)`       | numbers    | Set camera position              |
| `setCameraRotation(yaw, pitch)`    | numbers    | Set camera rotation              |
| `resetSpeeds()`                    | none       | Reset all movement speeds        |

### Reactive State

```javascript
const {
  touchState, // Touch gesture state
  simulatedKeys, // Virtual key presses
  enabled, // Controls enabled flag
  moveSpeed, // Current max speed
  currentSpeeds, // Speed per direction
} = touchControls;
```

## Performance Tips

1. **Optimize Animation Loop:**

```javascript
let lastTime = 0;
function animate(currentTime) {
  // Throttle updates if needed
  if (currentTime - lastTime < 16) {
    requestAnimationFrame(animate);
    return;
  }
  lastTime = currentTime;

  touchControls.update();
  requestAnimationFrame(animate);
}
```

2. **Reduce Draw Calls:**

- Use LOD (Level of Detail) for distant objects
- Frustum culling for off-screen objects
- Batch geometry when possible

3. **Monitor Performance:**

```javascript
const stats = new Stats();
document.body.appendChild(stats.dom);

function animate() {
  stats.begin();
  touchControls.update();
  renderer.render(scene, camera);
  stats.end();
  requestAnimationFrame(animate);
}
```

## Common Patterns

### Dual Controls (Desktop + Mobile)

```javascript
const desktopControls = ref(null);
const touchControls = ref(null);

onMounted(() => {
  if (isMobile.value) {
    touchControls.value = useTouchControls(camera, element);
    touchControls.value.setup();
  } else {
    desktopControls.value = useFirstPersonControls(camera, element);
    desktopControls.value.setup();
  }
});

function animate() {
  if (isMobile.value) {
    touchControls.value?.update();
  } else {
    desktopControls.value?.update();
  }
  requestAnimationFrame(animate);
}
```

### Conditional Activation

```javascript
const isLoading = ref(true);

watch(isLoading, (loading) => {
  if (loading) {
    touchControls.value?.disable();
  } else {
    touchControls.value?.enable();
  }
});
```

### Custom Speed Profiles

```javascript
// Slow explorer mode
touchControls.setSpeedProfile({
  initial: 0.5,
  max: 20,
  accelerateInSeconds: 15,
});

// Fast racing mode
touchControls.setSpeedProfile({
  initial: 5,
  max: 100,
  accelerateInSeconds: 5,
});
```

## Resources

- 📖 Full Documentation: `src/composables/3d-viewer/TOUCH_CONTROLS.md`
- 📋 Implementation Summary: `TOUCH_CONTROLS_SUMMARY.md`
- 💻 Source Code: `src/composables/3d-viewer/useTouchControls.js`
- 🎨 Hints Component: `src/components/TouchControlsHints.vue`
- 🔧 Integration Example: `src/components/Photos3D.vue`

## Support

Need help? Check these resources:

1. Console logs (look for 📱 emoji)
2. Browser DevTools touch simulation
3. Test on real device
4. Check CSS touch-action
5. Verify GPU acceleration

---

**Quick Links:**

- [GitHub Issues](link-to-issues)
- [Three.js Docs](https://threejs.org/docs/)
- [Touch Events MDN](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events)
