<template>
  <n-modal
    v-model:show="visibleModel"
    preset="card"
    :style="{ maxWidth: '90vw', width: '900px', maxHeight: '90vh' }"
    :show-icon="false"
    :closable="true"
    :trap-focus="false"
    @close="visibleModel = false"
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
          @click="emit('copy-name')"
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
      <div class="photo-display-centered" @mousemove="showActionBar = true">
        <!-- Navigation Arrow Left -->
        <n-button
          v-if="canNavigate && hasPreviousPhoto"
          class="dialog-nav-arrow dialog-nav-arrow-left"
          size="small"
          circle
          quaternary
          @click="
            showActionBar = false;
            emit('photo-navigate', currentPhotoIndex - 1);
          "
          title="Previous photo (←)"
        >
          <template #icon>
            <n-icon size="18">
              <ChevronBack />
            </n-icon>
          </template>
        </n-button>

        <img
          :src="selectedPhoto?.thumbnailUrl"
          :alt="selectedPhoto?.filename || selectedPhoto?.name || 'Photo'"
          class="centered-photo"
          @error="emit('image-error', $event)"
        />

        <!-- Navigation Arrow Right -->
        <n-button
          v-if="canNavigate && hasNextPhoto"
          class="dialog-nav-arrow dialog-nav-arrow-right"
          size="small"
          circle
          quaternary
          @click="
            showActionBar = false;
            emit('photo-navigate', currentPhotoIndex + 1);
          "
          title="Next photo (→)"
        >
          <template #icon>
            <n-icon size="18">
              <ChevronForward />
            </n-icon>
          </template>
        </n-button>

        <!-- Floating Action Bar centered on hover -->
        <div class="photo-action-bar-overlay">
          <FloatingActionBar
            :embedded="true"
            :selected-ids="selectedPhoto?.id ? [selectedPhoto.id] : []"
            :show-delete="showDelete"
            :show-add-to-collection="showAddToCollection"
            :show-move-to-tool="showMoveToTool"
            :show-send-to-chat="showSendToChat"
            @delete="emit('delete-photo')"
            @download="emit('download')"
            @add-to-collection="emit('add-to-collection')"
            @move-to-tool="emit('move-to-tool')"
            @send-to-chat="emit('send-to-chat')"
          />
        </div>

        <!-- Photo Overlay with Actions Only -->
        <div class="photo-overlay">
          <!-- Bottom left: Curation flag + photo credit badge (if available) -->
          <div class="bottom-left-actions">
            <div
              class="flag-control"
              :class="`flag-${selectedPhoto?.flag || 'none'}`"
              @click="emit('set-flag')"
              :title="
                selectedPhoto?.flag === 'picked'
                  ? 'Picked (click to reject)'
                  : selectedPhoto?.flag === 'rejected'
                    ? 'Rejected (click to clear)'
                    : 'Unflagged (click to pick)'
              "
            >
              <n-icon size="16">
                <FlagOutlineIcon />
              </n-icon>
            </div>

            <a
              v-if="photoCredit"
              :href="photoCredit.url"
              target="_blank"
              rel="noopener noreferrer"
              class="photo-credit-badge"
              :title="`Photo by ${photoCredit.username}`"
            >
              <n-icon size="16">
                <LogoInstagram />
              </n-icon>
              <span>{{ photoCredit.username }}</span>
            </a>
          </div>

          <!-- Bottom right: Download + Fullscreen -->
          <div class="bottom-right-actions">
            <!-- <n-button
              size="small"
              @click="emit('download')"
              title="Download photo"
              quaternary
              class="download-btn"
            >
              <template #icon>
                <n-icon size="18">
                  <DownloadIcon />
                </n-icon>
              </template>
            </n-button> -->
            <n-button
              size="small"
              quaternary
              class="fullscreen-btn"
              @click="emit('open-fullscreen')"
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
        <n-tabs
          type="line"
          placement="left"
          size="large"
          animated
          v-model:value="activeTab"
        >
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
                        <!-- Genre Presets -->
                        <div class="genre-presets-container">
                          <n-select
                            class="genre-select"
                            size="small"
                            :value="selectedGenre"
                            :options="genrePresetOptions"
                            :render-label="renderGenreOptionLabel"
                            :fallback-option="false"
                            @update:value="
                              (value) => emit('apply-genre-preset', value)
                            "
                          />
                        </div>

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
                          :modelValue="artisticScoreWeights"
                          @update:modelValue="
                            emit('update:artistic-score-weights', $event)
                          "
                          :format-criterion-name="formatCriterionName"
                        />
                      </div>

                      <div class="artistic-scores-grid">
                        <div
                          v-for="scoreData in orderedArtisticScores"
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
                              <span class="max-score"
                                >/{{ scoreScale.max }}</span
                              >
                            </span>
                          </div>
                        </div>
                      </div>
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
                <div
                  v-if="Object.keys(groupedTags).length > 0"
                  class="grouped-tags"
                >
                  <!-- Contextual -->
                  <div v-if="groupedTags['contextual']" class="tag-group-item">
                    <h5 class="tag-group-label">Contextual</h5>
                    <div class="tag-group-content">
                      <div class="tags-list">
                        <n-tag
                          v-for="tag in groupedTags['contextual']"
                          :key="tag.id || tag.name"
                          type="info"
                          :bordered="false"
                          class="photo-tag"
                        >
                          {{ tag.name || tag }}
                        </n-tag>
                      </div>
                    </div>
                  </div>

                  <!-- Technical -->
                  <div v-if="groupedTags['technical']" class="tag-group-item">
                    <h5 class="tag-group-label">Technical</h5>
                    <div class="tag-group-content">
                      <div class="tags-list">
                        <n-tag
                          v-for="tag in groupedTags['technical']"
                          :key="tag.id || tag.name"
                          type="info"
                          :bordered="false"
                          class="photo-tag"
                        >
                          {{ tag.name || tag }}
                        </n-tag>
                      </div>
                    </div>
                  </div>

                  <!-- Artistic -->
                  <div v-if="groupedTags['artistic']" class="tag-group-item">
                    <h5 class="tag-group-label">Artistic</h5>
                    <div class="tag-group-content">
                      <div class="tags-list">
                        <n-tag
                          v-for="tag in groupedTags['artistic']"
                          :key="tag.id || tag.name"
                          type="info"
                          :bordered="false"
                          class="photo-tag"
                        >
                          {{ tag.name || tag }}
                        </n-tag>
                      </div>
                    </div>
                  </div>

                  <!-- Miscellaneous -->
                  <div
                    v-if="groupedTags['miscellaneous']"
                    class="tag-group-item"
                  >
                    <h5 class="tag-group-label">Miscellaneous</h5>
                    <div class="tag-group-content">
                      <div class="tags-list">
                        <n-tag
                          v-for="tag in groupedTags['miscellaneous']"
                          :key="tag.id || tag.name"
                          type="info"
                          :bordered="false"
                          class="photo-tag"
                        >
                          {{ tag.name || tag }}
                        </n-tag>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </n-tab-pane>

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
                                selectedPhoto.descriptions.EXIF.dateTaken,
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
                            selectedPhoto.descriptions.EXIF.exposureTime,
                          )
                        }}
                      </n-tag>
                    </div>
                  </div>

                  <!-- Genre -->
                  <div class="tech-category">
                    <h6 class="category-title">Genre</h6>
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
                        {{ formatCategoryName(perspective) }} perspective
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
                        {{ formatCategoryName(dof) }} DoF
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
                        v-if="selectedPhoto?.descriptions?.EXIF?.flash"
                        type="info"
                        class="tech-tag"
                      >
                        {{
                          formatFlashValue(
                            selectedPhoto.descriptions.EXIF.flash,
                          )
                        }}
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

                  <!-- Color Style -->
                  <div class="tech-category">
                    <h6 class="category-title">Color Style</h6>
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
                        {{ formatCategoryName(temp) }} temperature
                      </n-tag>
                    </div>
                  </div>

                  <!-- Stylistic -->
                  <div class="tech-category">
                    <h6 class="category-title">Stylistic</h6>
                    <div class="category-tags">
                      <n-tag
                        v-if="
                          selectedPhoto?.descriptions?.visual_aspects?.stylistic
                            ?.length > 0
                        "
                        v-for="style in selectedPhoto.descriptions
                          .visual_aspects.stylistic"
                        :key="style"
                        type="info"
                        class="tech-tag"
                      >
                        {{ formatCategoryName(style) }}
                      </n-tag>
                      <n-tag
                        v-if="
                          !selectedPhoto?.descriptions?.visual_aspects
                            ?.stylistic ||
                          selectedPhoto.descriptions.visual_aspects.stylistic
                            .length === 0
                        "
                        type="warning"
                        class="tech-tag"
                      >
                        None
                      </n-tag>
                    </div>
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
                <!-- Header Section -->
                <div class="notes-header">
                  <div class="notes-title-container">
                    <n-icon size="24" class="notes-icon">
                      <EditIcon />
                    </n-icon>
                    <h5 class="notes-title">Personal Notes</h5>
                  </div>
                  <p class="notes-subtitle">
                    Add your thoughts, memories, or context about this photo.
                    Your notes will be used for searches.
                  </p>
                </div>

                <!-- Notes Input Area -->
                <div class="notes-input-area">
                  <n-input
                    :value="photoNotes"
                    @update:value="emit('update:photo-notes', $event)"
                    type="textarea"
                    placeholder="Example: Taken during our summer vacation in Barcelona. The lighting was amazing that evening..."
                    :autosize="{ minRows: 6, maxRows: 10 }"
                    @input="emit('update-word-count')"
                  />
                </div>

                <!-- Actions -->
                <div class="notes-actions">
                  <div
                    class="word-counter"
                    :class="{ 'word-limit-exceeded': wordCount > 50 }"
                  >
                    {{ wordCount }} / 50 words
                  </div>
                  <div class="notes-buttons-group">
                    <n-button
                      size="small"
                      type="primary"
                      @click="emit('save-notes')"
                      :loading="isSavingNotes"
                      :disabled="wordCount > 50"
                    >
                      {{
                        selectedPhoto?.descriptions?.notes
                          ? "Update Notes"
                          : "Save Notes"
                      }}
                    </n-button>
                    <span v-if="wordCount > 50" class="error-text">
                      Please reduce to 50 words or less
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </n-tab-pane>

          <!-- Library Tab -->
          <n-tab-pane name="library" display-directive="show:lazy">
            <template #tab>
              <div class="tab-content">
                <n-icon size="18">
                  <LibraryIcon />
                </n-icon>
                <span>Library</span>
              </div>
            </template>
            <div class="tab-panel-content">
              <div class="tags-section">
                <div
                  v-if="
                    photoLibrary.collections.length > 0 ||
                    photoLibrary.series.length > 0 ||
                    photoLibrary.portfolios.length > 0
                  "
                  class="grouped-tags"
                >
                  <!-- Collections -->
                  <div
                    v-if="photoLibrary.collections.length > 0"
                    class="tag-group-item"
                  >
                    <h5 class="tag-group-label">Collections</h5>
                    <div class="tag-group-content">
                      <div class="tags-list">
                        <n-tag
                          v-for="collection in photoLibrary.collections"
                          :key="'col-' + collection.id"
                          type="info"
                          :bordered="false"
                          class="photo-tag library-tag"
                          @click="
                            navigateTo('collection-detail', collection.id)
                          "
                        >
                          {{ collection.name }}
                        </n-tag>
                      </div>
                    </div>
                  </div>

                  <!-- Series -->
                  <div
                    v-if="photoLibrary.series.length > 0"
                    class="tag-group-item"
                  >
                    <h5 class="tag-group-label">Series</h5>
                    <div class="tag-group-content">
                      <div class="tags-list">
                        <n-tag
                          v-for="s in photoLibrary.series"
                          :key="'ser-' + s.id"
                          type="info"
                          :bordered="false"
                          class="photo-tag library-tag"
                          @click="navigateTo('series-detail', s.id)"
                        >
                          {{ s.name }}
                        </n-tag>
                      </div>
                    </div>
                  </div>

                  <!-- Portfolios -->
                  <div
                    v-if="photoLibrary.portfolios.length > 0"
                    class="tag-group-item"
                  >
                    <h5 class="tag-group-label">Portfolios</h5>
                    <div class="tag-group-content">
                      <div class="tags-list">
                        <n-tag
                          v-for="portfolio in photoLibrary.portfolios"
                          :key="'port-' + portfolio.id"
                          type="info"
                          :bordered="false"
                          class="photo-tag library-tag"
                          @click="navigateTo('portfolio-detail', portfolio.id)"
                        >
                          {{ portfolio.name }}
                        </n-tag>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-else class="library-empty-state">
                  <n-icon size="48" color="var(--text-tertiary)">
                    <LibraryIcon />
                  </n-icon>
                  <p class="empty-text">
                    This photo is not in any collection, series or portfolio
                    yet.
                  </p>
                </div>
              </div>
            </div>
          </n-tab-pane>

          <!-- Similar Photos Tab -->
          <n-tab-pane name="similar" display-directive="show:lazy">
            <template #tab>
              <div class="tab-content">
                <n-icon size="18">
                  <SimilarIcon />
                </n-icon>
                <span>Similar</span>
              </div>
            </template>
            <div class="tab-panel-content">
              <SimilarPhotosSection
                :selected-photo="selectedPhoto"
                @navigate-to-photo="(photo) => emit('navigate-to-photo', photo)"
              />
            </div>
          </n-tab-pane>

          <!-- Geo Tab -->
          <n-tab-pane name="geo" display-directive="show:lazy">
            <template #tab>
              <div class="tab-content">
                <n-icon size="18">
                  <GlobeOutline />
                </n-icon>
                <span>Geo</span>
              </div>
            </template>
            <div class="tab-panel-content">
              <PhotoGeoTab
                :photo="selectedPhoto"
                @request-close="emit('update:visible', false)"
              />
            </div>
          </n-tab-pane>

          <!-- Insights tab (hidden) -->
          <!--
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
                <div class="insights-display-area">
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
                  <div v-if="isGeneratingInsight" class="insight-loading">
                    <div class="description-item insight-item loading">
                      <h5 class="description-label">
                        {{ pendingInsightLabel }}
                      </h5>
                      <div class="description-content loading-content">
                        <SpiralGridLoader variant="primary" :size="24" />
                        <span class="loading-text">Analyzing image...</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="insights-control-panel">
                  <div class="preset-buttons">
                    <n-button type="primary" size="small" @click="emit('get-insight', 'cultural')" :disabled="isGeneratingInsight || !insightTypesAvailable.cultural || !canUseInsights" class="preset-btn">
                      <template #icon><n-icon size="16"><GlobeOutline /></n-icon></template>
                      Cultural
                    </n-button>
                    <n-button type="primary" size="small" @click="emit('get-insight', 'technical')" :disabled="isGeneratingInsight || !insightTypesAvailable.technical || !canUseInsights" class="preset-btn">
                      <template #icon><n-icon size="16"><SettingsOutline /></n-icon></template>
                      Technical
                    </n-button>
                    <n-button type="primary" size="small" @click="emit('get-insight', 'artistic')" :disabled="isGeneratingInsight || !insightTypesAvailable.artistic || !canUseInsights" class="preset-btn">
                      <template #icon><n-icon size="16"><BrushOutline /></n-icon></template>
                      Artistic
                    </n-button>
                  </div>
                  <div class="custom-question-input">
                    <n-input :value="customInsightQuestion" @update:value="emit('update:custom-insight-question', $event)" placeholder="Ask anything about this photo..." :disabled="isGeneratingInsight || customQuestionsRemaining <= 0 || !canUseInsights" @keydown.enter="emit('submit-custom-question')" size="small">
                      <template #suffix>
                        <n-button text :disabled="!customInsightQuestion.trim() || isGeneratingInsight || customQuestionsRemaining <= 0 || !canUseInsights" @click="emit('submit-custom-question')" class="send-btn">
                          <n-icon size="18"><SendOutline /></n-icon>
                        </n-button>
                      </template>
                    </n-input>
                  </div>
                </div>
              </div>
            </div>
          </n-tab-pane>
          -->
        </n-tabs>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { computed, h, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useActivityLogger } from "@/composables/useActivityLogger";
