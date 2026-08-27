<template>
  <div class="settings-view view-container">
    <div class="settings-container">
      <div class="settings-header">
        <h1 class="settings-title">Settings</h1>
        <p class="settings-subtitle">
          Manage your account, preferences, and connections
        </p>
      </div>

      <div class="settings-grid">
        <!-- User Section -->
        <section class="settings-section">
          <div class="section-header">
            <n-icon size="24" color="var(--primary-color)">
              <PersonOutline />
            </n-icon>
            <h2 class="section-title">Account</h2>
          </div>
          <div class="section-content">
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label">Display Name</label>
                <p class="setting-description">
                  Your name as it appears across the app
                </p>
              </div>
              <div class="setting-control">
                <n-input
                  :value="userName"
                  placeholder="Enter your name"
                  class="setting-input"
                  disabled
                />
                <!-- <n-button text type="primary" class="change-btn" disabled>
                  Save
                </n-button> -->
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label">Email Address</label>
                <p class="setting-description">
                  Used for notifications and account recovery
                </p>
              </div>
              <div class="setting-control">
                <n-input
                  :value="userEmail"
                  placeholder="Enter your email"
                  class="setting-input"
                  disabled
                />
                <!-- <n-button text type="primary" class="change-btn" disabled>
                  Save
                </n-button> -->
              </div>
            </div>
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label">Profile</label>
                <p class="setting-description">Your photography profile</p>
              </div>
              <div class="setting-control">
                <n-tag type="info" size="medium">
                  {{ userProfileLabel }}
                </n-tag>
              </div>
            </div>
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label">Preferred Source</label>
                <p class="setting-description">Where your photos come from</p>
              </div>
              <div class="setting-control">
                <n-tag type="info" size="medium">
                  {{ preferredSourceLabel }}
                </n-tag>
              </div>
            </div>

            <!-- Delete Account -->
            <div class="setting-item danger-zone-item">
              <div class="setting-info">
                <label class="setting-label danger-label">Delete Account</label>
                <p class="setting-description">
                  Permanently delete your account and all your photos.
                </p>
              </div>
              <div class="setting-control">
                <n-button
                  type="error"
                  :disabled="isDemoUser"
                  @click="showDeleteAccountModal = true"
                >
                  Delete Account
                </n-button>
              </div>
            </div>
          </div>
        </section>
        <!-- Plans & Storage Section -->
        <section class="settings-section">
          <div class="section-header">
            <n-icon size="24" color="var(--primary-color)">
              <CloudOutline />
            </n-icon>
            <div class="section-title-group">
              <h2 class="section-title">Photo Analysis & Credits</h2>
              <div class="section-title-links">
                <button
                  class="credits-info-learn-more"
                  @click="showCreditsInfo = true"
                  title="Learn how analyses and credits work"
                >
                  <n-icon :size="11"><InformationCircleOutline /></n-icon>
                  Learn more about analyses &amp; credits
                </button>
              </div>
            </div>
          </div>
          <div class="section-content">
            <!-- Current Plan -->
            <!-- <div class="current-plan-card">
              <div class="plan-info">
                <span class="plan-name">Free Plan</span>
                <n-tag type="info" size="small">Current Plan</n-tag>
              </div>
              <n-button
                type="primary"
                ghost
                size="small"
                @click="
                  message.info(
                    'Plans coming soon! Use the buttons below to add photos or credits.',
                  )
                "
              >
                View Plans
              </n-button>
            </div> -->

            <!-- Analysis Usage -->
            <div class="storage-usage-container">
              <div class="storage-header">
                <div class="storage-title-row">
                  <n-icon size="18" color="var(--primary-color)">
                    <LayersOutline />
                  </n-icon>
                  <span class="storage-title">Photo Analysis Quota</span>
                  <n-tooltip trigger="hover" placement="top">
                    <template #trigger>
                      <n-icon
                        size="13"
                        color="var(--text-secondary)"
                        style="cursor: help"
                      >
                        <InfoCircleFilled />
                      </n-icon>
                    </template>
                    Your usage of photo analysis slots, which are consumed when
                    you upload and analyze new photos. Each analyzed photo
                    occupies one slot permanently.
                  </n-tooltip>
                </div>
                <span class="storage-count"
                  >{{ analyzedPhotosUsed }} / {{ analyzedPhotosLimit }}</span
                >
              </div>
              <div class="storage-progress-bar">
                <div
                  class="storage-progress-fill"
                  :style="{ width: analysisPercentage + '%' }"
                  :class="{
                    warning: analysisPercentage > 80,
                    critical: analysisPercentage > 95,
                  }"
                ></div>
              </div>
              <div class="storage-footer">
                <span class="storage-remaining"
                  >{{ analyzedPhotosRemaining }} analyses remaining</span
                >
                <n-button
                  type="info"
                  size="small"
                  :disabled="isDemoUser"
                  @click="
                    isPurchaseEnabledForUser
                      ? (showPhotosModal = true)
                      : (showPlansModal = true)
                  "
                >
                  <template #icon>
                    <n-icon>
                      <AddOutline />
                    </n-icon>
                  </template>
                  Add photos
                </n-button>
              </div>
            </div>

            <!-- Credits Usage -->
            <div class="storage-usage-container">
              <div class="storage-header">
                <div class="storage-title-row">
                  <n-icon size="18" color="var(--primary-color)">
                    <ConstructOutline />
                  </n-icon>
                  <span class="storage-title">Tools Credits</span>
                  <n-tooltip trigger="hover" placement="top">
                    <template #trigger>
                      <n-icon
                        size="13"
                        color="var(--text-secondary)"
                        style="cursor: help"
                      >
                        <InfoCircleFilled />
                      </n-icon>
                    </template>
                    Credits consumed by tools such as ChatLab, Search,
                    Geo-inference, and Portfolio Builder. Each tool has its own
                    credit cost per use.
                  </n-tooltip>
                </div>
                <span class="storage-count"
                  >{{ creditsUsed.toFixed(1) }} /
                  {{ creditsAvailable.toFixed(1) }}</span
                >
              </div>
              <div class="storage-progress-bar">
                <div
                  class="storage-progress-fill credits"
                  :style="{ width: creditsPercentage + '%' }"
                  :class="{
                    warning: creditsPercentage > 80,
                    critical: creditsPercentage > 95,
                  }"
                ></div>
              </div>
              <div class="storage-footer">
                <div class="storage-footer-left">
                  <span class="storage-remaining"
                    >{{ (creditsAvailable - creditsUsed).toFixed(1) }} credits
                    remaining</span
                  >
                  <button
                    class="credits-info-learn-more"
                    @click="showFreeQuotaInfo = true"
                    title="View daily free quota per tool"
                  >
                    <n-icon :size="11"><SparklesOutline /></n-icon>
                    Daily free quota
                  </button>
                </div>
                <n-button
                  type="info"
                  size="small"
                  :disabled="isDemoUser"
                  @click="
                    isPurchaseEnabledForUser
                      ? (showCreditsModal = true)
                      : (showPlansModal = true)
                  "
                >
                  <template #icon>
                    <n-icon>
                      <AddOutline />
                    </n-icon>
                  </template>
                  Top credits
                </n-button>
              </div>
            </div>

            <!-- Invite Friends Card -->
            <div class="invite-card" :class="{ disabled: isDemoUser }">
              <div class="invite-card-header">
                <div class="invite-icon-wrapper">
                  <n-icon size="24" color="var(--accent-color)">
                    <MailOutline />
                  </n-icon>
                </div>
                <div class="invite-card-info">
                  <span class="invite-card-title">Invite Friends</span>
                  <span class="invite-card-description">
                    <template v-if="isDemoUser">
                      This feature is not available for demo accounts.
                    </template>
                    <template v-else>
                      Get <strong>200 photos</strong> and a bonus of
                      <strong>500 credits</strong>
                      for each successful referral!
                    </template>
                  </span>
                </div>
              </div>
              <div class="invite-card-form">
                <n-input
                  v-model:value="inviteEmail"
                  placeholder="friend@email.com"
                  type="text"
                  class="invite-card-input"
                  :disabled="isSendingInvite || isDemoUser"
                  @keyup.enter="sendInvitation"
                />
                <n-button
                  type="info"
                  :loading="isSendingInvite"
                  :disabled="!inviteEmail || isSendingInvite || isDemoUser"
                  @click="sendInvitation"
                >
                  <template #icon>
                    <n-icon>
                      <SendOutline />
                    </n-icon>
                  </template>
                  Send
                </n-button>
              </div>
            </div>
          </div>
        </section>
        <!-- Preferences Section -->
        <section class="settings-section">
          <div class="section-header">
            <n-icon size="24" color="var(--primary-color)">
              <SettingsOutline />
            </n-icon>
            <h2 class="section-title">Preferences</h2>
          </div>
          <div class="section-content">
            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label">Language</label>
                <p class="setting-description">
                  Choose your preferred language
                </p>
              </div>
              <div class="setting-control">
                <n-select
                  disabled
                  v-model:value="selectedLanguage"
                  :options="languageOptions"
                  class="setting-select"
                />
              </div>
            </div>

            <div class="setting-item">
              <div class="setting-info">
                <label class="setting-label">Theme</label>
                <p class="setting-description">Select your visual preference</p>
              </div>
              <div class="setting-control">
                <n-select
                  v-model:value="selectedTheme"
                  :options="themeOptions"
                  class="setting-select"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- Connections Section -->
        <section class="settings-section">
          <div class="section-header">
            <n-icon size="24" color="var(--primary-color)">
              <LinkOutline />
            </n-icon>
            <h2 class="section-title">Connections</h2>
          </div>
          <div class="section-content">
            <!-- Google Photos -->
            <div class="connection-item">
              <div class="connection-info">
                <img
                  :src="googlePhotosIconUrl"
                  alt="Google Photos"
                  class="connection-icon"
                />
                <div class="connection-details">
                  <span class="connection-name">Google Photos</span>
                  <span class="connection-description"
                    >Import and sync photos from your library</span
                  >
                </div>
              </div>
              <div class="connection-actions">
                <n-tag
                  v-if="isGooglePhotosConnected"
                  type="success"
                  size="small"
                  round
                >
                  Connected
                </n-tag>
                <n-tag v-else type="warning" size="small" round>
                  Not connected
                </n-tag>
                <n-button
                  v-if="isGooglePhotosConnected"
                  text
                  type="error"
                  size="small"
                  @click="disconnectGooglePhotos"
                >
                  Disconnect
                </n-button>
                <n-button
                  v-else
                  type="primary"
                  size="small"
                  @click="connectGooglePhotos"
                >
                  Connect
                </n-button>
              </div>
            </div>

            <!-- Dropbox -->
            <div class="connection-item">
              <div class="connection-info">
                <img
                  :src="dropboxIconUrl"
                  alt="Dropbox"
                  class="connection-icon"
                />
                <div class="connection-details">
                  <span class="connection-name">Dropbox</span>
                  <span class="connection-description"
                    >Import photos from your Dropbox</span
                  >
                </div>
              </div>
              <div class="connection-actions">
                <n-tag v-if="isDropboxReady" type="success" size="small" round>
                  Ready
                </n-tag>
                <n-tag v-else type="warning" size="small" round>
                  Not connected
                </n-tag>
                <n-button
                  v-if="!isDropboxReady"
                  type="primary"
                  size="small"
                  @click="connectDropbox"
                  :loading="dropbox.isLoading.value"
                >
                  Connect
                </n-button>
              </div>
            </div>
            <!-- Google Drive -->
            <div class="connection-item">
              <div class="connection-info">
                <img
                  :src="googleDriveIconUrl"
                  alt="Google Drive"
                  class="connection-icon"
                />
                <div class="connection-details">
                  <span class="connection-name">Google Drive</span>
                  <span class="connection-description"
                    >Import photos directly from your Google Drive</span
                  >
                </div>
              </div>
              <div class="connection-actions">
                <n-tag
                  v-if="isGoogleDriveConnected"
                  type="success"
                  size="small"
                  round
                >
                  Connected
                </n-tag>
                <n-tag v-else type="warning" size="small" round>
                  Not connected
                </n-tag>
                <n-button
                  v-if="isGoogleDriveConnected"
                  text
                  type="error"
                  size="small"
                  @click="disconnectGoogleDrive"
                >
                  Disconnect
                </n-button>
                <n-button
                  v-else
                  type="primary"
                  size="small"
                  @click="connectGoogleDrive"
                >
                  Connect
                </n-button>
              </div>
            </div>

            <!-- Instagram -->
            <!-- <div class="connection-item coming-soon">
              <div class="connection-info">
                <div class="connection-icon-wrapper instagram">
                  <n-icon size="24" color="#fff">
                    <LogoInstagram />
                  </n-icon>
                </div>
                <div class="connection-details">
                  <span class="connection-name">Instagram</span>
                  <span class="connection-description"
                    >Connect your Instagram account</span
                  >
                </div>
              </div>
              <div class="connection-actions">
                <n-tag type="info" size="small" round> Coming soon </n-tag>
              </div>
            </div> -->
          </div>
        </section>

        <!-- Save Button -->
        <!-- <div class="settings-actions">
          <n-button type="primary" size="large" @click="saveSettings">
            Save Changes
          </n-button>
        </div> -->
      </div>
    </div>
  </div>

  <!-- Photo Packages Modal -->
  <PhotoPackagesModal v-model:show="showPhotosModal" />

  <!-- Credit Purchase Modal -->
  <CreditPurchaseModal v-model:show="showCreditsModal" />

  <!-- Credits Info Dialog -->
  <transition name="backdrop-fade">
    <div
      v-if="showCreditsInfo"
      class="credits-info-backdrop"
      @click="showCreditsInfo = false"
    />
  </transition>
  <transition name="credits-info-pop">
    <div v-if="showCreditsInfo" class="credits-info-dialog">
      <div class="chatlab-info-header">
        <div class="chatlab-info-title-row">
          <n-icon :size="20" class="chatlab-info-icon">
            <InformationCircleOutline />
          </n-icon>
          <span class="chatlab-info-title">Photo Analysis &amp; Credits</span>
        </div>
        <n-button quaternary size="small" @click="showCreditsInfo = false">
          <template #icon>
            <n-icon :size="14"><CloseOutline /></n-icon>
          </template>
        </n-button>
      </div>
      <div class="chatlab-info-body">
        <p>
          Photoreka uses <strong>two separate systems</strong> to meter usage:
          <strong>Photo Analysis Quota</strong> for AI processing of new photos,
          and <strong>Tools Credits</strong> for on-demand intelligent features
          once photos are already in your catalog.
        </p>

        <!-- Analyzed Photos -->
        <h4 class="chatlab-info-h4">
          <n-icon
            :size="14"
            class="chatlab-h4-icon"
            style="color: var(--primary-color)"
          >
            <ImagesOutline />
          </n-icon>
          Photo Analysis Quota
        </h4>
        <p>
          Each time you upload a new photo and run AI analysis on it, it
          occupies one <strong>photo slot</strong> from your limit —
          permanently. This covers the full pipeline: visual description, tags,
          embeddings, artistic scores, EXIF extraction, and object detections.
        </p>
        <ul>
          <li>Does <strong>not</strong> consume Tools Credits.</li>
          <li>
            Slots do not replenish — they expand when you purchase a Photo
            Analysis Package.
          </li>
          <li>
            Swapping a photo (replacing an analyzed photo with a new version)
            does <strong>not</strong> consume an additional slot.
          </li>
        </ul>

        <!-- AI Credits -->
        <h4 class="chatlab-info-h4">
          <n-icon
            :size="14"
            class="chatlab-h4-icon"
            style="color: var(--accent-color)"
          >
            <FlashOutline />
          </n-icon>
          Tools Credits — cost breakdown by tool
        </h4>
        <p>
          Credits are consumed by AI-powered operations on already-processed
          photos. Below is a per-tool breakdown.
        </p>

        <!-- Search -->
        <h4 class="chatlab-info-h4">
          <n-icon
            :size="14"
            class="chatlab-h4-icon"
            style="color: var(--accent-color); opacity: 0.8"
          >
            <SearchOutline />
          </n-icon>
          Search &amp; Explorer
        </h4>
        <ul>
          <li>
            <strong>Broad</strong> — wide semantic scan; best for moods and
            visual style. <em>Standard cost per query.</em>
          </li>
          <li>
            <strong>Adaptive</strong> — context-enriched; ideal for metaphors
            and cultural references. <em>Standard cost per query.</em>
          </li>
          <li>
            <strong>Precise</strong> — high-accuracy; best for specific objects
            and taxonomic distinctions.
            <em>Standard cost + additional refinement processing.</em>
          </li>
          <li>
            <strong>Search Insights</strong> — AI-generated commentary that
            enriches search results with contextual observations about the
            returned photos. <em>Small fixed credit cost per insight call.</em>
          </li>
        </ul>

        <!-- Geo-inference -->
        <h4 class="chatlab-info-h4">
          <n-icon
            :size="14"
            class="chatlab-h4-icon"
            style="color: var(--accent-color); opacity: 0.8"
          >
            <LocationOutline />
          </n-icon>
          World Map — Geo-inference
        </h4>
        <ul>
          <li>
            Credits are charged <strong>at job completion</strong>, based on
            actual LLM and geocoding calls made — not an upfront flat fee.
          </li>
          <li>
            Photos with known GPS coordinates, or that share a capture timestamp
            with an already-located photo, are resolved for free.
          </li>
          <li>
            The app shows a <strong>min–max estimate</strong> before you start a
            job, accounting for potential temporal-clustering savings.
          </li>
          <li>
            Correcting an inferred location manually does
            <strong>not</strong> consume credits.
          </li>
        </ul>

        <!-- Portfolio Builder -->
        <h4 class="chatlab-info-h4">
          <n-icon
            :size="14"
            class="chatlab-h4-icon"
            style="color: var(--accent-color); opacity: 0.8"
          >
            <ImagesOutline />
          </n-icon>
          Portfolio Builder
        </h4>
        <ul>
          <li>
            Runs an LLM evaluation pipeline across candidate photos in batches
            (recall → coherence scoring → evaluation → refinement → sequencing).
          </li>
          <li>
            Credit cost scales with the
            <strong>number of candidates evaluated</strong> and the
            <strong>target portfolio size</strong>; a cost estimate is shown
            before the build starts.
          </li>
          <li>
            Aborting a build mid-run charges only for the work already done.
          </li>
        </ul>

        <!-- Canvas -->
        <h4 class="chatlab-info-h4">
          <n-icon
            :size="14"
            class="chatlab-h4-icon"
            style="color: var(--accent-color); opacity: 0.8"
          >
            <ImagesOutline />
          </n-icon>
          Canvas
        </h4>
        <ul>
          <li>
            <strong>Crop-region expansion</strong> — when you use a custom crop
            region as the search source for Canvas expansion, an on-the-fly CLIP
            embedding is generated for that region.
            <em>Small fixed GPU credit cost per crop-region query.</em>
          </li>
        </ul>

        <!-- ChatLab -->
        <h4 class="chatlab-info-h4">
          <n-icon
            :size="14"
            class="chatlab-h4-icon"
            style="color: var(--accent-color); opacity: 0.8"
          >
            <ChatbubblesOutline />
          </n-icon>
          ChatLab
        </h4>
        <ul>
          <li>
            <strong>Scout</strong> — lightweight models, fast responses.
            <em>0.5× base cost per message.</em>
          </li>
          <li>
            <strong>Curator</strong> — stronger models, deeper analysis
            (default). <em>1× base cost per message.</em>
          </li>
          <li>
            Attaching photos or triggering catalog searches within a
            conversation may add marginal extra cost proportional to data
            retrieved.
          </li>
          <li>
            <strong>App Assistant</strong> — the contextual help chat available
            in some sections of the app (sidebar panel, distinct from ChatLab).
            It uses lightweight models and carries a small credit cost per
            message, comparable to Scout.
          </li>
        </ul>

        <!-- How to get more -->
        <h4 class="chatlab-info-h4">
          <n-icon :size="14" class="chatlab-h4-icon chatlab-h4-icon--can">
            <CheckmarkCircleOutline />
          </n-icon>
          Getting more photo quota or credits
        </h4>
        <ul>
          <li>
            <strong>Photo Analysis Packages</strong> expand your photo analysis
            quota (slots do not expire). Some packages include bonus credits.
          </li>
          <li>
            <strong>Credit Packages</strong> top up your Tools Credit balance
            (credits do not expire).
          </li>
          <li>
            Inviting a friend who creates an account earns you
            <strong>200 photo analysis slots</strong> and
            <strong>500 tools credits</strong>.
          </li>
        </ul>

        <!-- Daily Free Credits callout (distinct info box) -->
        <!-- <div class="daily-free-callout">
          <div class="daily-free-callout-header">
            <n-icon :size="16" class="daily-free-callout-icon">
              <SparklesOutline />
            </n-icon>
            <span class="daily-free-callout-title">Daily free credits</span>
          </div>
          <p class="daily-free-callout-text">
            Each tool has its own independent daily quota. Free uses kick in
            <strong>only after your paid credit balance is fully spent</strong>,
            and unused allowances <strong>do not carry over</strong>.
          </p>
          <ul class="daily-free-callout-list">
            <li>
              <span class="daily-free-callout-tool">Semantic Search</span>
              <span class="daily-free-callout-quota">3 / day</span>
            </li>
            <li>
              <span class="daily-free-callout-tool">Precise Search</span>
              <span class="daily-free-callout-quota">1 / day</span>
            </li>
            <li>
              <span class="daily-free-callout-tool">Search by Photo</span>
              <span class="daily-free-callout-quota">5 / day</span>
            </li>
            <li>
              <span class="daily-free-callout-tool">ChatLab</span>
              <span class="daily-free-callout-quota">2 / day</span>
            </li>
            <li>
              <span class="daily-free-callout-tool">Knowledge Assistant</span>
              <span class="daily-free-callout-quota">3 / day</span>
            </li>
          </ul>
          <p class="daily-free-callout-text daily-free-callout-text--note">
            <strong>Portfolio Builder</strong>, <strong>Geo Inference</strong>,
            and <strong>Search Insights</strong> are always billed against your
            paid balance.
          </p>
        </div> -->
      </div>
    </div>
  </transition>

  <!-- Free Quota Dialog -->
  <transition name="backdrop-fade">
    <div
      v-if="showFreeQuotaInfo"
      class="credits-info-backdrop"
      @click="showFreeQuotaInfo = false"
    />
  </transition>
  <transition name="credits-info-pop">
    <div v-if="showFreeQuotaInfo" class="credits-info-dialog free-quota-dialog">
      <div class="chatlab-info-header">
        <div class="chatlab-info-title-row">
          <n-icon :size="20" class="chatlab-info-icon">
            <SparklesOutline />
          </n-icon>
          <span class="chatlab-info-title">Daily Free Quota</span>
        </div>
        <n-button quaternary size="small" @click="showFreeQuotaInfo = false">
          <template #icon>
            <n-icon :size="14"><CloseOutline /></n-icon>
          </template>
        </n-button>
      </div>
      <div class="chatlab-info-body">
        <p>
          Some tools include a <strong>daily free allowance</strong> that resets
          every day at UTC midnight. Free uses are consumed
          <strong>only after your paid credit balance is fully spent</strong> —
          while you have credits, they are billed normally. Each tool tracks its
          quota independently, and
          <strong>unused free uses do not carry over</strong> to the next day.
        </p>
        <div class="free-quota-table">
          <div class="free-quota-table-header">
            <span>Tool</span>
            <span>Free uses / day</span>
          </div>
          <div class="free-quota-table-row">
            <span>Search (Broad & Adaptive)</span>
            <span class="free-quota-value">3</span>
          </div>
          <div class="free-quota-table-row">
            <span>Search (Precise)</span>
            <span class="free-quota-value">1</span>
          </div>
          <div class="free-quota-table-row">
            <span class="free-quota-row-label">
              Find Similar Photos
              <n-tooltip trigger="hover" placement="top">
                <template #trigger>
                  <n-icon
                    size="12"
                    color="var(--text-secondary)"
                    style="
                      cursor: help;
                      vertical-align: middle;
                      margin-left: 3px;
                    "
                  >
                    <InformationCircleOutline />
                  </n-icon>
                </template>
                Used in Canvas, Series, and the "Similar" tab in the Photo Info
                panel.
              </n-tooltip>
            </span>
            <span class="free-quota-value">5</span>
          </div>
          <div class="free-quota-table-row">
            <span>ChatLab</span>
            <span class="free-quota-value">2</span>
          </div>
          <div class="free-quota-table-row">
            <span>Knowledge Assistant</span>
            <span class="free-quota-value">3</span>
          </div>
          <div class="free-quota-table-row free-quota-table-row--muted">
            <span>Portfolio Builder</span>
            <span class="free-quota-value free-quota-value--none"
              >paid only</span
            >
          </div>
          <div class="free-quota-table-row free-quota-table-row--muted">
            <span>Geo Inference</span>
            <span class="free-quota-value free-quota-value--none"
              >paid only</span
            >
          </div>
          <div class="free-quota-table-row free-quota-table-row--muted">
            <span>Search + Insights</span>
            <span class="free-quota-value free-quota-value--none"
              >paid only</span
            >
          </div>
        </div>
      </div>
    </div>
  </transition>

  <!-- Payment Success Modal -->
  <PaymentSuccessModal
    v-model:show="showPaymentSuccessModal"
    :session-id="paymentSessionId"
  />

  <!-- Plans & Credits — Quota Request Modal -->
  <n-modal
    v-model:show="showPlansModal"
    :style="{ width: '480px', maxWidth: '92vw' }"
    @after-leave="resetQuotaForm"
  >
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      class="plans-modal-card"
    >
      <template #header-extra>
        <n-button text @click="showPlansModal = false" aria-label="Close">
          <n-icon size="18" color="var(--text-secondary)">
            <svg viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
              />
            </svg>
          </n-icon>
        </n-button>
      </template>

      <div class="plans-modal-content">
        <div class="plans-modal-icon-wrapper">
          <n-icon size="32" color="var(--primary-color)">
            <CloudOutline />
          </n-icon>
        </div>
        <h3 class="plans-modal-title">
          Photo Packages & Credits — Coming Soon
        </h3>
        <p class="plans-modal-body">
          We're working on a photo packages and credits system. In the meantime,
          send us a request and we'll manually increase your photos and credits
          quota.
        </p>

        <div class="quota-form">
          <div class="quota-form-field">
            <label class="quota-form-label"
              >How many photos do you need?
              <span class="quota-required">*</span></label
            >
            <n-select
              v-model:value="quotaPhotosOption"
              :options="quotaPhotoOptions"
              placeholder="Select an amount…"
            />
          </div>
          <div class="quota-form-field">
            <label class="quota-form-label">
              <template v-if="quotaPhotosOption === 'other'">
                How many, and any other details
                <span class="quota-required">*</span>
              </template>
              <template v-else
                >Comments
                <span class="quota-optional">(optional)</span></template
              >
            </label>
            <n-input
              v-model:value="quotaComments"
              type="textarea"
              :placeholder="
                quotaPhotosOption === 'other'
                  ? 'Specify the number of photos and tell us about your use case…'
                  : 'Tell us about your use case, project, or any other details…'
              "
              :autosize="{ minRows: 3, maxRows: 6 }"
            />
          </div>
        </div>
      </div>

      <template #action>
        <div class="plans-modal-actions">
          <n-button
            :disabled="isSendingQuotaRequest"
            @click="showPlansModal = false"
            >Cancel</n-button
          >
          <n-button
            type="primary"
            :loading="isSendingQuotaRequest"
            :disabled="!isQuotaFormValid || isSendingQuotaRequest"
            @click="sendQuotaRequest"
          >
            Send request
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>

  <!-- Delete Account Confirmation Modal -->
  <n-modal
    v-model:show="showDeleteAccountModal"
    :style="{ width: '460px', maxWidth: '92vw' }"
  >
    <n-card
      :bordered="false"
      role="dialog"
      aria-modal="true"
      class="delete-account-modal-card"
    >
      <template #header-extra>
        <n-button
          text
          @click="showDeleteAccountModal = false"
          aria-label="Close"
        >
          <n-icon size="20"><CloseOutline /></n-icon>
        </n-button>
      </template>

      <div class="delete-account-modal-content">
        <div class="delete-account-icon-wrapper">
          <n-icon size="32" color="var(--error-color)"><TrashOutline /></n-icon>
        </div>
        <h3 class="delete-account-title">Delete Account</h3>
        <p class="delete-account-body">
          This action is <strong>permanent and cannot be undone</strong>. Your
          account will be deactivated and all your photos will be scheduled for
          permanent deletion.
        </p>
        <div class="delete-account-warning">
          <n-icon size="16" color="var(--error-color)"
            ><WarningOutline
          /></n-icon>
          <span
            >All your analyzed photos, tags, collections and data will be lost
            forever.</span
          >
        </div>
        <p class="delete-account-confirm-label">
          Type <strong>DELETE</strong> to confirm:
        </p>
        <n-input
          v-model:value="deleteConfirmText"
          placeholder="DELETE"
          class="delete-account-input"
          :status="
            deleteConfirmText && deleteConfirmText !== 'DELETE'
              ? 'error'
              : undefined
          "
        />
      </div>

      <template #action>
        <div class="delete-account-actions">
          <n-button
            @click="showDeleteAccountModal = false"
            :disabled="isDeletingAccount"
          >
            Cancel
          </n-button>
          <n-button
            type="error"
            :loading="isDeletingAccount"
            :disabled="deleteConfirmText !== 'DELETE' || isDeletingAccount"
            @click="handleDeleteAccount"
          >
            Delete my account forever
          </n-button>
        </div>
      </template>
    </n-card>
  </n-modal>
