<template>
  <n-modal
    v-model:show="visible"
    preset="card"
    :style="{ maxWidth: '90vw', width: '900px', maxHeight: '90vh' }"
    :show-icon="false"
    :closable="true"
    @close="visible = false"
  >
    <template #header>
      <div class="custom-header">
        <span class="header-title">{{
          selectedPhoto?.originalFileName || "Untitled"
        }}</span>
        <n-button
          size="tiny"
          style="margin-top: 3px; margin-left: 2px"
          secondary
          @click="copyNameToClipboard"
          title="Copy name to clipboard"
        >
          <template #icon>
            <n-icon>
              <CopyIcon />
            </n-icon>
          </template>
        </n-button>
      </div>
    </template>

    <div class="dialog-content">
      <!-- Centered Photo Display with Overlay Info -->
      <div class="photo-display-centered">
        <img
          :src="
            selectedPhoto?.originalUrl ||
            selectedPhoto?.url ||
            selectedPhoto?.thumbnailUrl
          "
          :alt="selectedPhoto?.filename || selectedPhoto?.name || 'Photo'"
          class="centered-photo"
          @error="handleImageError"
        />

        <!-- Photo Overlay with Actions Only -->
        <div class="photo-overlay">
          <!-- Bottom right: Download + Fullscreen -->
          <div class="bottom-right-actions">
            <n-button
              size="small"
              @click="handleDownloadPhoto"
              title="Download photo"
              quaternary
              class="download-btn"
            >
              <template #icon>
                <n-icon size="18">
                  <DownloadIcon />
                </n-icon>
              </template>
            </n-button>
            <n-button
              size="small"
              quaternary
              class="fullscreen-btn"
              @click="openFullscreen"
              title="View fullscreen"
            >
              <template #icon>
                <n-icon size="18">
                  <FullscreenOutlined />
                </n-icon>
              </template>
            </n-button>
          </div>
        </div>
      </div>

      <!-- Info Sections with Lateral Tabs -->
      <div class="info-sections">
        <n-tabs type="line" placement="left" size="large" animated>
          <n-tab-pane name="technical" display-directive="show:lazy">
            <template #tab>
              <div class="tab-content">
                <n-icon size="18">
                  <InfoIcon />
                </n-icon>
                <span>Technical</span>
              </div>
            </template>
            <div class="tab-panel-content">
              <div class="technical-info-section">
                <div class="technical-info-grid">
                  <!-- File Information -->
                  <div class="tech-category">
                    <h6 class="category-title">File Information</h6>
                    <div class="category-tags">
                      <n-tag type="info" class="tech-tag">
                        {{
                          selectedPhoto?.originalFileName ||
                          selectedPhoto?.name ||
                          "Unknown"
                        }}
                      </n-tag>
                      <n-tag
                        :type="
                          selectedPhoto?.descriptions?.visual_aspects?.format
                            ? 'info'
                            : 'warning'
                        "
                        class="tech-tag"
                      >
                        {{
                          selectedPhoto?.descriptions?.visual_aspects?.format?.[0]?.toUpperCase() ||
                          "Not Present"
                        }}
                      </n-tag>
                      <n-tag
                        :type="
                          selectedPhoto?.descriptions?.visual_aspects
                            ?.dimensions
                            ? 'info'
                            : 'warning'
                        "
                        class="tech-tag"
                      >
                        {{
                          selectedPhoto?.descriptions?.visual_aspects
                            ?.dimensions?.[0] || "Not Present"
                        }}
                      </n-tag>
                    </div>
                  </div>

                  <!-- Date Information -->
                  <div class="tech-category">
                    <h6 class="category-title">Date Information</h6>
                    <div class="category-tags">
                      <n-tag type="info" class="tech-tag">
                        {{
                          selectedPhoto?.descriptions?.EXIF?.dateTaken
                            ? formatDate(
                                selectedPhoto.descriptions.EXIF.dateTaken
                              )
                            : selectedPhoto?.createdAt
                            ? formatDate(selectedPhoto.createdAt)
                            : "Not Present"
                        }}
                      </n-tag>
                    </div>
                  </div>

                  <!-- Camera Settings -->
                  <div class="tech-category">
                    <h6 class="category-title">Camera & Settings</h6>
                    <div class="category-tags">
                      <n-tag
                        :type="
                          selectedPhoto?.descriptions?.EXIF?.camera
                            ? 'info'
                            : 'warning'
                        "
                        class="tech-tag"
                      >
                        {{
                          selectedPhoto?.descriptions?.EXIF?.camera ||
                          "Not Present"
                        }}
                      </n-tag>
                      <n-tag
                        v-if="selectedPhoto?.descriptions?.EXIF?.iso"
                        type="info"
                        class="tech-tag"
                      >
                        ISO {{ selectedPhoto.descriptions.EXIF.iso }}
                      </n-tag>
                      <n-tag
                        v-if="selectedPhoto?.descriptions?.EXIF?.aperture"
                        type="info"
                        class="tech-tag"
                      >
                        f/{{ selectedPhoto.descriptions.EXIF.aperture }}
                      </n-tag>
                      <n-tag
                        v-if="selectedPhoto?.descriptions?.EXIF?.focalLength"
                        type="info"
                        class="tech-tag"
                      >
                        {{ selectedPhoto.descriptions.EXIF.focalLength }}mm
                      </n-tag>
                      <n-tag
                        v-if="selectedPhoto?.descriptions?.EXIF?.exposureTime"
                        type="info"
                        class="tech-tag"
                      >
                        {{
                          formatExposureTime(
                            selectedPhoto.descriptions.EXIF.exposureTime
                          )
                        }}
                      </n-tag>
                    </div>
                  </div>

                  <!-- Photography Type -->
                  <div class="tech-category">
                    <h6 class="category-title">Photography Type</h6>
                    <div class="category-tags">
                      <n-tag
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects?.genre
                        "
                        v-for="genre in selectedPhoto.descriptions
                          .visual_aspects.genre"
                        :key="genre"
                        type="info"
                        class="tech-tag"
                      >
                        {{ formatCategoryName(genre) }}
                      </n-tag>
                      <n-tag
                        v-if="
                          !selectedPhoto?.descriptions?.visual_aspects?.genre
                        "
                        type="warning"
                        class="tech-tag"
                      >
                        Not Present
                      </n-tag>
                      <n-tag
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects
                            ?.orientation
                        "
                        v-for="orientation in selectedPhoto.descriptions
                          .visual_aspects.orientation"
                        :key="orientation"
                        type="info"
                        class="tech-tag"
                      >
                        {{ formatCategoryName(orientation) }}
                      </n-tag>
                    </div>
                  </div>

                  <!-- Composition & Framing -->
                  <div class="tech-category">
                    <h6 class="category-title">Composition</h6>
                    <div class="category-tags">
                      <n-tag
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects?.framing
                        "
                        v-for="frame in selectedPhoto.descriptions
                          .visual_aspects.framing"
                        :key="frame"
                        type="info"
                        class="tech-tag"
                      >
                        {{ formatCategoryName(frame) }}
                      </n-tag>
                      <n-tag
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects
                            ?.perspective
                        "
                        v-for="perspective in selectedPhoto.descriptions
                          .visual_aspects.perspective"
                        :key="perspective"
                        type="info"
                        class="tech-tag"
                      >
                        {{ formatCategoryName(perspective) }}
                      </n-tag>
                      <n-tag
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects
                            ?.depth_of_field
                        "
                        v-for="dof in selectedPhoto.descriptions.visual_aspects
                          .depth_of_field"
                        :key="dof"
                        type="info"
                        class="tech-tag"
                      >
                        {{ formatCategoryName(dof) }}
                      </n-tag>
                    </div>
                  </div>

                  <!-- Lighting -->
                  <div class="tech-category">
                    <h6 class="category-title">Lighting</h6>
                    <div class="category-tags">
                      <n-tag
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects?.lighting
                        "
                        v-for="light in selectedPhoto.descriptions
                          .visual_aspects.lighting"
                        :key="light"
                        type="info"
                        class="tech-tag"
                      >
                        {{ formatCategoryName(light) }}
                      </n-tag>
                      <n-tag
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects
                            ?.lighting_scheme
                        "
                        v-for="scheme in selectedPhoto.descriptions
                          .visual_aspects.lighting_scheme"
                        :key="scheme"
                        type="info"
                        class="tech-tag"
                      >
                        {{ formatCategoryName(scheme) }}
                      </n-tag>
                      <n-tag
                        v-if="selectedPhoto?.descriptions?.EXIF?.flash"
                        type="info"
                        class="tech-tag"
                      >
                        {{ selectedPhoto.descriptions.EXIF.flash }}
                      </n-tag>
                      <n-tag
                        v-if="selectedPhoto?.descriptions?.EXIF?.whiteBalance"
                        type="info"
                        class="tech-tag"
                      >
                        WB: {{ selectedPhoto.descriptions.EXIF.whiteBalance }}
                      </n-tag>
                    </div>
                  </div>

                  <!-- Visual Style -->
                  <div class="tech-category">
                    <h6 class="category-title">Visual Style</h6>
                    <div class="category-tags">
                      <n-tag
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects?.palette
                        "
                        v-for="color in selectedPhoto.descriptions
                          .visual_aspects.palette"
                        :key="color"
                        type="info"
                        class="tech-tag"
                      >
                        {{ formatCategoryName(color) }}
                      </n-tag>
                      <n-tag
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects
                            ?.temperature
                        "
                        v-for="temp in selectedPhoto.descriptions.visual_aspects
                          .temperature"
                        :key="temp"
                        type="info"
                        class="tech-tag"
                      >
                        {{ formatCategoryName(temp) }}
                      </n-tag>
                      <n-tag
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects?.stylistic
                        "
                        v-for="style in selectedPhoto.descriptions
                          .visual_aspects.stylistic"
                        :key="style"
                        type="info"
                        class="tech-tag"
                      >
                        {{ formatCategoryName(style) }}
                      </n-tag>
                    </div>
                  </div>

                  <!-- Image Quality -->
                  <div class="tech-category">
                    <h6 class="category-title">Image Quality</h6>
                    <div class="category-tags">
                      <n-tag
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects?.focus
                        "
                        v-for="focus in selectedPhoto.descriptions
                          .visual_aspects.focus"
                        :key="focus"
                        type="info"
                        class="tech-tag"
                      >
                        {{ formatCategoryName(focus) }}
                      </n-tag>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </n-tab-pane>
          <n-tab-pane name="tags" display-directive="show:lazy">
            <template #tab>
              <div class="tab-content">
                <n-icon size="18">
                  <TagIcon />
                </n-icon>
                <span>Tags</span>
              </div>
            </template>
            <div class="tab-panel-content">
              <div class="tags-section">
                <div v-if="getGroupedTags().length > 0" class="grouped-tags">
                  <div
                    v-for="group in getGroupedTags()"
                    :key="group.groupName"
                    class="tag-group-item"
                  >
                    <h5 class="tag-group-label">
                      {{ formatGroupName(group.groupName) }}
                    </h5>
                    <div class="tag-group-content">
                      <div class="tags-list">
                        <n-tag
                          v-for="tag in group.tags"
                          :key="tag.id || tag.name"
                          closable
                          type="info"
                          :bordered="false"
                          @close="removeTag(tag)"
                          class="photo-tag"
                        >
                          {{ tag.name || tag }}
                        </n-tag>
                      </div>
                    </div>
                  </div>
                </div>
                <!-- <div class="add-tag-section">
                  <n-input-group>
                    <n-input
                      v-model:value="newTagName"
                      placeholder="Add a new tag..."
                      @keydown.enter="addTag"
                      :disabled="isAddingTag"
                    />
                    <n-button
                      type="primary"
                      @click="addTag"
                      :loading="isAddingTag"
                      :disabled="!newTagName.trim()"
                    >
                      Add
                    </n-button>
                  </n-input-group>
                </div> -->
              </div>
            </div>
          </n-tab-pane>

          <n-tab-pane name="scores" display-directive="show:lazy">
            <template #tab>
              <div class="tab-content">
                <n-icon size="18">
                  <ScoresIcon />
                </n-icon>
                <span>Scores</span>
              </div>
            </template>
            <div class="tab-panel-content">
              <div class="descriptions-section">
                <div v-if="selectedPhoto?.descriptions" class="ai-descriptions">
                  <div
                    class="description-item"
                    v-if="selectedPhoto.descriptions.artistic_scores"
                  >
                    <!-- Overall Rating -->
                    <div class="overall-rating-container">
                      <div class="overall-rating">
                        <span class="overall-label">Overall Rating:</span>
                        <div class="overall-score">
                          <span class="overall-value"
                            >{{ overallRating.average }}/{{
                              scoreScale.max
                            }}</span
                          >
                          <span
                            class="overall-rating-text"
                            :class="
                              'rating-' +
                              overallRating.rating
                                .toLowerCase()
                                .replace(' ', '-')
                                .replace('/', '')
                            "
                          >
                            {{ overallRating.rating }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <!-- Genre Presets -->
                    <div class="genre-presets-container">
                      <div class="genre-header">
                        <h6 class="genre-title">Photography Genre Presets</h6>
                        <!-- <p class="genre-subtitle">
                          Quick configurations for different photography styles
                        </p> -->
                      </div>
                      <div class="genre-buttons">
                        <n-tooltip
                          trigger="hover"
                          placement="bottom"
                          :show-arrow="true"
                          delay="1200"
                        >
                          <template #trigger>
                            <n-button
                              :type="
                                selectedGenre === 'street'
                                  ? 'primary'
                                  : 'default'
                              "
                              size="small"
                              @click="applyGenrePresetWithUI('street')"
                              class="genre-button"
                            >
                              <template #icon>
                                <n-icon>
                                  <WalkOutline />
                                </n-icon>
                              </template>
                              Street
                            </n-button>
                          </template>
                          <div v-html="formatGenreTooltip('street')"></div>
                        </n-tooltip>

                        <n-tooltip
                          trigger="hover"
                          placement="bottom"
                          :show-arrow="true"
                          delay="1200"
                        >
                          <template #trigger>
                            <n-button
                              :type="
                                selectedGenre === 'documentary'
                                  ? 'primary'
                                  : 'default'
                              "
                              size="small"
                              @click="applyGenrePresetWithUI('documentary')"
                              class="genre-button"
                            >
                              <template #icon>
                                <n-icon>
                                  <BookOpen16Regular />
                                </n-icon>
                              </template>
                              Documentary
                            </n-button>
                          </template>
                          <div v-html="formatGenreTooltip('documentary')"></div>
                        </n-tooltip>

                        <n-tooltip
                          trigger="hover"
                          placement="bottom"
                          :show-arrow="true"
                          delay="1200"
                        >
                          <template #trigger>
                            <n-button
                              :type="
                                selectedGenre === 'abstract'
                                  ? 'primary'
                                  : 'default'
                              "
                              size="small"
                              @click="applyGenrePresetWithUI('abstract')"
                              class="genre-button"
                            >
                              <template #icon>
                                <n-icon>
                                  <PaletteOutlined />
                                </n-icon>
                              </template>
                              Artistic
                            </n-button>
                          </template>
                          <div v-html="formatGenreTooltip('abstract')"></div>
                        </n-tooltip>
                      </div>
                    </div>

                    <!-- Weights Configuration -->
                    <div
                      class="weights-configuration-container"
                      v-if="showCustomWeights"
                    >
                      <div class="weights-header">
                        <h6 class="weights-title">
                          Score Weights Configuration
                        </h6>
                      </div>
                      <CustomArtisticWeights
                        v-model="artisticScoreWeights"
                        :format-criterion-name="formatCriterionName"
                      />
                    </div>

                    <div class="artistic-scores-grid">
                      <div
                        v-for="scoreData in getOrderedArtisticScores(
                          selectedPhoto.descriptions.artistic_scores
                        )"
                        :key="scoreData.criterion"
                        class="score-item"
                        :class="{ 'bonus-item': scoreData.group === 'bonus' }"
                        :style="{
                          '--weight-scale':
                            artisticScoreWeights[scoreData.criterion],
                          '--weight-opacity':
                            artisticScoreWeights[scoreData.criterion],
                        }"
                      >
                        <span
                          class="score-label"
                          :data-weight="`×${artisticScoreWeights[
                            scoreData.criterion
                          ].toFixed(1)}`"
                          :title="`Score: ${scoreData.score}/${
                            scoreScale.max
                          } | Weight: ${artisticScoreWeights[
                            scoreData.criterion
                          ].toFixed(1)} | Impact: ${(
                            scoreData.score *
                            artisticScoreWeights[scoreData.criterion]
                          ).toFixed(1)}`"
                        >
                          {{ scoreData.label }}
                        </span>
                        <div class="score-bar-container">
                          <div class="score-bar">
                            <div
                              class="score-fill"
                              :style="{
                                width: (scoreData.score / 9) * 100 + '%',
                                opacity: 0.8,
                                background: getScoreBgColor(scoreData.score),
                              }"
                            ></div>
                          </div>
                          <span class="score-value">
                            <span class="score-number">{{
                              scoreData.score
                            }}</span>
                            <span class="max-score">/{{ scoreScale.max }}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </n-tab-pane>

          <n-tab-pane
            v-if="false"
            name="descriptions"
            display-directive="show:lazy"
          >
            <template #tab>
              <div class="tab-content">
                <n-icon size="18">
                  <DocumentTextIcon />
                </n-icon>
                <span>Descriptions</span>
              </div>
            </template>
            <div class="tab-panel-content">
              <div class="descriptions-section">
                <div v-if="selectedPhoto?.descriptions" class="ai-descriptions">
                  <!-- <div class="description-item">
                    <h5 class="description-label">Story</h5>
                    <div class="description-content">
                      <p
                        v-html="
                          highlightMatchingChunks(
                            selectedPhoto.descriptions.story
                          )
                        "
                      ></p>
                    </div>
                  </div> -->

                  <div class="description-item">
                    <h5 class="description-label">Context</h5>
                    <div class="description-content">
                      <p
                        v-html="
                          highlightMatchingChunks(
                            selectedPhoto.descriptions.context
                          )
                        "
                      ></p>
                    </div>
                  </div>

                  <div class="description-item">
                    <h5 class="description-label">Visual Accents</h5>
                    <div class="description-content">
                      <p
                        v-html="
                          highlightMatchingChunks(
                            selectedPhoto.descriptions.visual_accents
                          )
                        "
                      ></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </n-tab-pane>

          <n-tab-pane name="insights" display-directive="show:lazy">
            <template #tab>
              <div class="tab-content">
                <n-icon size="18">
                  <SparklesIcon />
                </n-icon>
                <span>Insights</span>
              </div>
            </template>
            <div class="tab-panel-content">
              <div class="insights-panel">
                <!-- Insights Display Area -->
                <div class="insights-display-area">
                  <!-- Empty state placeholder -->
                  <div
                    v-if="allPhotoInsights.length === 0 && !isGeneratingInsight"
                    class="insights-placeholder"
                  >
                    <n-icon size="64" class="placeholder-icon">
                      <SparklesIcon />
                    </n-icon>
                    <p class="placeholder-title">Discover photo insights</p>
                    <p class="placeholder-subtitle">
                      Choose a preset topic or ask your own question.
                    </p>
                  </div>

                  <!-- Accumulated insights -->
                  <div v-if="allPhotoInsights.length > 0" class="insights-list">
                    <div
                      v-for="(insight, index) in allPhotoInsights"
                      :key="index"
                      class="description-item insight-item"
                    >
                      <h5 class="description-label">{{ insight.label }}</h5>
                      <div class="description-content">
                        <div v-html="insight.text"></div>
                      </div>
                    </div>
                  </div>

                  <!-- Loading state -->
                  <div v-if="isGeneratingInsight" class="insight-loading">
                    <div class="description-item insight-item loading">
                      <h5 class="description-label">
                        {{ pendingInsightLabel }}
                      </h5>
                      <div class="description-content loading-content">
                        <n-spin size="small" />
                        <span class="loading-text">Analyzing image...</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Control Panel -->
                <div class="insights-control-panel">
                  <div class="preset-buttons">
                    <n-button
                      :type="'default'"
                      size="small"
                      @click="getSpecificInsight('cultural')"
                      :disabled="
                        isGeneratingInsight ||
                        !insightTypesAvailable.cultural ||
                        !canUseInsights
                      "
                      class="preset-btn"
                    >
                      <template #icon>
                        <n-icon size="16">
                          <GlobeOutline />
                        </n-icon>
                      </template>
                      Cultural
                    </n-button>
                    <n-button
                      :type="'default'"
                      size="small"
                      @click="getSpecificInsight('technical')"
                      :disabled="
                        isGeneratingInsight ||
                        !insightTypesAvailable.technical ||
                        !canUseInsights
                      "
                      class="preset-btn"
                    >
                      <template #icon>
                        <n-icon size="16">
                          <SettingsOutline />
                        </n-icon>
                      </template>
                      Technical
                    </n-button>
                    <n-button
                      :type="'default'"
                      size="small"
                      @click="getSpecificInsight('artistic')"
                      :disabled="
                        isGeneratingInsight ||
                        !insightTypesAvailable.artistic ||
                        !canUseInsights
                      "
                      class="preset-btn"
                    >
                      <template #icon>
                        <n-icon size="16">
                          <BrushOutline />
                        </n-icon>
                      </template>
                      Artistic
                    </n-button>
                  </div>
                  <div class="custom-question-input">
                    <n-input
                      v-model:value="customInsightQuestion"
                      placeholder="Ask anything about this photo..."
                      :disabled="
                        isGeneratingInsight ||
                        customQuestionsRemaining <= 0 ||
                        !canUseInsights
                      "
                      @keydown.enter="submitCustomQuestion"
                      size="small"
                    >
                      <template #suffix>
                        <n-button
                          text
                          :disabled="
                            !customInsightQuestion.trim() ||
                            isGeneratingInsight ||
                            customQuestionsRemaining <= 0 ||
                            !canUseInsights
                          "
                          @click="submitCustomQuestion"
                          class="send-btn"
                        >
                          <n-icon size="18">
                            <SendOutline />
                          </n-icon>
                        </n-button>
                      </template>
                    </n-input>
                  </div>
                </div>
              </div>
            </div>
          </n-tab-pane>

          <n-tab-pane name="notes" display-directive="show:lazy">
            <template #tab>
              <div class="tab-content">
                <n-icon size="18">
                  <EditIcon />
                </n-icon>
                <span>Notes</span>
              </div>
            </template>
            <div class="tab-panel-content">
              <div class="notes-section">
                <n-input
                  v-model:value="photoNotes"
                  type="textarea"
                  placeholder="Add your personal notes about this photo..."
                  :autosize="{ minRows: 8, maxRows: 8 }"
                  @blur="saveNotes"
                />
                <div class="notes-actions">
                  <n-button
                    size="small"
                    type="primary"
                    @click="saveNotes"
                    :loading="isSavingNotes"
                  >
                    Save Notes
                  </n-button>
                </div>
              </div>
            </div>
          </n-tab-pane>
        </n-tabs>
      </div>
    </div>
  </n-modal>

  <!-- Fullscreen Photo Modal -->
  <n-modal
    v-model:show="showFullscreenPhoto"
    :mask-closable="true"
    :show-icon="false"
    :closable="false"
    :style="{ padding: '0' }"
    transform-origin="center"
  >
    <div class="fullscreen-container" @click="closeFullscreen">
      <div class="fullscreen-content">
        <!-- Navigation Arrow Left -->
        <n-button
          v-if="hasPreviousPhoto"
          class="nav-arrow nav-arrow-left"
          size="large"
          circle
          type="primary"
          @click.stop="goToPreviousPhoto"
          :disabled="isTransitioning"
          title="Previous photo (←)"
        >
          <template #icon>
            <n-icon size="24">
              <ChevronBack />
            </n-icon>
          </template>
        </n-button>

        <!-- Photo with transition -->
        <transition
          :name="slideDirection === 'next' ? 'slide-left' : 'slide-right'"
          mode="out-in"
        >
          <img
            :key="selectedPhoto?.id"
            :src="
              selectedPhoto?.originalUrl ||
              selectedPhoto?.url ||
              selectedPhoto?.thumbnailUrl
            "
            :alt="selectedPhoto?.filename || selectedPhoto?.name || 'Photo'"
            class="fullscreen-photo"
            @error="handleImageError"
            @click="closeFullscreen"
          />
        </transition>

        <!-- Navigation Arrow Right -->
        <n-button
          v-if="hasNextPhoto"
          class="nav-arrow nav-arrow-right"
          size="large"
          circle
          type="primary"
          @click.stop="goToNextPhoto"
          :disabled="isTransitioning"
          title="Next photo (→)"
        >
          <template #icon>
            <n-icon size="24">
              <ChevronForward />
            </n-icon>
          </template>
        </n-button>

        <!-- Photo Counter -->
        <!-- <div v-if="photoCounter" class="photo-counter">
          {{ photoCounter }}
        </div> -->

        <!-- Close Button -->
        <n-button
          class="close-fullscreen-btn"
          size="large"
          circle
          type="primary"
          @click.stop="closeFullscreen"
          title="Close fullscreen (Esc)"
        >
          <template #icon>
            <n-icon size="20">
              <CloseIcon />
            </n-icon>
          </template>
        </n-button>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import {
  NModal,
  NIcon,
  NButton,
  NCollapse,
  NCollapseItem,
  NTag,
  NInput,
  NInputGroup,
  NSpin,
  NSwitch,
  NTooltip,
  NTabs,
  NTabPane,
  useMessage,
} from "naive-ui";
import CustomArtisticWeights from "./CustomArtisticWeights.vue";

// Icons from @vicons
import {
  CopyOutline as CopyIcon,
  DownloadOutline as DownloadIcon,
  InformationCircleOutline as InfoIcon,
  PricetagOutline as TagIcon,
  DocumentTextOutline as DocumentTextIcon,
  SparklesOutline as SparklesIcon,
  RefreshOutline as RefreshIcon,
  CreateOutline as EditIcon,
  WalkOutline,
  CloseOutline as CloseIcon,
  ChevronBackOutline as ChevronBack,
  ChevronForwardOutline as ChevronForward,
  GlobeOutline,
  SettingsOutline,
  BrushOutline,
  SendOutline,
} from "@vicons/ionicons5";
import { FullscreenOutlined } from "@vicons/material";
import { Trophy20Regular as ScoresIcon } from "@vicons/fluent";

import { api } from "@/utils/axios.js";
import { usePhotoDownload } from "@/composables/usePhotoDownload.js";
import { useArtisticScores } from "@/composables/useArtisticScores.js";
import { BookOpen16Regular } from "@vicons/fluent";
import { PaletteOutlined } from "@vicons/material";

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
  selectedPhoto: {
    type: Object,
    default: null,
  },
  allPhotos: {
    type: Array,
    default: () => [],
  },
  currentPhotoIndex: {
    type: Number,
    default: -1,
  },
});

const emit = defineEmits(["update:modelValue", "photo-navigate"]);

const message = useMessage();
const { downloadPhoto } = usePhotoDownload();
const {
  scoreScale,
  calculateArtisticScore,
  getScoreBgColor,
  formatCriterionName,
  formatGenreTooltip,
  artisticScoreWeights,
  selectedGenre,
  applyGenrePreset,
  getActiveArtisticScores,
  getOrderedArtisticScores,
} = useArtisticScores();

// Simple session limits (resets on app restart)
const MAX_QUESTIONS = 3; // Max custom questions per photo
const MAX_PHOTOS_INSIGHTS = 3; // Max photos that can have insights per session

// Session usage tracking (in-memory, resets on reload)
const sessionPhotoUsage = ref(new Map()); // photoId -> { types: Set, customQuestions: number }
const sessionPhotoCount = ref(new Set()); // Set of photoIds that have been used
const sessionPhotoInsights = ref(new Map()); // photoId -> { insights: [], currentIndex: 0 }

// Reactive state
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

const photoTags = ref([]);
const newTagName = ref("");
const isAddingTag = ref(false);
const photoInsight = ref("");
const isGeneratingInsight = ref(false);
const pendingInsightLabel = ref("");
const customInsightQuestion = ref("");
const photoNotes = ref("");
const isSavingNotes = ref(false);

const showCustomWeights = ref(false);
const showFullscreenPhoto = ref(false);

// Navigation state and logic
const isTransitioning = ref(false);
const slideDirection = ref("next"); // 'next' or 'prev'

// Computed properties for navigation
const hasPreviousPhoto = computed(() => {
  return props.allPhotos?.length > 0 && props.currentPhotoIndex > 0;
});

const hasNextPhoto = computed(() => {
  return (
    props.allPhotos?.length > 0 &&
    props.currentPhotoIndex < props.allPhotos.length - 1
  );
});

const photoCounter = computed(() => {
  if (!props.allPhotos?.length || props.currentPhotoIndex < 0) return "";
  return `${props.currentPhotoIndex + 1} / ${props.allPhotos.length}`;
});

// Navigation methods
const goToPreviousPhoto = () => {
  if (!hasPreviousPhoto.value || isTransitioning.value) return;
  isTransitioning.value = true;
  slideDirection.value = "prev";
  emit("photo-navigate", props.currentPhotoIndex - 1);
  setTimeout(() => {
    isTransitioning.value = false;
  }, 400);
};

const goToNextPhoto = () => {
  if (!hasNextPhoto.value || isTransitioning.value) return;
  isTransitioning.value = true;
  slideDirection.value = "next";
  emit("photo-navigate", props.currentPhotoIndex + 1);
  setTimeout(() => {
    isTransitioning.value = false;
  }, 400);
};

// Keyboard navigation
const handleKeyDown = (e) => {
  if (!showFullscreenPhoto.value) return;

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    goToPreviousPhoto();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    goToNextPhoto();
  } else if (e.key === "Escape") {
    closeFullscreen();
  }
};

// Preload next/previous images for smooth transitions
const preloadImage = (photoIndex) => {
  if (!props.allPhotos?.[photoIndex]) return;

  const photo = props.allPhotos[photoIndex];
  const img = new Image();
  img.src = photo.originalUrl || photo.url || photo.thumbnailUrl;
};

// Watch for fullscreen changes to preload adjacent images
watch(showFullscreenPhoto, (isFullscreen) => {
  if (isFullscreen && props.currentPhotoIndex >= 0) {
    // Preload next and previous images
    if (hasNextPhoto.value) {
      preloadImage(props.currentPhotoIndex + 1);
    }
    if (hasPreviousPhoto.value) {
      preloadImage(props.currentPhotoIndex - 1);
    }
  }
});

// Watch for photo index changes to preload adjacent images
watch(
  () => props.currentPhotoIndex,
  (newIndex) => {
    if (showFullscreenPhoto.value && newIndex >= 0) {
      // Preload next and previous images
      if (hasNextPhoto.value) {
        preloadImage(newIndex + 1);
      }
      if (hasPreviousPhoto.value) {
        preloadImage(newIndex - 1);
      }
    }
  }
);

// Lifecycle hooks for keyboard listeners
onMounted(() => {
  window.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});

// Function to show custom weight controls
const showCustomControls = () => {
  selectedGenre.value = "custom";
  showCustomWeights.value = true; // Show custom weights for manual configuration
  // Don't reset weights, keep current configuration
};

// Override applyGenrePreset to also control showCustomWeights
const applyGenrePresetWithUI = (genre) => {
  applyGenrePreset(genre);
  showCustomWeights.value = false; // Hide custom weights when applying preset
};

// Watch for photo changes and load persistent data
watch(
  () => props.selectedPhoto,
  (newPhoto) => {
    if (newPhoto) {
      // Initialize tags from photo data
      photoTags.value = newPhoto.tags ? [...newPhoto.tags] : [];

      // Initialize description and notes if they exist
      photoInsight.value = newPhoto.description || "";
      photoNotes.value = newPhoto.notes || "";

      // Load insights from session storage (persist across dialog openings)
      if (sessionPhotoInsights.value.has(newPhoto.id)) {
        const savedData = sessionPhotoInsights.value.get(newPhoto.id);
        allPhotoInsights.value = savedData.insights;
        currentInsightIndex.value = savedData.currentIndex;
      } else {
        // Initialize empty if first time viewing this photo
        allPhotoInsights.value = [];
        currentInsightIndex.value = 0;
      }

      isGeneratingInsight.value = false;
      customInsightQuestion.value = "";
      pendingInsightLabel.value = "";
    }
  },
  { immediate: true }
);

// Helper functions
const formatDate = (dateString) => {
  if (!dateString) return "Unknown";

  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return "Unknown";

  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
};

const formatExposureTime = (exposureTime) => {
  if (!exposureTime) return "Unknown";

  if (exposureTime >= 1) {
    return `${exposureTime}s`;
  } else {
    return `1/${Math.round(1 / exposureTime)}`;
  }
};

const openFullscreen = () => {
  showFullscreenPhoto.value = true;
};

const closeFullscreen = () => {
  showFullscreenPhoto.value = false;
};

const formatCategoryName = (category) => {
  // Convert snake_case to Title Case
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Group tags by their group property, excluding 'misc' group
const getGroupedTags = () => {
  if (!photoTags.value || photoTags.value.length === 0) {
    return [];
  }

  // Filter out misc group and group by 'group' property
  const filteredTags = photoTags.value.filter((tag) => tag.group !== "misc");

  // Group tags by their group property
  const grouped = filteredTags.reduce((acc, tag) => {
    const groupName = tag.category || "general";
    if (!acc[groupName]) {
      acc[groupName] = [];
    }
    acc[groupName].push(tag);
    return acc;
  }, {});

  // Convert to array format similar to descriptions
  return Object.entries(grouped).map(([groupName, tags]) => ({
    groupName,
    tags,
  }));
};

const formatGroupName = (groupName) => {
  // Convert snake_case or camelCase to Title Case
  return groupName
    .replace(/([A-Z])/g, " $1") // Handle camelCase
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .trim();
};

const splitArtisticReview = (text) => {
  if (!text) return [];

  // Split into sentences, keeping the period
  const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];

  if (sentences.length <= 3) {
    return sentences;
  }

  // Calculate approximately equal chunks
  const totalSentences = sentences.length;
  const sentencesPerParagraph = Math.ceil(totalSentences / 3);

  const paragraphs = [];
  for (let i = 0; i < 3; i++) {
    const start = i * sentencesPerParagraph;
    const end = Math.min(start + sentencesPerParagraph, totalSentences);
    const paragraph = sentences.slice(start, end).join(" ").trim();
    if (paragraph) {
      paragraphs.push(paragraph);
    }
  }

  return paragraphs;
};

const getFilteredVisualAspects = (visualAspects) => {
  // Filter out the summary field from visual aspects
  const filtered = { ...visualAspects };
  delete filtered.summary;
  return filtered;
};

const handleImageError = (event) => {
  console.warn("Failed to load original image, falling back to thumbnail");
  // Could implement fallback logic here
};

const copyNameToClipboard = async () => {
  const name = props.selectedPhoto?.originalFileName || "Untitled";

  try {
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(name);
      message.success("Photo name copied to clipboard");
    } else {
      // Fallback for environments where clipboard API is not available
      fallbackCopyTextToClipboard(name);
    }
  } catch (error) {
    console.warn("Clipboard API failed, trying fallback method:", error);
    fallbackCopyTextToClipboard(name);
  }
};

const fallbackCopyTextToClipboard = (text) => {
  try {
    // Create a temporary textarea element
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    // Try to copy using the old execCommand method
    const successful = document.execCommand("copy");
    document.body.removeChild(textArea);

    if (successful) {
      message.success("Photo name copied to clipboard");
    } else {
      message.warning(
        "Unable to copy automatically. Please copy manually: " + text
      );
    }
  } catch (err) {
    console.warn("All copy methods failed:", err);
    message.warning("Copy not supported. Photo name: " + text);
  }
};

const handleDownloadPhoto = () => {
  downloadPhoto(props.selectedPhoto);
};

// Tags management
const addTag = async () => {
  const tagName = newTagName.value.trim();
  if (!tagName) return;

  // Check if tag already exists
  if (photoTags.value.some((tag) => (tag.name || tag) === tagName)) {
    message.warning("Tag already exists");
    return;
  }

  isAddingTag.value = true;

  try {
    // Create new tag object
    const newTag = {
      id: Date.now(), // Temporary ID, would be replaced by backend
      name: tagName,
    };

    photoTags.value.push(newTag);
    newTagName.value = "";

    // Here you would typically save to backend
    // await saveTagsToPhoto(props.selectedPhoto.id, photoTags.value)

    message.success("Tag added successfully");
  } catch (error) {
    photoTags.value.pop(); // Remove the tag if save failed
    message.error("Failed to add tag");
    console.error("Add tag failed:", error);
  } finally {
    isAddingTag.value = false;
  }
};

const removeTag = async (tagToRemove) => {
  const index = photoTags.value.findIndex(
    (tag) =>
      (tag.id && tag.id === tagToRemove.id) ||
      (tag.name || tag) === (tagToRemove.name || tagToRemove)
  );

  if (index === -1) return;

  try {
    photoTags.value.splice(index, 1);

    // Here you would typically save to backend
    // await saveTagsToPhoto(props.selectedPhoto.id, photoTags.value)

    message.success("Tag removed successfully");
  } catch (error) {
    // Restore the tag if removal failed
    photoTags.value.splice(index, 0, tagToRemove);
    message.error("Failed to remove tag");
    console.error("Remove tag failed:", error);
  }
};

// Description generation
const allPhotoInsights = ref([]);
const currentInsightIndex = ref(0);

// Computed properties for insight availability (simple session-based)
const insightTypesAvailable = computed(() => {
  if (!props.selectedPhoto?.id)
    return { cultural: true, technical: true, artistic: true };

  const photoUsage = sessionPhotoUsage.value.get(props.selectedPhoto.id);
  if (!photoUsage) return { cultural: true, technical: true, artistic: true };

  return {
    cultural: !photoUsage.types.has("cultural"),
    technical: !photoUsage.types.has("technical"),
    artistic: !photoUsage.types.has("artistic"),
  };
});

const customQuestionsRemaining = computed(() => {
  if (!props.selectedPhoto?.id) return MAX_QUESTIONS;

  const photoUsage = sessionPhotoUsage.value.get(props.selectedPhoto.id);
  const usedQuestions = photoUsage?.customQuestions || 0;

  return Math.max(0, MAX_QUESTIONS - usedQuestions);
});

const canUseInsights = computed(() => {
  if (!props.selectedPhoto?.id) return false;

  // If photo already has usage, it's counted
  if (sessionPhotoUsage.value.has(props.selectedPhoto.id)) return true;

  // Check if we're under the session photo limit
  return sessionPhotoCount.value.size < MAX_PHOTOS_INSIGHTS;
});

// Computed property for overall rating - automatically updates when weights change
const overallRating = computed(() => {
  if (!props.selectedPhoto?.descriptions?.artistic_scores) {
    return { average: 0, rating: "N/A", total: 0, count: 0 };
  }

  // Use custom weights if in custom mode, otherwise use the selected genre
  const customWeights =
    selectedGenre.value === "custom" ? artisticScoreWeights.value : null;
  return calculateArtisticScore(
    props.selectedPhoto.descriptions.artistic_scores,
    selectedGenre.value,
    customWeights
  );
});

// Get insight type label for display
const getInsightLabel = (type, question = null) => {
  const labels = {
    cultural: "Cultural Context",
    technical: "Technical Analysis",
    artistic: "Artistic Perspective",
    custom: question
      ? `Q: ${question.substring(0, 50)}${question.length > 50 ? "..." : ""}`
      : "Custom Question",
  };
  return labels[type] || type;
};

// Get specific insight by type
const getSpecificInsight = async (type) => {
  if (!props.selectedPhoto?.id) {
    message.error("No photo selected");
    return;
  }

  // Check if this insight type is available
  const availability = insightTypesAvailable.value;
  if (!availability[type]) {
    message.warning(
      `You've already requested a ${type} insight for this photo in this session`
    );
    return;
  }

  // Check if we can use insights on this photo (session limit)
  if (!canUseInsights.value) {
    message.warning(
      "You've reached your session limit of photos with insights (20 photos)"
    );
    return;
  }

  isGeneratingInsight.value = true;
  pendingInsightLabel.value = getInsightLabel(type);

  try {
    const { data } = await api.get(
      `/api/catalog/photoInsightSpecific/${props.selectedPhoto.id}?type=${type}&provider=gpt`
    );

    if (data && data.insightType) {
      const insightText = data[type] || data.response;
      if (insightText) {
        // Record usage in session
        if (!sessionPhotoUsage.value.has(props.selectedPhoto.id)) {
          sessionPhotoUsage.value.set(props.selectedPhoto.id, {
            types: new Set(),
            customQuestions: 0,
          });
          sessionPhotoCount.value.add(props.selectedPhoto.id);
        }
        sessionPhotoUsage.value.get(props.selectedPhoto.id).types.add(type);

        allPhotoInsights.value.push({
          type: type,
          label: getInsightLabel(type),
          text: insightText,
        });

        // Persist insights for this photo
        sessionPhotoInsights.value.set(props.selectedPhoto.id, {
          insights: allPhotoInsights.value,
          currentIndex: currentInsightIndex.value,
        });
      } else {
        message.warning("No insight content received");
      }
    } else {
      message.warning("No insights found for this photo");
    }
  } catch (error) {
    message.error("Failed to generate insight");
    console.error("Generate insight failed:", error);
  } finally {
    isGeneratingInsight.value = false;
    pendingInsightLabel.value = "";
  }
};