import {
  NModal,
  NIcon,
  NButton,
  NTag,
  NInput,
  NTooltip,
  NSelect,
  NTabs,
  NTabPane,
} from "naive-ui";
import SpiralGridLoader from "../../SpiralGridLoader.vue";
import CustomArtisticWeights from "../../CustomArtisticWeights.vue";
import FloatingActionBar from "../../FloatingActionBar.vue";
import SimilarPhotosSection from "../SimilarPhotosSection.vue";
import PhotoGeoTab from "../PhotoGeoTab.vue";

// Icons
import {
  CameraOutline,
  CopyOutline as CopyIcon,
  DownloadOutline as DownloadIcon,
  InformationCircleOutline as InfoIcon,
  PricetagOutline as TagIcon,
  SparklesOutline as SparklesIcon,
  CreateOutline as EditIcon,
  WalkOutline,
  GlobeOutline,
  SettingsOutline,
  BrushOutline,
  SendOutline,
  LogoInstagram,
  LibraryOutline as LibraryIcon,
  GitCompareOutline as SimilarIcon,
  ChevronBackOutline as ChevronBack,
  ChevronForwardOutline as ChevronForward,
  FlagOutline as FlagOutlineIcon,
} from "@vicons/ionicons5";
import { FullscreenOutlined } from "@vicons/material";
import { Trophy20Regular as ScoresIcon } from "@vicons/fluent";
import { BookOpen16Regular } from "@vicons/fluent";
import { PaletteOutlined } from "@vicons/material";

