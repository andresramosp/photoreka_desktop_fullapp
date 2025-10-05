<template>
  <transition name="fade">
    <div v-if="show" class="touch-hints-overlay" @click="dismiss">
      <div class="touch-hints-container" @click.stop>
        <button class="close-btn" @click="dismiss">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        
        <h2 class="hints-title">Touch Controls</h2>
        
        <div class="hints-grid">
          <!-- One Finger Drag -->
          <div class="hint-item">
            <div class="hint-icon">
              <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                <circle cx="30" cy="30" r="8" fill="#4A9EFF" opacity="0.3"/>
                <circle cx="30" cy="30" r="5" fill="#4A9EFF"/>
                <path d="M30 30 L45 20" stroke="#4A9EFF" stroke-width="2" stroke-dasharray="4 2" opacity="0.6"/>
                <path d="M42 18 L45 20 L43 23" stroke="#4A9EFF" stroke-width="2"/>
              </svg>
            </div>
            <div class="hint-text">
              <strong>One Finger Drag</strong>
              <p>Rotate camera view</p>
            </div>
          </div>

          <!-- Two Finger Pinch -->
          <div class="hint-item">
            <div class="hint-icon">
              <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                <circle cx="20" cy="30" r="5" fill="#4A9EFF"/>
                <circle cx="40" cy="30" r="5" fill="#4A9EFF"/>
                <path d="M20 30 L30 30" stroke="#4A9EFF" stroke-width="2" stroke-dasharray="4 2" opacity="0.6"/>
                <path d="M40 30 L30 30" stroke="#4A9EFF" stroke-width="2" stroke-dasharray="4 2" opacity="0.6"/>
                <path d="M18 28 L20 30 L18 32" stroke="#4A9EFF" stroke-width="2"/>
                <path d="M42 28 L40 30 L42 32" stroke="#4A9EFF" stroke-width="2"/>
              </svg>
            </div>
            <div class="hint-text">
              <strong>Two Finger Pinch</strong>
              <p>Move forward/backward</p>
            </div>
          </div>

          <!-- Two Finger Drag -->
          <div class="hint-item">
            <div class="hint-icon">
              <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                <circle cx="25" cy="30" r="5" fill="#4A9EFF"/>
                <circle cx="35" cy="30" r="5" fill="#4A9EFF"/>
                <path d="M30 30 L30 15" stroke="#4A9EFF" stroke-width="2" stroke-dasharray="4 2" opacity="0.6"/>
                <path d="M28 17 L30 15 L32 17" stroke="#4A9EFF" stroke-width="2"/>
              </svg>
            </div>
            <div class="hint-text">
              <strong>Two Finger Drag</strong>
              <p>Move in any direction</p>
            </div>
          </div>
        </div>

        <div class="hints-footer">
          <label class="dont-show-again">
            <input type="checkbox" v-model="dontShowAgain" />
            Don't show again
          </label>
          <button class="got-it-btn" @click="dismiss">Got it!</button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';

const props = defineProps({
  autoShow: {
    type: Boolean,
    default: true,
  },
  storageKey: {
    type: String,
    default: 'touch-hints-dismissed',
  },
});

const emit = defineEmits(['dismiss']);

const show = ref(false);
const dontShowAgain = ref(false);

onMounted(() => {
  if (props.autoShow) {
    // Check if user has dismissed before
    const dismissed = localStorage.getItem(props.storageKey);
    if (!dismissed) {
      // Show hints after a short delay
      setTimeout(() => {
        show.value = true;
      }, 1000);
    }
  }
});

const dismiss = () => {
  show.value = false;
  
  if (dontShowAgain.value) {
    localStorage.setItem(props.storageKey, 'true');
  }
  
  emit('dismiss');
};

// Expose method to show hints manually
defineExpose({
  show: () => {
    show.value = true;
  },
  hide: dismiss,
});
</script>

<style scoped>
.touch-hints-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.touch-hints-container {
  background: linear-gradient(135deg, #1a1a1f 0%, #2d2d35 100%);
  border-radius: 16px;
  padding: 32px 24px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  position: relative;
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 8px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #fff;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.hints-title {
  font-size: 24px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 24px 0;
  text-align: center;
}

.hints-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-bottom: 24px;
}

.hint-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.2s ease;
}

.hint-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(74, 158, 255, 0.3);
  transform: translateX(4px);
}

.hint-icon {
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(74, 158, 255, 0.1);
  border-radius: 12px;
}

.hint-text {
  flex: 1;
}

.hint-text strong {
  display: block;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 4px;
}

.hint-text p {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  margin: 0;
}

.hints-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.dont-show-again {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  cursor: pointer;
  user-select: none;
}

.dont-show-again input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.got-it-btn {
  background: linear-gradient(135deg, #4A9EFF 0%, #357ABD 100%);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 24px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 12px rgba(74, 158, 255, 0.3);
}

.got-it-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(74, 158, 255, 0.4);
}

.got-it-btn:active {
  transform: translateY(0);
}

/* Fade transition */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive adjustments */
@media (max-width: 480px) {
  .touch-hints-container {
    padding: 24px 16px;
  }
  
  .hints-title {
    font-size: 20px;
  }
  
  .hint-item {
    gap: 12px;
    padding: 12px;
  }
  
  .hint-icon {
    width: 50px;
    height: 50px;
  }
  
  .hint-icon svg {
    width: 50px;
    height: 50px;
  }
  
  .hint-text strong {
    font-size: 14px;
  }
  
  .hint-text p {
    font-size: 12px;
  }
  
  .hints-footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }
  
  .got-it-btn {
    width: 100%;
  }
}
</style>