</template>

<script setup lang="ts">
import { isDemoEmail } from "@/config/demoUsers";
import { ref, computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NInput,
  NSelect,
  NButton,
  NIcon,
  NTag,
  NTooltip,
  NModal,
  NCard,
  useMessage,
} from "naive-ui";
import {
  PersonOutline,
  SettingsOutline,
  LinkOutline,
  CloudOutline,
  AddOutline,
  LogoInstagram,
  MailOutline,
  SendOutline,
  StarOutline,
  ConstructOutline,
  TrashOutline,
  WarningOutline,
  CloseOutline,
  InformationCircleOutline,
  SearchOutline,
  LocationOutline,
  ImagesOutline,
  ChatbubblesOutline,
  FlashOutline,
  CheckmarkCircleOutline,
} from "@vicons/ionicons5";
import { SparklesOutline } from "@vicons/ionicons5";

import { LayersOutline } from "@vicons/ionicons5";
import { InfoCircleFilled } from "@vicons/antd";
import googlePhotosIconUrl from "@/assets/logos/google_photos.png";
import googleDriveIconUrl from "@/assets/logos/google_drive.svg";
import dropboxIconUrl from "@/assets/logos/dropbox.svg";
import { useUserStore } from "@/stores/userStore";
import { useTheme } from "@/composables/useTheme.js";
import { useGooglePhotos } from "@/composables/useGooglePhotos.js";
import { useGoogleDrive } from "@/composables/useGoogleDrive.js";
import { useDropbox } from "@/composables/useDropbox.js";
import { api } from "@/utils/axios";
import PhotoPackagesModal from "@/components/PhotoPackagesModal.vue";
import CreditPurchaseModal from "@/components/CreditPurchaseModal.vue";
import PaymentSuccessModal from "@/components/PaymentSuccessModal.vue";