defineOptions({ name: "PhotoInfoDesktopLayout" });

const router = useRouter();

const props = defineProps({
  visible: { type: Boolean, default: false },
  selectedPhoto: { type: Object, default: null },
  groupedTags: { type: Object, default: () => ({}) },
  photoNotes: { type: String, default: "" },
  wordCount: { type: Number, default: 0 },
  isSavingNotes: { type: Boolean, default: false },
  overallRating: {
    type: Object,
    default: () => ({ average: 0, rating: "N/A" }),
  },
  scoreScale: { type: Object, default: () => ({ max: 9 }) },
  selectedGenre: { type: String, default: "general" },
  showCustomWeights: { type: Boolean, default: false },
  artisticScoreWeights: { type: Object, default: () => ({}) },
  orderedArtisticScores: { type: Array, default: () => [] },
  allPhotoInsights: { type: Array, default: () => [] },
  isGeneratingInsight: { type: Boolean, default: false },
  pendingInsightLabel: { type: String, default: "" },
  customInsightQuestion: { type: String, default: "" },
  customQuestionsRemaining: { type: Number, default: 3 },
  insightTypesAvailable: {
    type: Object,
    default: () => ({ cultural: true, technical: true, artistic: true }),
  },
  canUseInsights: { type: Boolean, default: true },
  photoLibrary: {
    type: Object,
    default: () => ({ collections: [], series: [] }),
  },
  photoCredit: { type: Object, default: null },
  showDelete: { type: Boolean, default: true },
  showAddToCollection: { type: Boolean, default: true },
  showMoveToTool: { type: Boolean, default: true },
  showSendToChat: { type: Boolean, default: false },
  allPhotos: { type: Array, default: () => [] },
  currentPhotoIndex: { type: Number, default: -1 },
  formatDate: { type: Function, default: (d) => d },
  formatExposureTime: { type: Function, default: (e) => e },
  formatCategoryName: { type: Function, default: (c) => c },
  formatCriterionName: { type: Function, default: (c) => c },
  formatGenreTooltip: { type: Function, default: () => "" },
  getScoreBgColor: { type: Function, default: () => "#ccc" },
  availableGenrePresets: {
    type: Array,
    default: () => [
      { key: "general", label: "General", icon: null },
      { key: "street", label: "Street", icon: null },
      { key: "documentary", label: "Documentary", icon: null },
      { key: "abstract", label: "Artistic", icon: null },
    ],
  },
});

