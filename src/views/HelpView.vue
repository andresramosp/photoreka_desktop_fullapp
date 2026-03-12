<template>
  <div class="help-view view-container">
    <div class="help-container">
      <!-- Header -->
      <div class="help-header">
        <h1 class="help-title">Help Center</h1>
        <p class="help-subtitle">
          Find answers and learn how to get the most out of Photoreka
        </p>
      </div>

      <!-- Search Bar -->
      <div class="help-search">
        <n-input
          v-model:value="searchQuery"
          placeholder="Search for help topics..."
          clearable
          size="large"
        >
          <template #prefix>
            <n-icon size="20" color="var(--text-secondary)">
              <SearchOutline />
            </n-icon>
          </template>
        </n-input>
      </div>

      <div class="help-content">
        <!-- Topics Sidebar -->
        <aside class="help-sidebar">
          <nav class="topics-nav">
            <div
              v-for="topic in filteredTopics"
              :key="topic.id"
              class="topic-nav-item"
              :class="{ active: selectedTopic?.id === topic.id }"
              @click="selectTopic(topic)"
            >
              <n-icon
                size="20"
                :color="
                  selectedTopic?.id === topic.id
                    ? 'var(--primary-color)'
                    : 'var(--text-secondary)'
                "
              >
                <component :is="getTopicIcon(topic.icon)" />
              </n-icon>
              <span class="topic-nav-title">{{ topic.title }}</span>
              <n-icon
                size="16"
                class="chevron-icon"
                color="var(--text-tertiary)"
              >
                <ChevronForwardOutline />
              </n-icon>
            </div>
          </nav>
        </aside>

        <!-- Main Content Area -->
        <main class="help-main">
          <!-- No topic selected -->
          <div v-if="!selectedTopic && !searchQuery" class="help-welcome">
            <div class="welcome-grid">
              <div
                v-for="topic in helpData.topics.slice(0, 6)"
                :key="topic.id"
                class="welcome-card"
                @click="selectTopic(topic)"
              >
                <div class="welcome-card-icon">
                  <n-icon size="32" color="var(--primary-color)">
                    <component :is="getTopicIcon(topic.icon)" />
                  </n-icon>
                </div>
                <h3 class="welcome-card-title">{{ topic.title }}</h3>
                <p class="welcome-card-desc">{{ topic.description }}</p>
              </div>
            </div>

            <!-- More Topics -->
            <div v-if="helpData.topics.length > 6" class="more-topics">
              <h3 class="more-topics-title">More Topics</h3>
              <div class="more-topics-grid">
                <div
                  v-for="topic in helpData.topics.slice(6)"
                  :key="topic.id"
                  class="more-topic-item"
                  @click="selectTopic(topic)"
                >
                  <n-icon size="18" color="var(--primary-color)">
                    <component :is="getTopicIcon(topic.icon)" />
                  </n-icon>
                  <span>{{ topic.title }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Search Results -->
          <div v-else-if="searchQuery && !selectedTopic" class="search-results">
            <h2 class="results-title">
              Search Results
              <span class="results-count"
                >({{ searchResults.length }} found)</span
              >
            </h2>

            <div v-if="searchResults.length === 0" class="no-results">
              <n-icon size="48" color="var(--text-tertiary)">
                <SearchOutline />
              </n-icon>
              <p>No results found for "{{ searchQuery }}"</p>
              <n-button text type="primary" @click="searchQuery = ''">
                Clear search
              </n-button>
            </div>

            <div v-else class="results-list">
              <div
                v-for="result in searchResults"
                :key="`${result.topic.id}-${result.subtopic.id}`"
                class="result-item"
                @click="selectFromSearch(result)"
              >
                <div class="result-header">
                  <n-icon size="18" color="var(--primary-color)">
                    <component :is="getTopicIcon(result.topic.icon)" />
                  </n-icon>
                  <span class="result-topic">{{ result.topic.title }}</span>
                  <n-icon size="14" color="var(--text-tertiary)">
                    <ChevronForwardOutline />
                  </n-icon>
                  <span class="result-subtopic">{{
                    result.subtopic.title
                  }}</span>
                </div>
                <p class="result-preview">
                  {{ getContentPreview(result.subtopic.content) }}
                </p>
              </div>
            </div>
          </div>

          <!-- Topic Detail -->
          <div v-else-if="selectedTopic" class="topic-detail">
            <!-- Topic Header -->
            <div class="topic-header">
              <n-button text class="back-button" @click="goBack">
                <template #icon>
                  <n-icon size="18">
                    <ArrowBackOutline />
                  </n-icon>
                </template>
                Back
              </n-button>
              <div class="topic-title-row">
                <n-icon size="28" color="var(--primary-color)">
                  <component :is="getTopicIcon(selectedTopic.icon)" />
                </n-icon>
                <h2 class="topic-title">{{ selectedTopic.title }}</h2>
              </div>
              <p class="topic-description">{{ selectedTopic.description }}</p>
            </div>

            <!-- Subtopics List or Detail -->
            <div v-if="!selectedSubtopic" class="subtopics-list">
              <div
                v-for="subtopic in selectedTopic.subtopics"
                :key="subtopic.id"
                class="subtopic-card"
                @click="selectSubtopic(subtopic)"
              >
                <div class="subtopic-info">
                  <h3 class="subtopic-title">{{ subtopic.title }}</h3>
                  <p class="subtopic-preview">
                    {{ getContentPreview(subtopic.content, 100) }}
                  </p>
                </div>
                <n-icon size="20" color="var(--text-tertiary)">
                  <ChevronForwardOutline />
                </n-icon>
              </div>
            </div>

            <!-- Subtopic Detail -->
            <div v-else class="subtopic-detail">
              <n-button
                text
                class="back-to-topic"
                @click="selectedSubtopic = null"
              >
                <template #icon>
                  <n-icon size="16">
                    <ArrowBackOutline />
                  </n-icon>
                </template>
                Back to {{ selectedTopic.title }}
              </n-button>

              <article class="article-content">
                <h3 class="article-title">{{ selectedSubtopic.title }}</h3>

                <!-- Image if exists -->
                <div v-if="selectedSubtopic.image" class="article-image">
                  <img
                    :src="selectedSubtopic.image"
                    :alt="selectedSubtopic.title"
                  />
                </div>

                <!-- Content rendered as markdown-like -->
                <div
                  class="article-body"
                  v-html="renderContent(selectedSubtopic.content)"
                ></div>

                <!-- Link if exists -->
                <div v-if="selectedSubtopic.link" class="article-link">
                  <router-link
                    :to="selectedSubtopic.link.route"
                    class="link-button"
                  >
                    {{ selectedSubtopic.link.text }}
                    <n-icon size="16">
                      <OpenOutline />
                    </n-icon>
                  </router-link>
                </div>
              </article>

              <!-- Navigation between subtopics -->
              <div class="subtopic-navigation">
                <n-button
                  v-if="previousSubtopic"
                  text
                  class="nav-prev"
                  @click="selectSubtopic(previousSubtopic)"
                >
                  <template #icon>
                    <n-icon size="16">
                      <ArrowBackOutline />
                    </n-icon>
                  </template>
                  {{ previousSubtopic.title }}
                </n-button>
                <div v-else class="nav-spacer"></div>

                <n-button
                  v-if="nextSubtopic"
                  text
                  class="nav-next"
                  @click="selectSubtopic(nextSubtopic)"
                >
                  {{ nextSubtopic.title }}
                  <template #icon>
                    <n-icon size="16">
                      <ArrowForwardOutline />
                    </n-icon>
                  </template>
                </n-button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { NInput, NIcon, NButton } from "naive-ui";
import {
  SearchOutline,
  ChevronForwardOutline,
  ArrowBackOutline,
  ArrowForwardOutline,
  OpenOutline,
  RocketOutline,
  CloudUploadOutline,
  SparklesOutline,
  SearchCircleOutline,
  EaselOutline,
  ImageOutline,
  FolderOutline,
  SettingsOutline,
  CardOutline,
  ShieldCheckmarkOutline,
  HelpCircleOutline,
  MailOutline,
} from "@vicons/ionicons5";
import helpData from "@/assets/helpData.json";
import { RobotOutlined } from "@vicons/antd";

defineOptions({
  name: "HelpView",
});

// Types
interface Subtopic {
  id: string;
  title: string;
  content: string;
  image: string | null;
  link?: {
    text: string;
    route: string;
  };
}

interface Topic {
  id: string;
  title: string;
  icon: string;
  description: string;
  subtopics: Subtopic[];
}

interface SearchResult {
  topic: Topic;
  subtopic: Subtopic;
}

// Router
const route = useRoute();
const router = useRouter();

// State
const searchQuery = ref("");
const selectedTopic = ref<Topic | null>(null);
const selectedSubtopic = ref<Subtopic | null>(null);

// Icon mapping
const iconMap: Record<string, any> = {
  rocket: RocketOutline,
  "cloud-upload": CloudUploadOutline,
  sparkles: SparklesOutline,
  search: SearchCircleOutline,
  easel: EaselOutline,
  image: ImageOutline,
  folder: FolderOutline,
  settings: SettingsOutline,
  "credit-card": CardOutline,
  shield: ShieldCheckmarkOutline,
  "help-circle": HelpCircleOutline,
  mail: MailOutline,
  robot: RobotOutlined,
};

// Get icon component
const getTopicIcon = (iconName: string) => {
  return iconMap[iconName] || HelpCircleOutline;
};

// Load from query params
const loadFromQueryParams = () => {
  const topicId = route.query.topic as string;
  const subtopicId = route.query.subtopic as string;

  if (topicId) {
    const topic = helpData.topics.find((t: Topic) => t.id === topicId);
    if (topic) {
      selectedTopic.value = topic;

      if (subtopicId) {
        const subtopic = topic.subtopics.find(
          (st: Subtopic) => st.id === subtopicId,
        );
        if (subtopic) {
          selectedSubtopic.value = subtopic;
        }
      } else {
        selectedSubtopic.value = null;
      }
    }
  }
};

// Update URL when selection changes
const updateUrl = () => {
  const query: Record<string, string> = {};

  if (selectedTopic.value) {
    query.topic = selectedTopic.value.id;
  }

  if (selectedSubtopic.value) {
    query.subtopic = selectedSubtopic.value.id;
  }

  // Only update if query changed
  const currentQuery = route.query;
  if (
    currentQuery.topic !== query.topic ||
    currentQuery.subtopic !== query.subtopic
  ) {
    router.replace({
      query: Object.keys(query).length > 0 ? query : undefined,
    });
  }
};

// Watch for route changes (when navigating from global search)
watch(
  () => route.query,
  () => {
    loadFromQueryParams();
  },
);

// Filtered topics based on search
const filteredTopics = computed(() => {
  if (!searchQuery.value) {
    return helpData.topics;
  }
  const query = searchQuery.value.toLowerCase();
  return helpData.topics.filter((topic: Topic) => {
    const topicMatch =
      topic.title.toLowerCase().includes(query) ||
      topic.description.toLowerCase().includes(query);
    const subtopicMatch = topic.subtopics.some(
      (st: Subtopic) =>
        st.title.toLowerCase().includes(query) ||
        st.content.toLowerCase().includes(query),
    );
    return topicMatch || subtopicMatch;
  });
});

// Search results
const searchResults = computed((): SearchResult[] => {
  if (!searchQuery.value) return [];
  const query = searchQuery.value.toLowerCase();
  const results: SearchResult[] = [];

  helpData.topics.forEach((topic: Topic) => {
    topic.subtopics.forEach((subtopic: Subtopic) => {
      if (
        subtopic.title.toLowerCase().includes(query) ||
        subtopic.content.toLowerCase().includes(query)
      ) {
        results.push({ topic, subtopic });
      }
    });
  });

  return results;
});

// Navigation
const previousSubtopic = computed(() => {
  if (!selectedTopic.value || !selectedSubtopic.value) return null;
  const index = selectedTopic.value.subtopics.findIndex(
    (st: Subtopic) => st.id === selectedSubtopic.value?.id,
  );
  return index > 0 ? selectedTopic.value.subtopics[index - 1] : null;
});

const nextSubtopic = computed(() => {
  if (!selectedTopic.value || !selectedSubtopic.value) return null;
  const index = selectedTopic.value.subtopics.findIndex(
    (st: Subtopic) => st.id === selectedSubtopic.value?.id,
  );
  return index < selectedTopic.value.subtopics.length - 1
    ? selectedTopic.value.subtopics[index + 1]
    : null;
});

// Methods
const selectTopic = (topic: Topic) => {
  selectedTopic.value = topic;
  selectedSubtopic.value = null;
  searchQuery.value = "";
  updateUrl();
};

const selectSubtopic = (subtopic: Subtopic) => {
  selectedSubtopic.value = subtopic;
  updateUrl();
};

const selectFromSearch = (result: SearchResult) => {
  selectedTopic.value = result.topic;
  selectedSubtopic.value = result.subtopic;
  searchQuery.value = "";
  updateUrl();
};

const goBack = () => {
  selectedTopic.value = null;
  selectedSubtopic.value = null;
  updateUrl();
};

const getContentPreview = (content: string, maxLength = 150) => {
  // Remove markdown-like formatting for preview
  const cleaned = content
    .replace(/\*\*/g, "")
    .replace(/\n/g, " ")
    .replace(/- /g, "")
    .replace(/\d+\. /g, "");
  return cleaned.length > maxLength
    ? cleaned.substring(0, maxLength) + "..."
    : cleaned;
};

const renderContent = (content: string) => {
  // Simple markdown-like rendering
  return (
    content
      // Bold text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      // Line breaks to paragraphs
      .split("\n\n")
      .map((para) => {
        // Check if it's a list
        if (para.includes("\n- ") || para.startsWith("- ")) {
          const items = para
            .split("\n")
            .filter((line) => line.startsWith("- "));
          return `<ul>${items
            .map((item) => `<li>${item.substring(2)}</li>`)
            .join("")}</ul>`;
        }
        // Check if it's a numbered list
        if (/^\d+\.\s/.test(para)) {
          const items = para
            .split("\n")
            .filter((line) => /^\d+\.\s/.test(line));
          return `<ol>${items
            .map((item) => `<li>${item.replace(/^\d+\.\s/, "")}</li>`)
            .join("")}</ol>`;
        }
        // Regular paragraph
        return `<p>${para.replace(/\n/g, "<br>")}</p>`;
      })
      .join("")
  );
};

// Initialize from URL on mount
onMounted(() => {
  loadFromQueryParams();
});
</script>

<style scoped>
.help-view {
  height: 100%;
  overflow-y: auto;
}

.help-container {
  max-width: 1200px;
  margin: 0 auto;
}

/* Header */
.help-header {
  margin-bottom: var(--spacing-xl);
}

.help-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.help-subtitle {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
}

/* Search */
.help-search {
  margin-bottom: var(--spacing-xl);
}

.help-search :deep(.n-input) {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

/* Content Layout */
.help-content {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: var(--spacing-xl);
  min-height: 500px;
}

/* Sidebar */
.help-sidebar {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-sm);
  height: fit-content;
  position: sticky;
  top: var(--spacing-lg);
}

.topics-nav {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2xs);
}