// ============================================================
// Toggle: set to true to enable real purchase modals,
//         set to false to show "coming soon" placeholder modal.
// Whitelist: specific emails can have purchase enabled
//            regardless of VITE_ENABLE_REAL_PURCHASE setting
// ============================================================
const ENABLE_REAL_PURCHASE =
  import.meta.env.VITE_ENABLE_REAL_PURCHASE === "true";

const PURCHASE_ENABLED_EMAILS = (
  import.meta.env.VITE_PURCHASE_ENABLED_EMAILS || ""
)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter((email) => email.length > 0);

// Stores and composables
const userStore = useUserStore();
const route = useRoute();
const router = useRouter();
const { isDarkMode, setTheme } = useTheme();
const googlePhotos = useGooglePhotos();
const googleDrive = useGoogleDrive();
const dropbox = useDropbox();
const message = useMessage();

// Refresh usage on component mount
onMounted(async () => {
  await userStore.fetchUsage();
  checkPaymentRedirect();
});

// Payment success modal
const showPaymentSuccessModal = ref(false);
const paymentSessionId = ref<string | null>(null);

function checkPaymentRedirect() {
  if (route.query.payment !== "success") return;
  const sid =
    typeof route.query.session_id === "string" ? route.query.session_id : null;
  if (!sid) return;
  paymentSessionId.value = sid;
  showPaymentSuccessModal.value = true;
}