const emit = defineEmits([
  "update:visible",
  "copy-name",
  "image-error",
  "download",
  "open-fullscreen",
  "update:photo-notes",
  "update-word-count",
  "save-notes",
  "apply-genre-preset",
  "update:artistic-score-weights",
  "get-insight",
  "update:custom-insight-question",
  "submit-custom-question",
  "delete-photo",
  "add-to-collection",
  "move-to-tool",
  "send-to-chat",
  "navigate-to-photo",
  "photo-navigate",
  "set-flag",
]);

// Navigation computed
const hasPreviousPhoto = computed(() => {
  return props.allPhotos?.length > 0 && props.currentPhotoIndex > 0;
});

const hasNextPhoto = computed(() => {
  return (
    props.allPhotos?.length > 0 &&
    props.currentPhotoIndex < props.allPhotos.length - 1
  );
});

const canNavigate = computed(() => {
  return props.allPhotos?.length > 1;
});

const genrePresetOptions = computed(() => {
  return props.availableGenrePresets.map((preset) => ({
    label: preset.label,
    value: preset.key,
    icon: preset.icon,
  }));
});

const renderGenreOptionLabel = (option) => {
  return h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
      },
    },
    [
      option.icon
        ? h(
            NIcon,
            { size: 16 },
            {
              default: () => h(option.icon),
            },
          )
        : null,
      h("span", option.label),
    ],
  );
};

