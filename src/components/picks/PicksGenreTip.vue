<script setup lang="ts">
import { computed } from "vue";
import {
  PICKS_JURIES,
  getGenreJuries,
  getPicksGenreLabel,
} from "@/config/picks";
import PicksTipCard from "./PicksTipCard.vue";

const props = defineProps<{ genre: string }>();

const juries = computed(() =>
  getGenreJuries(props.genre).map((jury) =>
    PICKS_JURIES.includes(jury) ? `${jury.label} jury` : jury.label,
  ),
);
</script>

<template>
  <PicksTipCard
    :title="getPicksGenreLabel(genre)"
    text="Besides the open juries, this genre puts the photo in front of:"
  >
    <ul class="pk-tip-list">
      <li v-for="name in juries" :key="name">{{ name }}</li>
    </ul>
  </PicksTipCard>
</template>

<style scoped>
.pk-tip-list {
  margin: 2px 0 0;
  padding-left: 16px;
}
</style>