// Check if user is demo
const isDemoUser = computed(() => {
  return isDemoEmail(userStore.user?.email);
});

// Check if purchase is enabled for current user
const isPurchaseEnabledForUser = computed(() => {
  // Check if globally enabled
  if (ENABLE_REAL_PURCHASE) return true;

  // Check if user email is in whitelist
  const userEmail = userStore.user?.email;
  if (!userEmail) return false;

  return PURCHASE_ENABLED_EMAILS.includes(userEmail.toLowerCase());
});

// User data (real)
const userName = computed(() => userStore.user?.name || "User");
const userEmail = computed(() => userStore.user?.email || "");

// Profile & preferred source labels
const singleProfileLabel: Record<string, string> = {
  general: "General",
  commercial: "Commercial",
  "street-photography": "Street Photography",
  documentary: "Documentary",
  artistic: "Artistic",
};

const userProfileLabel = computed(() => {
  const profiles = userStore.user?.profiles;
  if (!profiles) return "General";
  return profiles
    .split("|")
    .map((p) => singleProfileLabel[p.trim()] || p.trim())
    .join(" & ");
});

const preferredSourceLabel = computed(() => {
  const source = userStore.user?.preferredSource;
  if (source === "lightroom") return "Lightroom";
  if (source === "web") return "Web";
  return source || "Web";
});