const visibleModel = computed({
  get: () => props.visible,
  set: (value) => emit("update:visible", value),
});

const navigateTo = (routeName, id) => {
  emit("update:visible", false);
  router.push({ name: routeName, params: { id } });
};

const formatFlashValue = (flash) => {
  if (!flash) return "";

  if (typeof flash === "string") {
    return flash;
  }

  if (typeof flash === "object") {
    const fired = Boolean(flash.Fired);
    return fired ? "Flash fired" : "Flash did not fire";
  }

  return String(flash);
};

const showActionBar = ref(true);
const activeTab = ref("scores");
const { logActivity } = useActivityLogger();

watch(
  () => props.selectedPhoto,
  () => {
    activeTab.value = "scores";
  },
);

watch(activeTab, (tab) => {
  logActivity("ui_action", {
    action: "photo_info_tab_change",
    tab,
    photoId: props.selectedPhoto?.id,
  });
});
</script>

<style scoped>
/* Compact header styling */
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
  max-height: calc(90vh - 80px);
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

.tech-tag {
  font-size: 11px;
  height: 22px !important;
  border-radius: 4px !important;
  font-family: var(--font-mono);
  font-weight: 500;
  margin: 2px;
}

/* Notes Section Styles */
.notes-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding: var(--spacing-md);
}

