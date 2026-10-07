<script setup lang="ts">
import photo1 from "@/assets/picks/showcase/1.jpg";
import photo2 from "@/assets/picks/showcase/2.jpg";
import photo3 from "@/assets/picks/showcase/3.jpg";
import photo5 from "@/assets/picks/showcase/5.jpg";
import photo6 from "@/assets/picks/showcase/6.jpg";
import photo7 from "@/assets/picks/showcase/7.jpg";

// Sample street photos (the same ones the landing shows) scattered on both
// sides of the hero. Farther cards are smaller, dimmer and more blurred, so
// they read as atmosphere and never compete with the drop zone.
interface ShowcaseCard {
  src: string;
  side: "left" | "right";
  x: string;
  y: string;
  width: string;
  ratio: string;
  rot: number;
  depth: number;
}

const cards: ShowcaseCard[] = [
  { src: photo1, side: "left", x: "5vw", y: "9%", width: "clamp(140px, 13vw, 230px)", ratio: "4 / 5", rot: -7, depth: 0 },
  { src: photo3, side: "left", x: "13vw", y: "44%", width: "clamp(110px, 10vw, 180px)", ratio: "3 / 2", rot: 5, depth: 1 },
  { src: photo6, side: "left", x: "3vw", y: "70%", width: "clamp(100px, 9vw, 160px)", ratio: "4 / 5", rot: -3, depth: 2 },
  { src: photo2, side: "right", x: "6vw", y: "14%", width: "clamp(130px, 12vw, 210px)", ratio: "3 / 4", rot: 6, depth: 0 },
  { src: photo7, side: "right", x: "12vw", y: "50%", width: "clamp(110px, 10vw, 180px)", ratio: "4 / 5", rot: -5, depth: 2 },
  { src: photo5, side: "right", x: "2vw", y: "68%", width: "clamp(110px, 10vw, 175px)", ratio: "3 / 2", rot: 3, depth: 1 },
];

const DEPTH_STYLE = [
  { opacity: 0.78, blur: 0 },
  { opacity: 0.55, blur: 1.5 },
  { opacity: 0.4, blur: 2.5 },
];

const cardStyle = (card: ShowcaseCard, i: number) => ({
  [card.side]: card.x,
  top: card.y,
  width: card.width,
  aspectRatio: card.ratio,
  "--rot": `${card.rot}deg`,
  "--o": String(DEPTH_STYLE[card.depth].opacity),
  "--blur": `${DEPTH_STYLE[card.depth].blur}px`,
  "--float": `${11 + i * 2.3}s`,
  "--d": `${300 + i * 110}ms`,
});
</script>

<template>
  <div class="pk-showcase" aria-hidden="true">
    <div v-for="(card, i) in cards" :key="card.src" class="pk-showcase-card" :style="cardStyle(card, i)">
      <img :src="card.src" alt="" decoding="async" />
    </div>
  </div>
</template>

<style scoped>
.pk-showcase {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 100vw;
  transform: translateX(-50%);
  z-index: -1;
  pointer-events: none;
  /* Cards fade out towards the center, where the copy and the drop zone live. */
  -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 18%, transparent 36%, transparent 64%, #000 82%, #000 100%);
  mask-image: linear-gradient(90deg, #000 0%, #000 18%, transparent 36%, transparent 64%, #000 82%, #000 100%);
}

.pk-showcase-card {
  position: absolute;
  border-radius: 14px;
  overflow: hidden;
  background: #111117;
  opacity: var(--o);
  filter: blur(var(--blur)) saturate(0.95);
  rotate: var(--rot);
  box-shadow:
    0 30px 70px -24px rgba(0, 0, 0, 0.9),
    0 0 0 1px rgba(255, 255, 255, 0.07);
  animation:
    pk-showcase-in 1.4s var(--pk-ease) var(--d) backwards,
    pk-showcase-float var(--float) ease-in-out var(--d) infinite alternate;
}

.pk-showcase-card::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(7, 7, 10, 0), rgba(7, 7, 10, 0.35));
}

.pk-showcase-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

@keyframes pk-showcase-in {
  from {
    opacity: 0;
    transform: translateY(30px);
    filter: blur(14px);
  }
}

@keyframes pk-showcase-float {
  to {
    translate: 0 -14px;
  }
}

@media (max-width: 1100px) {
  .pk-showcase {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pk-showcase-card {
    animation: none;
  }
}
</style>