// Invite friends
const inviteEmail = ref("");
const isSendingInvite = ref(false);

const sendInvitation = async () => {
  if (isDemoUser.value) {
    message.warning("This feature is not available for demo accounts");
    return;
  }

  if (!inviteEmail.value) {
    message.warning("Please enter an email address");
    return;
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(inviteEmail.value)) {
    message.error("Please enter a valid email address");
    return;
  }

  try {
    isSendingInvite.value = true;
    await api.post("/api/invites/send", {
      email: inviteEmail.value,
    });
    message.success(`Invitation sent to ${inviteEmail.value}!`);
    inviteEmail.value = ""; // Clear input after success
  } catch (error: any) {
    const errorMessage =
      error?.response?.data?.message ||
      error?.message ||
      "Failed to send invitation";
    message.error(errorMessage);
    console.error("Error sending invitation:", error);
  } finally {
    isSendingInvite.value = false;
  }
};

// Preferences
const selectedLanguage = ref("en");
const languageOptions = [
  { label: "English", value: "en" },
  { label: "Español", value: "es" },
  { label: "Français", value: "fr" },
  { label: "Deutsch", value: "de" },
  { label: "Português", value: "pt" },
];

const selectedTheme = computed({
  get: () => (isDarkMode.value ? "dark" : "light"),
  set: (value: "dark" | "light") => {
    setTheme(value === "dark");
    message.success(`Theme changed to ${value} mode`);
  },
});