// Submit custom question
const submitCustomQuestion = async () => {
  const question = customInsightQuestion.value.trim();
  if (!question) return;

  if (!props.selectedPhoto?.id) {
    message.error("No photo selected");
    return;
  }

  // Check if we have remaining custom questions
  if (customQuestionsRemaining.value <= 0) {
    message.warning(
      "You've reached the limit of custom questions for this photo in this session (5 max)"
    );
    return;
  }

  // Check if we can use insights on this photo (session limit)
  if (!canUseInsights.value) {
    message.warning(
      "You've reached your session limit of photos with insights (20 photos)"
    );
    return;
  }

  isGeneratingInsight.value = true;
  pendingInsightLabel.value = getInsightLabel("custom", question);
  const savedQuestion = question;
  customInsightQuestion.value = "";

  try {
    const { data } = await api.get(
      `/api/catalog/photoInsightSpecific/${
        props.selectedPhoto.id
      }?type=custom&question=${encodeURIComponent(
        savedQuestion
      )}&provider=gpt`
    );

    if (data && data.response) {
      // Record usage in session
      if (!sessionPhotoUsage.value.has(props.selectedPhoto.id)) {
        sessionPhotoUsage.value.set(props.selectedPhoto.id, {
          types: new Set(),
          customQuestions: 0,
        });
        sessionPhotoCount.value.add(props.selectedPhoto.id);
      }
      sessionPhotoUsage.value.get(props.selectedPhoto.id).customQuestions++;

      allPhotoInsights.value.push({
        type: "custom",
        label: getInsightLabel("custom", savedQuestion),
        text: data.response,
      });

      // Persist insights for this photo
      sessionPhotoInsights.value.set(props.selectedPhoto.id, {
        insights: allPhotoInsights.value,
        currentIndex: currentInsightIndex.value,
      });
    } else {
      message.warning("No response received");
    }
  } catch (error) {
    message.error("Failed to get answer");
    console.error("Custom question failed:", error);
  } finally {
    isGeneratingInsight.value = false;
    pendingInsightLabel.value = "";
  }
};