.notes-header {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.notes-title-container {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.notes-icon {
  color: var(--primary-color);
}

.notes-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.notes-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin: 0;
}

.word-counter {
  font-size: 12px;
  color: var(--text-tertiary);
  font-weight: 500;
  transition: color 0.2s ease;
}

.word-counter.word-limit-exceeded {
  color: var(--error-color);
  font-weight: 600;
}

.notes-input-area {
  width: 100%;
}

.notes-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
}

.notes-buttons-group {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.error-text {
  font-size: 12px;
  color: var(--error-color);
  font-weight: 500;
}

.photo-display-centered {
  width: 100%;
  height: 320px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: var(--spacing-xs);
  flex-shrink: 0;
}

/* Dialog-level navigation arrows */
.dialog-nav-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 6;
  background: rgba(0, 0, 0, 0.35) !important;
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  color: white !important;
  width: 32px;
  height: 32px;
  opacity: 0;
  transition:
    opacity 0.25s ease,
    background 0.2s ease,
    transform 0.2s ease;
}

.photo-display-centered:hover .dialog-nav-arrow {
  opacity: 0.7;
}

.dialog-nav-arrow:hover {
  opacity: 1 !important;
  background: rgba(0, 0, 0, 0.55) !important;
  border-color: rgba(255, 255, 255, 0.3) !important;
  transform: translateY(-50%) scale(1.1);
}