const themeOptions = [
  { label: "Dark", value: "dark" },
  { label: "Light", value: "light" },
];

// Connections
const isGooglePhotosConnected = computed(() => googlePhotos.isAuthorized.value);

const connectGooglePhotos = async () => {
  try {
    await googlePhotos.authorize();
    message.success("Google Photos connected successfully!");
  } catch (error: any) {
    message.error(error?.message || "Failed to connect Google Photos");
    console.error("Error connecting Google Photos:", error);
  }
};

const disconnectGooglePhotos = () => {
  googlePhotos.signOut();
  message.info("Google Photos disconnected");
};

// Google Drive connection
const isGoogleDriveConnected = computed(() => googleDrive.isAuthorized.value);

const connectGoogleDrive = async () => {
  try {
    await googleDrive.authorize();
    message.success("Google Drive connected successfully!");
  } catch (error: any) {
    message.error(error?.message || "Failed to connect Google Drive");
    console.error("Error connecting Google Drive:", error);
  }
};

const disconnectGoogleDrive = () => {
  googleDrive.signOut();
  message.info("Google Drive disconnected");
};

// Dropbox connection
const isDropboxReady = computed(() => dropbox.isInitialized.value);

const connectDropbox = async () => {
  try {
    await dropbox.initialize();
    message.success("Dropbox connected successfully!");
  } catch (error: any) {
    message.error(error?.message || "Failed to connect Dropbox");
    console.error("Error connecting Dropbox:", error);
  }
};

// Analysis usage (real data from userStore)
const analyzedPhotosUsed = computed(
  () => userStore.user?.usage?.analyzedPhotosUsed || 0,
);
const analyzedPhotosLimit = computed(
  () => userStore.user?.usage?.analyzedPhotosLimit || 0,
);
const analyzedPhotosRemaining = computed(
  () => userStore.user?.usage?.analyzedPhotosRemaining || 0,
);
const analysisPercentage = computed(() => {
  if (analyzedPhotosLimit.value === 0) return 0;
  return Math.min(
    (analyzedPhotosUsed.value / analyzedPhotosLimit.value) * 100,
    100,
  );
});

// Credits usage (real data from userStore)
const creditsUsed = computed(() => userStore.user?.usage?.creditsUsed || 0);
const creditsAvailable = computed(
  () => userStore.user?.usage?.creditsAvailable || 0,
);
const creditsPercentage = computed(() => {
  if (creditsAvailable.value === 0) return 0;
  return Math.min((creditsUsed.value / creditsAvailable.value) * 100, 100);
});

// Purchase modals
const showPhotosModal = ref(false);
const showCreditsModal = ref(false);
const showPlansModal = ref(false);
const showCreditsInfo = ref(false);
const showFreeQuotaInfo = ref(false);

// Quota request form
const quotaPhotosOption = ref<string | null>(null);
const quotaComments = ref("");
const isSendingQuotaRequest = ref(false);

const quotaPhotoOptions = [
  { label: "500 photos", value: "500" },
  { label: "1,000 photos", value: "1000" },
  { label: "2,000 photos", value: "2000" },
  { label: "Other", value: "other" },
];