// Function to highlight matching chunks in text
const highlightMatchingChunks = (text) => {
  if (
    !text ||
    !props.selectedPhoto?.matchingChunks ||
    props.selectedPhoto.matchingChunks.length === 0
  ) {
    return text;
  }

  let highlightedText = text;

  // Sort chunks by length (longest first) to avoid partial replacements
  const sortedChunks = [...props.selectedPhoto.matchingChunks]
    .filter((chunkObj) => chunkObj.chunk && chunkObj.chunk.trim().length > 0)
    .sort((a, b) => b.chunk.length - a.chunk.length);

  sortedChunks.forEach((chunkObj) => {
    const { chunk, isFullQuery, proximity } = chunkObj;
    const className = isFullQuery
      ? "highlighted-chunk-full"
      : "highlighted-chunk";

    // Format proximity for display
    const proximityText = proximity
      ? `Proximity: ${proximity.toFixed(2)}`
      : "No proximity data";
    const queryType = isFullQuery ? " (Full Query)" : " (Partial Query)";
    const tooltipText = proximityText + queryType;

    // Create a case-insensitive regex to find the chunk
    const regex = new RegExp(
      `(${chunk.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi"
    );
    highlightedText = highlightedText.replace(
      regex,
      `<span class="${className}" title="${tooltipText}">$1</span>`
    );
  });

  return highlightedText;
};

// Notes management
const saveNotes = async () => {
  isSavingNotes.value = true;

  try {
    // Here you would typically save to backend
    // await saveNotesToPhoto(props.selectedPhoto.id, photoNotes.value)

    message.success("Functionality coming soon!");
  } catch (error) {
    message.error("Failed to save notes");
    console.error("Save notes failed:", error);
  } finally {
    isSavingNotes.value = false;
  }
};

// Handle ResizeObserver errors gracefully
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    if (e.message && e.message.includes("ResizeObserver loop limit exceeded")) {
      e.stopImmediatePropagation();
    }
  });
}
</script>

<style scoped>
/* Compact header styling - More specific override */

.custom-header {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
}

.header-title {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dialog-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  max-height: calc(
    90vh - 80px
  ); /* Account for compact card header and padding */
  overflow-y: auto;
  overflow-x: hidden;
}

.technical-info-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.technical-info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-lg);
  padding: var(--spacing-md);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
}

.tech-category {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.tech-tag {
  font-size: 11px;
  height: 22px !important;
  border-radius: 4px !important;
  font-family: var(--font-mono);
  font-weight: 500;
  margin: 2px;
}

.photo-display-centered {
  width: 100%;
  height: 330px;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: var(--spacing-lg);
  flex-shrink: 0;
}

.centered-photo {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  object-position: center;
  background-color: transparent;
}

/* Photo overlay with all controls */
.photo-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 2;
}

.photo-overlay > * {
  pointer-events: auto;
}

.top-left-actions {
  position: absolute;
  top: var(--spacing-sm);
  left: var(--spacing-sm);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  max-width: calc(100% - 120px); /* Leave space for close button */
}

.photo-name-text {
  color: white;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.copy-btn {
  opacity: 0.8;
  transition: opacity 0.3s ease;
  background-color: rgba(255, 255, 255, 0.1) !important;
  color: white !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  flex-shrink: 0;
}

.copy-btn:hover {
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.2) !important;
}

.top-right-actions {
  position: absolute;
  top: var(--spacing-sm);
  right: var(--spacing-sm);
}

.close-modal-btn {
  opacity: 0.8;
  transition: opacity 0.3s ease;
  background-color: rgba(0, 0, 0, 0.7) !important;
  backdrop-filter: blur(4px);
  color: white !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
}

.close-modal-btn:hover {
  opacity: 1;
  background-color: rgba(0, 0, 0, 0.8) !important;
}

.bottom-right-actions {
  position: absolute;
  bottom: var(--spacing-sm);
  right: var(--spacing-sm);
  display: flex;
  gap: var(--spacing-sm);
}

.download-btn,
.fullscreen-btn {
  opacity: 0.6;
  transition: opacity 0.3s ease;
  background-color: rgba(0, 0, 0, 0.5) !important;
  backdrop-filter: blur(4px);
  color: white !important;
}

.download-btn:hover,
.fullscreen-btn:hover {
  opacity: 1;
  background-color: rgba(0, 0, 0, 0.7) !important;
}

.technical-data {
  flex: 1;
  min-height: 320px;
  max-height: 320px;
  display: flex;
  flex-direction: column;
}

.visual-aspects-content,
.exif-data-content,
.photo-info-content {
  padding: var(--spacing-sm);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: visible;
}

.visual-aspects-container {
  flex: 1;
}

.visual-aspects-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--bg-surface);
}

.visual-category {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.category-title {
  margin: 0;
  font-size: calc(var(--font-size-xs) - 1px);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  text-transform: capitalize;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: calc(var(--spacing-xs) / 2);
}

.category-tags {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--spacing-xs) / 2);
}

.visual-tag {
  font-size: 10px;
  /* padding: 1px 4px !important; */
  /* line-height: 1.2 !important; */
  height: 20px !important;
  border-radius: 3px !important;
}

.exif-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--bg-surface);
}

.photo-info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: var(--bg-surface);
}

.exif-category,
.info-category {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.exif-tag,
.info-tag {
  font-size: 11px;
  height: 22px !important;
  border-radius: 4px !important;
  font-family: var(--font-mono);
  font-weight: 500;
}

.exif-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: calc(var(--spacing-xs) / 2) var(--spacing-xs);
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  border: 1px solid var(--border-color);
  min-height: 24px;
}

.exif-label {
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  font-size: calc(var(--font-size-xs) - 1px);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.exif-value {
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: calc(var(--font-size-xs));
  font-weight: 500;
}

.photo-display {
  width: 100%;
  height: 400px;
  min-height: 400px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: var(--spacing-md);
  flex-shrink: 0;
}

.main-photo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  background-color: transparent;
}

.info-sections {
  flex: 1;
}

/* Lateral tabs styling */
.info-sections :deep(.n-tabs) {
  height: 100%;
}

.info-sections :deep(.n-tabs-nav) {
  min-width: 140px !important;
  width: 140px !important;
}

.info-sections :deep(.n-tabs-tab) {
  justify-content: flex-start !important;
  padding: var(--spacing-md) var(--spacing-sm) !important;
  min-height: 48px !important;
}

.info-sections :deep(.n-tabs-content) {
  padding: 0 !important;
  flex: 1;
}

.info-sections :deep(.n-tab-pane) {
  padding: var(--spacing-lg) !important;
  height: 100%;
  overflow-y: auto;
}

.tab-content {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.tab-content span {
  white-space: nowrap;
}

.tab-panel-content {
  height: 100%;
  overflow: visible;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--spacing-xs);
}

.metadata-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--bg-surface);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}

.metadata-item .label {
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
}

.metadata-item .value {
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.tags-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.grouped-tags {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.tag-group-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.tag-group-label {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tag-group-content {
  padding: var(--spacing-lg);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border-left: 4px solid var(--primary-color);
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
}

.photo-tag {
  margin: 0;
  /* background-color: var(--secondary-color) !important;
  color: var(--text-primary) !important; */
}

.add-tag-section {
  max-width: 300px;
}

.descriptions-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.section-title {
  margin: 0 0 var(--spacing-md) 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  border-bottom: 2px solid var(--border-color);
  padding-bottom: var(--spacing-sm);
}

.ai-descriptions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.description-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.description-label {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.custom-description-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.generate-section {
  text-align: center;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-color);
}

.generate-section-centered {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--spacing-xl);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-color);
  min-height: 200px;
}

.generate-insight-btn {
  max-width: 200px;
}

.generating-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  padding: var(--spacing-xl);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  min-height: 200px;
}

.generating-text {
  margin: 0;
  color: var(--text-secondary);
}

/* Insights Panel Styles */
.insights-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 280px;
}

.insights-display-area {
  flex: 1;
  overflow-y: auto;
  margin-bottom: var(--spacing-md);
}

.insights-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 180px;
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border: 2px dashed var(--border-color);
}

.placeholder-icon {
  color: var(--primary-color);
  opacity: 0.6;
  margin-bottom: var(--spacing-md);
}

.placeholder-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  /* margin-bottom: var(--spacing-sm); */
}

.placeholder-subtitle {
  margin: var(--spacing-xs) 0 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  max-width: 280px;
}

.insights-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.insight-item {
  animation: fadeInUp 0.3s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.insight-loading {
  margin-top: var(--spacing-md);
}

.insight-item.loading .description-content {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.loading-content {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-height: 40px;
}

.loading-text {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.insights-control-panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}

.preset-buttons {
  display: flex;
  gap: var(--spacing-sm);
  justify-content: stretch;
  flex-wrap: nowrap;
  width: 100%;
}

.preset-btn {
  flex: 1;
  min-width: 0;
}

.preset-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.custom-question-input {
  width: 100%;
}

.custom-question-input :deep(.n-input) {
  background: var(--bg-card);
}

.send-btn {
  padding: 0 var(--spacing-xs);
  color: var(--primary-color);
  transition: transform 0.2s ease;
}

.send-btn:hover:not(:disabled) {
  transform: scale(1.1);
}

.send-btn:disabled {
  opacity: 0.4;
}

.description-display {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.description-content {
  padding: var(--spacing-lg);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border-left: 4px solid var(--primary-color);
}

.description-content p {
  margin: 0;
  line-height: 1.6;
  color: var(--text-primary);
}

.review-paragraph {
  margin-bottom: var(--spacing-md) !important;
  text-align: justify;
}

.review-paragraph:last-child {
  margin-bottom: 0 !important;
}

.overall-rating-container {
  padding: var(--spacing-lg);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border-left: 4px solid var(--primary-color);
  border-top: 2px solid var(--primary-color);
}

.overall-rating {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-md);
}

.overall-label {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.overall-score {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.overall-value {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.overall-rating-text {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.rating-disastrous {
  background: #7f1d1d;
  color: white;
}

.rating-very-poor {
  background: #b91c1c;
  color: white;
}

.rating-poor {
  background: #ef4444;
  color: white;
}

.rating-needs-improvement {
  background: #f87171;
  color: white;
}

.rating-acceptable {
  background: #f59e0b;
  color: white;
}

.rating-good {
  background: #10b981;
  color: white;
}

.rating-very-good {
  background: #22d3ee;
  color: white;
}

.rating-remarkable {
  background: #3b82f6;
  color: white;
}

.rating-excellent {
  background: #6366f1;
  color: white;
}

.rating-outstanding {
  background: #7c3aed;
  color: white;
}

.genre-presets-container {
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border-left: 4px solid var(--accent-color, #8b5cf6);
  border: 1px solid var(--border-color);
}

.genre-header {
  margin-bottom: var(--spacing-md);
  text-align: center;
}

.genre-title {
  margin: 0 0 var(--spacing-xs) 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.genre-subtitle {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.genre-buttons {
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.genre-button {
  min-width: 120px;
  transition: all 0.3s ease;
  position: relative;
}

.genre-button:hover {
  transform: translateY(-2px);
}

.custom-button {
  background: var(--bg-card) !important;
  border: 2px dashed var(--border-color) !important;
}

.weights-configuration-container {
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-lg);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border-left: 4px solid var(--secondary-color);
  border: 1px solid var(--border-color);
}

.weights-header {
  margin-bottom: var(--spacing-md);
  text-align: center;
}

.weights-title {
  margin: 0 0 var(--spacing-xs) 0;
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.artistic-scores-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  border-left: 4px solid var(--primary-color);
  max-height: 400px;
  overflow-y: auto;
}

.artistic-scores-grid::-webkit-scrollbar {
  width: 6px;
}

.artistic-scores-grid::-webkit-scrollbar-track {
  background: var(--bg-surface);
  border-radius: 3px;
}

.artistic-scores-grid::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.artistic-scores-grid::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}

.score-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-md);
  padding: 5px;
  transition: all 0.3s ease;
  position: relative;
}

.score-item::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: calc(
    var(--weight-scale, 0) * (140px + var(--spacing-sm))
  ); /* Dynamic width based on weight */
  height: 100%;
  background: linear-gradient(
    90deg,
    var(--primary-color) 0%,
    rgba(59, 130, 246, 0.4) 80%,
    rgba(59, 130, 246, 0.1) 100%
  );
  border-radius: var(--radius-sm);
  transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0.25;
  z-index: 0;
}

.score-item.bonus-item::before {
  background: linear-gradient(
    90deg,
    #f59e0b 0%,
    rgba(245, 158, 11, 0.4) 80%,
    rgba(245, 158, 11, 0.1) 100%
  );
}

.score-item:hover::before {
  opacity: 0.4;
  transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
}

.score-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  min-width: 140px;
  flex-shrink: 0;
  padding: var(--spacing-xs) var(--spacing-sm);
  position: relative;
  z-index: 1;
  border-radius: var(--radius-sm);
  transition: all 0.3s ease;
}

/* .score-label::after {
  content: attr(data-weight);
  position: absolute;
  right: -25px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: var(--text-tertiary);
  background: var(--bg-card);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: var(--font-mono);
  opacity: var(--weight-opacity, 0.7);
  transition: opacity 0.3s ease;
} */

.score-bar-container {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex: 1;
}

.score-bar {
  flex: 1;
  height: 8px;
  background: var(--border-color);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.score-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease, opacity 0.3s ease;
  position: relative;
  z-index: 1;
}

.score-fill.score-disastrous {
  background: linear-gradient(90deg, #7f1d1d, #991b1b);
}

.score-fill.score-needs-improvement {
  background: linear-gradient(90deg, #ef4444, #f87171);
}

.score-fill.score-acceptable {
  background: linear-gradient(90deg, #f59e0b, #fbbf24);
}

.score-fill.score-good {
  background: linear-gradient(90deg, #10b981, #34d399);
}

.score-fill.score-remarkable {
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
}

.score-fill.score-outstanding {
  background: linear-gradient(90deg, #7c3aed, #a855f7);
}

.score-value {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
  min-width: 40px;
  text-align: right;
  font-family: var(--font-mono);
  display: flex;
  align-items: center;
  gap: 1px;
}

.score-number {
  color: var(--text-primary);
  font-weight: var(--font-weight-bold);
}

.max-score {
  color: var(--text-secondary);
}

.regenerate-btn {
  align-self: flex-start;
}

.notes-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.notes-actions {
  display: flex;
  justify-content: flex-end;
}

/* Highlighted chunks styling */
:deep(.highlighted-chunk) {
  background-color: rgba(255, 193, 7, 0.3);
  border-radius: 4px;
  padding: 2px 4px;
  font-weight: 500;
  border: 1px solid rgba(255, 193, 7, 0.5);
  cursor: help;
  transition: all 0.2s ease;
}

:deep(.highlighted-chunk:hover) {
  background-color: rgba(255, 193, 7, 0.5);
  border-color: rgba(255, 193, 7, 0.8);
  transform: translateY(-1px);
}

:deep(.highlighted-chunk-full) {
  background-color: rgba(40, 167, 69, 0.3);
  border-radius: 4px;
  padding: 2px 4px;
  font-weight: 600;
  border: 1px solid rgba(40, 167, 69, 0.5);
  color: #1e7e34;
  cursor: help;
  transition: all 0.2s ease;
}

:deep(.highlighted-chunk-full:hover) {
  background-color: rgba(40, 167, 69, 0.5);
  border-color: rgba(40, 167, 69, 0.8);
  transform: translateY(-1px);
}

/* Tablet/Medium screens */
@media (max-width: 1024px) and (min-width: 769px) {
  .photo-display-centered {
    height: 320px;
  }

  .technical-info-grid {
    grid-template-columns: 1fr;
    gap: var(--spacing-md);
  }
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .top-left-actions {
    top: var(--spacing-xs);
    left: var(--spacing-xs);
    padding: calc(var(--spacing-xs) / 2) var(--spacing-sm);
    max-width: calc(100% - 100px);
  }

  .photo-name-text {
    font-size: calc(var(--font-size-sm) - 1px);
  }

  .top-right-actions {
    top: var(--spacing-xs);
    right: var(--spacing-xs);
  }

  .bottom-right-actions {
    bottom: var(--spacing-xs);
    right: var(--spacing-xs);
    gap: calc(var(--spacing-xs));
  }

  .photo-display-centered {
    height: 280px;
  }

  .technical-info-grid {
    grid-template-columns: 1fr;
    gap: var(--spacing-md);
  }

  .tech-tag {
    font-size: calc(var(--font-size-xs) - 2px);
    height: 18px !important;
  }
}

/* Extra small mobile devices */
@media (max-width: 480px) {
  .technical-info-grid {
    grid-template-columns: 1fr;
    gap: var(--spacing-sm);
  }

  .photo-display-centered {
    height: 240px;
  }

  .metadata-grid {
    grid-template-columns: 1fr;
  }

  .metadata-item {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-xs);
  }

  .exif-label {
    font-size: calc(var(--font-size-xs) - 1px);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
  }

  .exif-value {
    font-size: var(--font-size-sm);
    color: var(--text-primary);
    word-break: break-word;
  }

  .add-tag-section {
    max-width: 100%;
  }

  .overall-rating {
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm);
    text-align: center;
  }

  .overall-score {
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .genre-buttons {
    flex-direction: column;
    align-items: center;
  }

  .genre-button {
    min-width: 200px;
    width: 100%;
    max-width: 250px;
  }

  .score-item {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-sm);
  }

  .score-label {
    min-width: auto;
    text-align: center;
    font-size: var(--font-size-xs);
  }

  .score-bar-container {
    justify-content: center;
  }

  .score-value {
    min-width: auto;
    text-align: center;
  }
}

/* Custom tooltip styling */
:deep(.n-tooltip__content) {
  background-color: #1a1a1f !important;
  border: 1px solid #2c2c32 !important;
  border-radius: 8px !important;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
  max-width: 280px !important;
  padding: 12px !important;
}

/* Fullscreen Photo Modal Styles */
.fullscreen-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  cursor: pointer;
  padding: 40px;
  box-sizing: border-box;
}

.fullscreen-content {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}

.fullscreen-photo {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  object-position: center;
  border-radius: var(--radius-md);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.close-fullscreen-btn {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.15) !important;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3) !important;
  color: white !important;
  transition: all 0.3s ease;
  z-index: 10001;
  width: 44px;
  height: 44px;
}

.close-fullscreen-btn:hover {
  background: rgba(255, 255, 255, 0.25) !important;
  border-color: rgba(255, 255, 255, 0.5) !important;
  transform: scale(1.1);
}

/* Responsive adjustments for fullscreen */
@media (max-width: 768px) {
  .fullscreen-container {
    padding: 20px;
  }

  .close-fullscreen-btn {
    top: 15px;
    right: 15px;
    width: 40px;
    height: 40px;
  }
}
@media (max-height: 600px) {
  .fullscreen-container {
    padding: 20px;
  }
}

/* Photo transition animations - Slide effect */
/* Slide to the left (next photo) */
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
}

.slide-left-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

/* Slide to the right (previous photo) */
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
}

.slide-right-enter-from {
  transform: translateX(-100%);
  opacity: 0;
}

.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* Navigation Arrows */
.nav-arrow {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10001;
  background: rgba(0, 0, 0, 0.6) !important;
  backdrop-filter: blur(8px);
  border: 2px solid rgba(255, 255, 255, 0.2) !important;
  width: 56px;
  height: 56px;
  transition: all 0.3s ease;
  opacity: 0.7;
  color: white !important;
}

.nav-arrow:hover:not(:disabled) {
  opacity: 1;
  background: rgba(0, 0, 0, 0.8) !important;
  border-color: rgba(255, 255, 255, 0.4) !important;
  transform: translateY(-50%) scale(1.1);
}

.nav-arrow:active:not(:disabled) {
  transform: translateY(-50%) scale(0.95);
}

.nav-arrow:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.nav-arrow-left {
  left: 24px;
}

.nav-arrow-right {
  right: 24px;
}

/* Photo Counter */
.photo-counter {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  color: white;
  padding: 10px 20px;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.2);
  z-index: 10001;
  user-select: none;
  -webkit-user-select: none;
  letter-spacing: 0.5px;
}

/* Responsive for navigation arrows */
@media (max-width: 768px) {
  .nav-arrow {
    width: 48px;
    height: 48px;
  }

  .nav-arrow-left {
    left: 12px;
  }

  .nav-arrow-right {
    right: 12px;
  }

  .photo-counter {
    bottom: 20px;
    font-size: 12px;
    padding: 8px 16px;
  }
}

@media (max-height: 600px) {
  .nav-arrow {
    width: 44px;
    height: 44px;
  }

  .photo-counter {
    bottom: 16px;
  }
}

/* Override modal styles for fullscreen */
:deep(.n-modal-mask) {
  background-color: transparent !important;
}

:deep(.n-modal-container) {
  background: transparent !important;
}
</style>
