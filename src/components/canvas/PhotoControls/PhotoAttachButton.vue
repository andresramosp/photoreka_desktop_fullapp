<template>
  <!-- The spotlight toggle. It stands in for the centre '+' while the chat is open (see
       CanvasView): the photo is either in canvas mode ('+' expands from it) or in chat mode
       (the spotlight makes it the finest level the chat is asked about). Shown on hover
       whether or not the photo is already spotlighted — clicking toggles it. The photo's
       persistent purple border, not a badge, is what marks the state without a hover. -->
  <v-group
    :config="{ x: actionX, y: actionY }"
    @click="handleClick"
    @tap="handleClick"
    @touchstart="handleTouchStart"
    @touchend="handleTouchEnd"
    @mouseover="handleMouseOver"
    @mouseout="handleMouseOut"
  >
    <v-circle
      :config="{
        radius: circleRadius,
        fill: fill,
        opacity: active ? 0.85 : 0.6,
      }"
    />
    <!-- The spotlight (ionicons `FlashlightOutline`), a beam of light aimed at the photo —
         three parts, drawn in the icon's own 512 box and scaled around its centre. -->
    <v-group
      :config="{
        offsetX: SPOT_CENTER,
        offsetY: SPOT_CENTER,
        scaleX: iconScale,
        scaleY: iconScale,
        listening: false,
      }"
    >
      <v-path
        :config="{
          data: SPOT_BODY,
          stroke: 'white',
          strokeWidth: 34,
          lineJoin: 'round',
          listening: false,
        }"
      />
      <v-path
        :config="{
          data: SPOT_BEAM,
          stroke: 'white',
          strokeWidth: 34,
          lineCap: 'round',
          listening: false,
        }"
      />
      <v-circle
        :config="{
          x: SPOT_SWITCH.x,
          y: SPOT_SWITCH.y,
          radius: SPOT_SWITCH.r,
          fill: 'white',
        }"
      />
    </v-group>
  </v-group>
</template>

<script setup>
import { computed } from "vue";

// ionicons5 `FlashlightOutline`, verbatim — the spotlight: a torch body, its beam, and the
// switch dot. Drawn in the icon's 512 box; the wrapping group centres it on SPOT_CENTER and
// scales it to the button.
const SPOT_BODY =
  "M456.64 162.86L349.12 55.36c-13.15-13.14-28.68-7.17-41.82 6l-11.95 12c-26.13 26.13-27.62 58.38-29.42 83.31c-.89 12.24-9.78 27.55-18.51 36.28L58.58 381.67c-16.35 16.33-12.69 39.42 3.73 55.84l12.17 12.17c16.36 16.35 39.43 20.16 55.86 3.74l188.83-188.8c8.74-8.74 24-17.55 36.29-18.52c24.87-1.86 58.62-4.85 83.26-29.49l11.94-11.94c13.15-13.14 19.12-28.67 5.98-41.81z";
const SPOT_BEAM = "M289 81l142 142";
const SPOT_SWITCH = { x: 224.68, y: 287.28, r: 20 };
/** Centre of the icon's 512 box — the group's pivot, so scaling keeps it centred. */
const SPOT_CENTER = 256;
/** The icon's bounding span in its own units; the scale is a share of the button from it. */
const SPOT_SPAN = 402;

const props = defineProps({
  photo: Object,
  fill: { type: String, default: "#2080f0" },
  /** The photo is spotlighted — the disc reads a touch more solid, so it looks "on". */
  active: { type: Boolean, default: false },
  sizeFactor: { type: Number, default: 1 },
});

// Same radius and centre as PhotoCenterButton (24 * sizeFactor), so swapping the '+' for the
// spotlight reads as one control changing icon, not a second button appearing.
const circleRadius = computed(() => 24 * props.sizeFactor);
const iconScale = computed(() => (circleRadius.value * 2 * 0.68) / SPOT_SPAN);
const actionX = computed(() => props.photo.config.width / 2);
const actionY = computed(() => props.photo.config.height / 2);

const emit = defineEmits(["click"]);

let touchHandled = false;

const handleClick = (e) => {
  e.cancelBubble = true;
  if (touchHandled) {
    touchHandled = false;
    return;
  }
  emit("click", { photo: props.photo, event: e });
};

const handleTouchStart = (e) => {
  e.cancelBubble = true;
  e.evt.preventDefault();
  touchHandled = true;
};

const handleTouchEnd = (e) => {
  e.cancelBubble = true;
  e.evt.preventDefault();
  setTimeout(() => {
    emit("click", { photo: props.photo, event: e });
    setTimeout(() => {
      touchHandled = false;
    }, 100);
  }, 10);
};

const handleMouseOver = (e) => {
  e.target.getStage().container().style.cursor = "pointer";
};

const handleMouseOut = (e) => {
  e.target.getStage().container().style.cursor = "default";
};
</script>