const isQuotaFormValid = computed(() => {
  if (!quotaPhotosOption.value) return false;
  if (quotaPhotosOption.value === "other" && !quotaComments.value.trim())
    return false;
  return true;
});

const resetQuotaForm = () => {
  quotaPhotosOption.value = null;
  quotaComments.value = "";
};

const sendQuotaRequest = async () => {
  if (!isQuotaFormValid.value) return;
  const photosRequested =
    quotaPhotosOption.value === "other"
      ? 0
      : parseInt(quotaPhotosOption.value!);
  try {
    isSendingQuotaRequest.value = true;
    await api.post("/api/email/quota-request", {
      photosRequested,
      comments: quotaComments.value || undefined,
    });
    message.success("Request sent! We'll get back to you soon.");
    showPlansModal.value = false;
  } catch (error: any) {
    const msg =
      error?.response?.data?.message ||
      error?.message ||
      "Failed to send request";
    message.error(msg);
    console.error("[QuotaRequest] Error:", error);
  } finally {
    isSendingQuotaRequest.value = false;
  }
};

// Actions
const saveSettings = () => {
  // TODO: Implement save settings
  console.log("Save settings");
};

// Delete account
const showDeleteAccountModal = ref(false);
const deleteConfirmText = ref("");
const isDeletingAccount = ref(false);

const handleDeleteAccount = async () => {
  if (deleteConfirmText.value !== "DELETE") return;
  try {
    isDeletingAccount.value = true;
    await api.delete("/api/account");
    showDeleteAccountModal.value = false;
    userStore.logout();
    router.push("/auth/login");
  } catch (error: any) {
    const msg =
      error?.response?.data?.message ||
      error?.message ||
      "Failed to delete account";
    message.error(msg);
    console.error("[DeleteAccount] Error:", error);
  } finally {
    isDeletingAccount.value = false;
    deleteConfirmText.value = "";
  }
};
</script>

<style scoped>
.settings-view {
  /* view-container ya tiene padding y overflow */
}

.settings-container {
  max-width: 1200px;
  margin: 0 auto;
  /* Colchon inferior del scroll. Va aqui, en el contenido, y no como
     padding-bottom de .view-container: Chrome no incluye el padding inferior de
     un contenedor con overflow-y en su area scrolleable, asi que alli se pierde
     y la ultima tarjeta queda cortada al llegar al final. */
  padding-bottom: var(--spacing-4xl);
}

.settings-header {
  margin-bottom: var(--spacing-2xl);
}

.settings-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.settings-subtitle {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
}

/* Section Styles */
.settings-section {
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-elevated);
}

.section-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.section-content {
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  flex: 1;
}

/* Setting Item Styles */
.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-lg);
  padding-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.setting-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.setting-info {
  flex: 1;
  min-width: 0;
}

.setting-label {
  display: block;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  margin-bottom: var(--spacing-2xs);
}

.setting-description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0;
}

.setting-control {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-shrink: 0;
}

.setting-input {
  width: 280px;
}

.setting-select {
  width: 180px;
}

.change-btn {
  white-space: nowrap;
}

/* Connection Item Styles */
.connection-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  background-color: var(--bg-container);
  transition: var(--transition-fast);
}

.connection-item:hover {
  background-color: var(--bg-elevated);
}

.connection-item.coming-soon {
  opacity: 0.7;
}

.connection-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.connection-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  object-fit: contain;
}

.connection-icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.connection-icon-wrapper.instagram {
  background: linear-gradient(
    45deg,
    #f09433,
    #e6683c,
    #dc2743,
    #cc2366,
    #bc1888
  );
}

.connection-icon-wrapper.dropbox {
  background-color: #0061ff;
}

.connection-details {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2xs);
}

.connection-name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.connection-description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.connection-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

/* Plan Card Styles */
.current-plan-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
}

.plan-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.plan-name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

/* Storage/Analysis Usage Styles */
.storage-usage-container {
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  background-color: var(--bg-container);
  border: 1px solid var(--border-color);
}

.storage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.storage-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.storage-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.storage-count {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-secondary);
}

.storage-progress-bar {
  width: 100%;
  height: 10px;
  background-color: var(--bg-surface);
  border-radius: var(--radius-full);
  overflow: hidden;
  margin-bottom: var(--spacing-sm);
}

.storage-progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  background-color: var(--primary-color);
  transition: width 0.3s ease;
}

.storage-progress-fill.warning {
  background-color: var(--warning-color);
}

.storage-progress-fill.critical {
  background-color: var(--error-color);
}

.storage-progress-fill.credits {
  background-color: var(--accent-color);
}

.storage-footer {
  display: flex;
  justify-content: space-between;
}

.storage-footer-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.storage-remaining {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

/* Plans Modal Styles */
.plans-modal-card {
  border-radius: var(--radius-lg);
  background-color: var(--bg-surface);
}

.plans-modal-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) 0;
}

.plans-modal-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.12),
    rgba(99, 102, 241, 0.12)
  );
  display: flex;
  align-items: center;
  justify-content: center;
}

.plans-modal-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.plans-modal-body {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.6;
}

.plans-modal-highlight {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  background-color: var(--bg-container);
  text-align: left;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  width: 100%;
}

.plans-modal-highlight--bonus {
  background-color: rgba(250, 204, 21, 0.08);
}

.plans-modal-link {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: var(--font-weight-medium);
}

.plans-modal-link:hover {
  text-decoration: underline;
}

.plans-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

/* Actions */
.settings-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--spacing-lg);
}

/* Responsive */
@media (max-width: 768px) {
  .settings-view {
    padding: var(--spacing-md);
  }

  .setting-item {
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .setting-control {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
  }

  .setting-input,
  .setting-select {
    width: 100%;
  }

  .connection-item {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-md);
  }

  .connection-actions {
    width: 100%;
    justify-content: space-between;
  }

  .storage-footer {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-sm);
  }

  .storage-footer .n-button {
    width: 100%;
  }

  .invite-card-form {
    flex-direction: column;
  }

  .invite-card-input {
    width: 100%;
  }

  .invite-card-form .n-button {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .settings-header {
    margin-bottom: var(--spacing-lg);
  }

  .settings-title {
    font-size: var(--font-size-xl);
  }

  .section-header {
    padding: var(--spacing-md);
  }

  .section-content {
    padding: var(--spacing-md);
  }
}

/* Invite Friends Card Styles */
.invite-card {
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.07) 0%,
    rgba(99, 102, 241, 0.05) 100%
  );
  border: 1px solid rgba(59, 130, 246, 0.2);
  transition: var(--transition-fast);
}