.topic-nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: var(--transition-fast);
}

.topic-nav-item:hover {
  background-color: var(--bg-elevated);
}

.topic-nav-item.active {
  background-color: var(--primary-color-light);
}

.topic-nav-title {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.topic-nav-item.active .topic-nav-title {
  color: var(--primary-color);
}

.chevron-icon {
  opacity: 0;
  transition: var(--transition-fast);
}

.topic-nav-item:hover .chevron-icon,
.topic-nav-item.active .chevron-icon {
  opacity: 1;
}

/* Main Content */
.help-main {
  min-height: 400px;
}

/* Welcome Grid */
.help-welcome {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.welcome-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-lg);
  margin-bottom: var(--spacing-2xl);
}

.welcome-card {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
  cursor: pointer;
  transition: var(--transition-normal);
}

.welcome-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.welcome-card-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  background-color: var(--primary-color-light);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-md);
}

.welcome-card-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.welcome-card-desc {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0;
}

/* More Topics */
.more-topics {
  border-top: 1px solid var(--border-color);
  padding-top: var(--spacing-xl);
}

.more-topics-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  margin: 0 0 var(--spacing-md) 0;
}

.more-topics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-md);
}

.more-topic-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: var(--transition-fast);
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.more-topic-item:hover {
  border-color: var(--primary-color);
  background-color: var(--bg-elevated);
}

