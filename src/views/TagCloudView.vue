<template>
  <div class="tag-cloud-view">
    <TagCloud
      ref="tagCloudRef"
      class="tag-cloud-component"
      @tags-selected="onTagsSelected"
    />
    <TagSearchToolbar :selected-tags="selectedTags" @close="onToolbarClose" />
  </div>
</template>

<script setup>
import { ref } from "vue";
import TagCloud from "@/components/tag-cloud/TagCloud.vue";
import TagSearchToolbar from "@/components/tag-cloud/TagSearchToolbar.vue";

const tagCloudRef = ref(null);
const selectedTags = ref([]);

const onTagsSelected = (tags) => {
  // Replace selection on each interaction (single click or rect drag)
  selectedTags.value = Array.isArray(tags) ? tags : [];
};

const onToolbarClose = () => {
  selectedTags.value = [];
  tagCloudRef.value?.clearSelection();
};
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