.invite-card:hover {
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.08);
}

.invite-card.disabled {
  opacity: 0.6;
  pointer-events: none;
  cursor: not-allowed;
}

.invite-card.disabled:hover {
  border-color: var(--border-color);
  box-shadow: none;
}

.invite-card-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.invite-icon-wrapper {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.1),
    rgba(99, 102, 241, 0.1)
  );
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.invite-card-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2xs);
  flex: 1;
  min-width: 0;
}

.invite-card-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--accent-color);
}

.invite-card-description {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.invite-card-form {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.invite-card-input {
  flex: 1;
  min-width: 0;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-xl);
}

@media (max-width: 1024px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}

/* Quota request form */
.quota-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  width: 100%;
  text-align: left;
}

.quota-form-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.quota-form-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.quota-required {
  color: var(--error-color);
}

.quota-optional {
  color: var(--text-tertiary, var(--text-secondary));
  font-weight: var(--font-weight-normal);
}

.quota-input-number {
  width: 100%;
}

/* Danger zone */
.danger-zone-item {
  border-bottom: none;
  margin-top: auto;
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--border-color);
}

.danger-label {
  color: var(--error-color) !important;
}

/* Delete Account Modal */
.delete-account-modal-card {
  border-radius: var(--radius-lg);
  background-color: var(--bg-surface);
}

.delete-account-modal-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) 0;
}

.delete-account-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background: rgba(239, 68, 68, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.delete-account-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--error-color);
  margin: 0;
}

.delete-account-body {
  font-size: var(--font-size-base);
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.6;
}

.delete-account-warning {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  background-color: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.2);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  text-align: left;
  width: 100%;
}

.delete-account-confirm-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  margin: 0;
  align-self: flex-start;
}

.delete-account-input {
  width: 100%;
}

.delete-account-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

/* ── Section title + subtitle group ── */
.section-title-group {
  display: flex;
  flex-direction: column;
}

.section-title-links {
  display: flex;
  align-items: center;
  gap: 6px;
}

.section-title-links-sep {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  opacity: 0.5;
}

/* ── Credits Info "Learn more" button ── */
.credits-info-learn-more {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0;
  background: none;
  border: none;
  font-size: var(--font-size-xs);
  color: var(--accent-color);
  cursor: pointer;
  opacity: 0.75;
  transition: opacity 0.15s;
  line-height: 1.4;
}

.credits-info-learn-more:hover {
  opacity: 1;
}

/* ── Credits Info Dialog (shares ChatLab dialog styles) ── */
.credits-info-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 200;
}

.credits-info-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 201;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  width: 560px;
  max-width: 92vw;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.credits-info-pop-enter-active {
  transition: all 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.credits-info-pop-leave-active {
  transition: all 0.15s ease;
}
.credits-info-pop-enter-from {
  opacity: 0;
  transform: translate(-50%, -48%) scale(0.95);
}
.credits-info-pop-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.97);
}

/* Reuse chatlab-info-* classes for header, body, h4, icons */
.credits-info-dialog .chatlab-info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.credits-info-dialog .chatlab-info-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.credits-info-dialog .chatlab-info-icon {
  color: var(--accent-color);
  opacity: 0.8;
}

.credits-info-dialog .chatlab-info-title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.credits-info-dialog .chatlab-info-body {
  padding: var(--spacing-lg) var(--spacing-xl);
  overflow-y: auto;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: var(--line-height-relaxed);
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

.credits-info-dialog .chatlab-info-body p {
  margin: 0 0 var(--spacing-md) 0;
}

.credits-info-dialog .chatlab-info-h4 {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: var(--spacing-lg) 0 var(--spacing-sm) 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.credits-info-dialog .chatlab-info-h4:first-child {
  margin-top: 0;
}

.credits-info-dialog .chatlab-h4-icon {
  flex-shrink: 0;
}

.credits-info-dialog .chatlab-h4-icon--can {
  color: var(--success-color, #52c41a);
}

.credits-info-dialog .chatlab-info-body ul {
  margin: 0 0 var(--spacing-md) 0;
  padding-left: var(--spacing-lg);
}

.credits-info-dialog .chatlab-info-body li {
  margin-bottom: var(--spacing-xs);
}

.credits-info-dialog .chatlab-info-body li::marker {
  color: var(--accent-color);
}

/* ── Daily free credits callout (distinct info box at the bottom) ── */
.credits-info-dialog .daily-free-callout {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-md);
  border-radius: var(--radius-md);
  background: linear-gradient(
    135deg,
    rgba(16, 185, 129, 0.08),
    rgba(59, 130, 246, 0.06)
  );
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.credits-info-dialog .daily-free-callout-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: var(--spacing-xs);
}

.credits-info-dialog .daily-free-callout-icon {
  color: var(--success-color, #10b981);
  flex-shrink: 0;
}

.credits-info-dialog .daily-free-callout-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.credits-info-dialog .daily-free-callout-text {
  margin: 0 !important;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.credits-info-dialog .daily-free-callout-text--note {
  margin-top: var(--spacing-sm) !important;
  opacity: 0.8;
}

.credits-info-dialog .daily-free-callout-list {
  list-style: none;
  margin: var(--spacing-sm) 0 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.credits-info-dialog .daily-free-callout-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--font-size-sm);
}

.credits-info-dialog .daily-free-callout-tool {
  color: var(--text-primary);
  font-weight: var(--font-weight-medium);
}

.credits-info-dialog .daily-free-callout-quota {
  color: var(--success-color, #10b981);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

/* ── Free Quota Dialog table ── */
.free-quota-dialog {
  width: 400px;
}

.free-quota-table {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  font-size: var(--font-size-sm);
}

.free-quota-table-header {
  display: flex;
  justify-content: space-between;
  padding: 8px var(--spacing-md);
  background-color: var(--bg-elevated);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.free-quota-table-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px var(--spacing-md);
  border-top: 1px solid var(--border-color);
  color: var(--text-primary);
}

.free-quota-table-row--muted {
  opacity: 0.55;
}

.free-quota-value {
  color: var(--success-color, #10b981);
  font-weight: var(--font-weight-semibold);
  font-variant-numeric: tabular-nums;
}

.free-quota-value--none {
  color: var(--text-secondary);
  font-weight: var(--font-weight-normal);
  font-style: italic;
}

.free-quota-row-label {
  display: inline-flex;
  align-items: center;
}

.credits-daily-quota-row {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--spacing-xs);
}
</style>