/* Search Results */
.search-results {
  animation: fadeIn 0.3s ease;
}

.results-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-lg) 0;
}

.results-count {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-normal);
  color: var(--text-secondary);
}

.no-results {
  text-align: center;
  padding: var(--spacing-3xl);
  color: var(--text-secondary);
}

.no-results p {
  margin: var(--spacing-md) 0;
}

.results-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.result-item {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  cursor: pointer;
  transition: var(--transition-fast);
}

.result-item:hover {
  border-color: var(--primary-color);
  background-color: var(--bg-elevated);
}

.result-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
}

.result-topic {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--primary-color);
}

.result-subtopic {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.result-preview {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

/* Topic Detail */
.topic-detail {
  animation: fadeIn 0.3s ease;
}

.topic-header {
  margin-bottom: var(--spacing-xl);
}

.back-button {
  margin-bottom: var(--spacing-md);
  color: var(--text-secondary);
}

.back-button:hover {
  color: var(--primary-color);
}

.topic-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-xs);
}

.topic-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0;
}

.topic-description {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
}

/* Subtopics List */
.subtopics-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.subtopic-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  cursor: pointer;
  transition: var(--transition-fast);
}

.subtopic-card:hover {
  border-color: var(--primary-color);
  background-color: var(--bg-elevated);
}

