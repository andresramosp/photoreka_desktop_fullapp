<template>
  <div class="tag-cloud-view">
    <TagCloud class="tag-cloud-component" />
  </div>
</template>

<script setup>
import TagCloud from "@/components/tag-cloud/TagCloud.vue";
</script>

<style scoped>
.tag-cloud-view {
  width: 100%;
  height: 100vh;
  position: relative;
}

.tag-cloud-component {
  width: 100%;
  height: 100%;
}
</style>