.dialog-nav-arrow:active {
  transform: translateY(-50%) scale(0.95);
}

.dialog-nav-arrow-left {
  left: 8px;
}

.dialog-nav-arrow-right {
  right: 8px;
}

.bottom-left-actions {
  position: absolute;
  bottom: var(--spacing-sm);
  left: var(--spacing-sm);
  display: flex;
  align-items: center;
  gap: 8px;
}

.flag-control {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-primary);
  background: var(--bg-surface);
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  transition:
    background-color 0.2s ease,
    transform 0.15s ease;
}

.flag-control:hover {
  transform: scale(1.08);
}

/* Solo se colorea el icono outlined; el fondo del chip se mantiene neutro
   para no chocar con la interfaz. */
.flag-control.flag-picked {
  color: var(--success-color);
}

.flag-control.flag-rejected {
  color: var(--error-color);
}

/* Tachado tipo "reject" de Lightroom, igual que el indicador de la card */
.flag-control.flag-rejected .n-icon {
  position: relative;
}

.flag-control.flag-rejected .n-icon::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 120%;
  height: 2px;
  background: currentColor;
  transform: rotate(-45deg);
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

/* Floating action bar overlay - centered on hover */
.photo-action-bar-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4;
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.45);
  border-radius: var(--radius-md);
}

.photo-display-centered:hover
  .photo-action-bar-overlay:not(.action-bar-hidden) {
  opacity: 1;
  pointer-events: auto;
}

/* Photo overlay */
.photo-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 5;
}

.photo-overlay > * {
  pointer-events: auto;
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

/* Photo credit badge - generic for any user */
.photo-credit-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  border-radius: 20px;
  color: white;
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  opacity: 0.8;
  transition: all 0.3s ease;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.photo-credit-badge:hover {
  opacity: 1;
  background: rgba(225, 48, 108, 0.8);
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(225, 48, 108, 0.3);
}

.photo-credit-badge span {
  line-height: 1;
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
  padding: 8px var(--spacing-sm) !important;
  min-height: 36px !important;
}

.info-sections :deep(.n-tabs-content) {
  padding: 0 !important;
  flex: 1;
}

.info-sections :deep(.n-tab-pane) {
  /* padding: var(--spacing-lg) !important; */
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

/* Tags section */
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
}

/* Descriptions & Scores */
.descriptions-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
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

.overall-rating-container {
  padding: var(--spacing-md);
  background: var(--bg-container);
  border-radius: var(--radius-md);
  border-left: 4px solid var(--primary-color);
}

.overall-rating {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-md);
  padding-left: 17px;
  padding-right: 17px;
  padding-bottom: var(--spacing-md);
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

/* Rating color classes */
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

/* Genre presets */
.genre-presets-container {
  display: flex;
  align-items: center;
}

.genre-select {
  width: 160px;
}

.genre-header {
  display: flex;
  justify-content: center;
}

.genre-title {
  margin: 0;
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.genre-pills {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  padding: 10px 0 12px;
}

.genre-pills :deep(.preset-button) {
  border-radius: 6px !important;
  font-size: 12px !important;
}

/* Weights configuration */
.weights-configuration-container {
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-lg);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
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

/* Artistic scores grid */
.artistic-scores-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 5px;
  padding: var(--spacing-lg);
  padding-top: 0;
  max-height: 400px;
  overflow-y: auto;
}

.score-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-md);
  padding: 4px;
  transition: all 0.3s ease;
  position: relative;
}

.score-item::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  width: calc(var(--weight-scale, 0) * (140px + var(--spacing-sm)));
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
  transition:
    width 0.3s ease,
    opacity 0.3s ease;
  position: relative;
  z-index: 1;
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

/* Insights Panel */
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

/* Library tab styles */
.library-tag {
  cursor: pointer;
  /* transition: all 0.2s ease; */
}

/* .library-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  opacity: 0.85;
} */

.library-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-md);
  padding: var(--spacing-xl) var(--spacing-md);
  text-align: center;
}

.library-empty-state .empty-text {
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
  margin: 0;
}
</style>