.subtopic-info {
  flex: 1;
  min-width: 0;
}

.subtopic-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.subtopic-preview {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Subtopic Detail */
.subtopic-detail {
  animation: fadeIn 0.3s ease;
}

.back-to-topic {
  margin-bottom: var(--spacing-lg);
  color: var(--text-secondary);
}

.back-to-topic:hover {
  color: var(--primary-color);
}

.article-content {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-xl);
}

.article-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-lg) 0;
}

.article-image {
  margin-bottom: var(--spacing-lg);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.article-image img {
  width: 100%;
  height: auto;
  display: block;
}

.article-body {
  font-size: var(--font-size-base);
  color: var(--text-primary);
  line-height: 1.7;
}

.article-body :deep(p) {
  margin: 0 0 var(--spacing-md) 0;
}

.article-body :deep(p:last-child) {
  margin-bottom: 0;
}

.article-body :deep(strong) {
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.article-body :deep(ul),
.article-body :deep(ol) {
  margin: 0 0 var(--spacing-md) 0;
  padding-left: var(--spacing-xl);
}

.article-body :deep(li) {
  margin-bottom: var(--spacing-xs);
}

.article-link {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--border-color);
}

.link-button {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  color: var(--primary-color);
  font-weight: var(--font-weight-medium);
  text-decoration: none;
  transition: var(--transition-fast);
}

.link-button:hover {
  text-decoration: underline;
}

/* Subtopic Navigation */
.subtopic-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: var(--spacing-xl);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--border-color);
}

.nav-spacer {
  flex: 1;
}

.nav-prev,
.nav-next {
  color: var(--text-secondary);
}

.nav-prev:hover,
.nav-next:hover {
  color: var(--primary-color);
}

/* Responsive */
@media (max-width: 1024px) {
  .welcome-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .more-topics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .help-content {
    grid-template-columns: 1fr;
  }

  .help-sidebar {
    position: static;
    order: 2;
  }

  .help-main {
    order: 1;
  }

  .welcome-grid {
    grid-template-columns: 1fr;
  }

  .more-topics-grid {
    grid-template-columns: 1fr;
  }

  .subtopic-navigation {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .nav-prev,
  .nav-next {
    width: 100%;
    justify-content: center;
  }
}

@media (max-width: 480px) {
  .help-header {
    margin-bottom: var(--spacing-lg);
  }

  .help-title {
    font-size: var(--font-size-xl);
  }

  .article-content {
    padding: var(--spacing-md);
  }

  .topic-nav-item {
    padding: var(--spacing-xs) var(--spacing-sm);
  }
}
</style>
