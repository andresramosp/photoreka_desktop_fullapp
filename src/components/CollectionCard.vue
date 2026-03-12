<template>
  <div class="action-card" @click="handleClick">
    <div class="card-preview">
      <!-- Series Preview: Sequential photos with numbers -->
      <div
        v-if="type === 'series' && item.photos && item.photos.length > 0"
        class="photo-sequence"
      >
        <div
          v-for="(photo, index) in item.photos.slice(0, 3)"
          :key="photo.id"
          class="sequence-photo"
          :class="`sequence-${index + 1}`"
        >
          <img
            :src="photo.thumbnailUrl || photo.url"
            :alt="photo.title || `Photo ${index + 1}`"
            class="photo-thumbnail"
            loading="lazy"
          />
          <span class="sequence-number">{{ index + 1 }}</span>
        </div>
      </div>

      <!-- Collection Preview: Stacked photos -->
      <div v-else-if="type === 'collection'" class="photo-stack">
        <div
          v-for="(photo, index) in (item.photos || []).slice(0, 3)"
          :key="photo.id"
          class="photo-item"
          :class="`photo-${index + 1}`"
        >
          <img
            :src="photo.thumbnailUrl || photo.url"
            :alt="photo.title || 'Photo'"
            class="photo-thumbnail"
            loading="lazy"
          />
        </div>
        <!-- Show empty placeholders if less than 3 photos -->
        <div
          v-for="index in Math.max(0, 3 - (item.photos || []).length)"
          :key="`placeholder-${index}`"
          class="photo-item"
          :class="`photo-${(item.photos || []).length + index}`"
        >
          <div class="photo-placeholder-empty"></div>
        </div>
      </div>

      <!-- Empty state for series -->
      <div v-else class="empty-preview">
        <n-icon size="40" color="var(--text-primary)">
          <ListOutline v-if="type === 'series'" />
          <ImagesOutline v-else />
        </n-icon>
      </div>
    </div>
    <div class="card-info">
      <h3 class="card-title">
        {{ item.name || item.title }}
      </h3>
      <p class="card-meta">
        {{ (item.photos || []).length }} photos •
        <span v-if="showUpdateDate"
          >Updated {{ formatDate(item.updatedAt) }}</span
        >
        <span v-else>Last updated {{ formatDate(item.updatedAt) }}</span>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ListOutline, ImagesOutline } from "@vicons/ionicons5";

interface Photo {
  id: string;
  thumbnailUrl?: string;
  url: string;
  title?: string;
}

interface Item {
  id: string;
  name?: string;
  title?: string;
  photos?: Photo[];
  updatedAt: Date | string;
  photoCount?: number;
}

interface Props {
  item: Item;
  type: "series" | "collection";
  showUpdateDate?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showUpdateDate: true,
});

const emit = defineEmits<{
  click: [item: Item];
}>();

const handleClick = () => {
  emit("click", props.item);
};

// Format date helper
const formatDate = (date: Date | string) => {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - dateObj.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    return "1 day ago";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 14) {
    return "1 week ago";
  } else if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} weeks ago`;
  } else if (diffDays < 60) {
    return "1 month ago";
  } else {
    return `${Math.floor(diffDays / 30)} months ago`;
  }
};
</script>

<style scoped>
.card-preview {
  position: relative;
  height: 120px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Series Preview: Sequential photos */
.photo-sequence {
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.sequence-photo {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border: 2px solid var(--border-color);
  background-color: var(--bg-container);
}

.sequence-photo:hover {
  transform: scale(1.05);
  border-color: var(--primary-color);
}

.sequence-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sequence-number {
  position: absolute;
  bottom: 4px;
  right: 4px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  font-size: 10px;
  font-weight: 600;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

/* Empty preview state */
.empty-preview {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-container);
  border-radius: 8px;
  border: 1px dashed var(--border-color);
}

.card-info {
  text-align: center;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 0 0 8px 0;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-meta {
  font-size: 14px;
  color: var(--text-primary);
  margin: 0;
  line-height: 1.4;
}

/* Mobile adjustments */
@media (max-width: 768px) {
  .card-preview {
    height: 100px;
    margin-bottom: 12px;
  }

  .sequence-photo {
    width: 60px;
    height: 60px;
  }

  .card-title {
    font-size: 16px;
  }

  .card-meta {
    font-size: 12px;
  }
}
</style>
