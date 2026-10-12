<template>
  <div class="pk-site" :data-theme="theme">
    <header
      class="pk-header"
      :class="{ 'is-scrolled': isScrolled, 'is-open': menuOpen }"
    >
      <RouterLink class="pk-brand" :to="homeRoute" @click="closeMenus">
        {{ displayName }}
      </RouterLink>

      <nav class="pk-nav" aria-label="Portfolios">
        <div ref="dropdownRef" class="pk-dropdown">
          <button
            type="button"
            class="pk-nav-link"
            :class="{ 'is-active': dropdownOpen }"
            :aria-expanded="dropdownOpen"
            @click="dropdownOpen = !dropdownOpen"
          >
            Portfolios
            <svg class="pk-caret" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M2.5 4.5 6 8l3.5-3.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
              />
            </svg>
          </button>
          <Transition name="pk-pop">
            <ul v-if="dropdownOpen" class="pk-menu">
              <li v-for="item in items" :key="item.slug">
                <RouterLink
                  class="pk-menu-link"
                  :class="{ 'is-current': item.slug === currentSlug }"
                  :to="routeFor(item)"
                  @click="closeMenus"
                >
                  {{ item.title }}
                </RouterLink>
              </li>
            </ul>
          </Transition>
        </div>
      </nav>

      <div class="pk-actions">
        <button
          type="button"
          class="pk-icon-btn"
          :aria-label="theme === 'dark' ? 'Switch to light' : 'Switch to dark'"
          @click="toggleTheme"
        >
          <svg v-if="theme === 'dark'" viewBox="0 0 24 24" aria-hidden="true">
            <circle
              cx="12"
              cy="12"
              r="4"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
            />
            <path
              d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <button
          type="button"
          class="pk-icon-btn pk-burger"
          :class="{ 'is-open': menuOpen }"
          aria-label="Menu"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <span></span>
          <span></span>
        </button>
      </div>
    </header>

    <Transition name="pk-sheet">
      <nav v-if="menuOpen" class="pk-mobile-menu" aria-label="Portfolios">
        <p class="pk-mobile-heading">Portfolios</p>
        <RouterLink
          v-for="item in items"
          :key="item.slug"
          class="pk-mobile-link"
          :class="{ 'is-current': item.slug === currentSlug }"
          :to="routeFor(item)"
          @click="closeMenus"
        >
          {{ item.title }}
        </RouterLink>
      </nav>
    </Transition>

    <main class="pk-main">
      <div v-if="notFound" class="pk-empty">
        <p class="pk-empty-title">This page doesn't exist</p>
        <p class="pk-empty-text">There is nothing published at this address.</p>
      </div>

      <Transition v-else name="pk-fade" mode="out-in">
        <PublicPortfolioGrid
          v-if="portfolio"
          :key="portfolio.slug"
          :photos="portfolio.photos"
          :grid-settings="portfolio.gridSettings"
          @open="openLightbox"
        />
        <div v-else-if="portfolioMissing" key="missing" class="pk-empty">
          <p class="pk-empty-title">Portfolio not found</p>
          <p class="pk-empty-text">It may have been unpublished.</p>
        </div>
        <div
          v-else-if="profile && items.length === 0"
          key="none"
          class="pk-empty"
        >
          <p class="pk-empty-text">Nothing published yet.</p>
        </div>
        <div v-else key="loading" class="pk-loading" aria-busy="true"></div>
      </Transition>
    </main>

    <footer class="pk-footer">
      <a href="https://photoreka.com" target="_blank" rel="noopener">
        Made with Photoreka
      </a>
    </footer>

    <PublicLightbox
      v-model:index="lightboxIndex"
      :photos="portfolio?.photos || []"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute, RouterLink } from "vue-router";
import axios from "axios";
import PublicPortfolioGrid from "@/components/public-site/PublicPortfolioGrid.vue";
import PublicLightbox from "@/components/public-site/PublicLightbox.vue";

defineOptions({ name: "PublicSiteView" });

const THEME_KEY = "photoreka-public-theme";
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@400;500&display=swap";

const route = useRoute();

// Bare client on purpose: no auth header, no session-expiry redirect.
const http = axios.create({ baseURL: import.meta.env.VITE_MAIN_API_BASE_URL });

// ── Theme ──────────────────────────────────────────────────
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const storedTheme = readStoredTheme();
const theme = ref(storedTheme || (systemDark.matches ? "dark" : "light"));

function readStoredTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(THEME_KEY, theme.value);
  } catch {
    // Private mode: the toggle still works for this visit.
  }
}

// Follow the OS only while the visitor hasn't chosen explicitly.
function onSystemThemeChange(event) {
  if (readStoredTheme()) return;
  theme.value = event.matches ? "dark" : "light";
}

// ── Data ───────────────────────────────────────────────────
const profile = ref(null);
const portfolio = ref(null);
const notFound = ref(false);
const portfolioMissing = ref(false);

const username = computed(() => String(route.params.username || ""));
const items = computed(() => profile.value?.items || []);
const displayName = computed(
  () => profile.value?.displayName || profile.value?.username || "",
);
const currentSlug = computed(() => portfolio.value?.slug || null);
const homeRoute = computed(() => ({
  name: "public-profile",
  params: { username: username.value },
}));

// The first published portfolio is the home page, so it keeps the clean URL.
function routeFor(item) {
  if (items.value[0]?.slug === item.slug) return homeRoute.value;
  return {
    name: "public-portfolio",
    params: { username: username.value, slug: item.slug },
  };
}

async function loadProfile() {
  notFound.value = false;
  profile.value = null;
  portfolio.value = null;
  try {
    const response = await http.get(
      `/api/public/${encodeURIComponent(username.value)}`,
    );
    profile.value = response.data;
  } catch {
    notFound.value = true;
  }
}

async function loadPortfolio(slug) {
  portfolioMissing.value = false;
  if (!slug) {
    portfolio.value = null;
    return;
  }
  try {
    const response = await http.get(
      `/api/public/${encodeURIComponent(username.value)}/${encodeURIComponent(slug)}`,
    );
    portfolio.value = response.data;
  } catch {
    portfolio.value = null;
    portfolioMissing.value = true;
  }
}

const requestedSlug = computed(() => {
  const fromRoute = route.params.slug;
  if (fromRoute) return String(fromRoute);
  return items.value[0]?.slug || null;
});

watch(username, loadProfile, { immediate: true });

watch(
  [requestedSlug, profile],
  ([slug, loadedProfile]) => {
    if (!loadedProfile) return;
    if (slug === portfolio.value?.slug) return;
    loadPortfolio(slug);
  },
  { immediate: true },
);

watch(
  [portfolio, displayName],
  ([current, name]) => {
    if (!name) return;
    document.title = current ? `${current.title} — ${name}` : name;
  },
  { immediate: true },
);

// ── Menus ──────────────────────────────────────────────────
const dropdownRef = ref(null);
const dropdownOpen = ref(false);
const menuOpen = ref(false);

function closeMenus() {
  dropdownOpen.value = false;
  menuOpen.value = false;
}

function onDocumentClick(event) {
  if (dropdownOpen.value && !dropdownRef.value?.contains(event.target)) {
    dropdownOpen.value = false;
  }
}

function onKeydown(event) {
  if (event.key === "Escape") closeMenus();
}

watch(() => route.fullPath, closeMenus);

// ── Lightbox ───────────────────────────────────────────────
const lightboxIndex = ref(-1);

function openLightbox(index) {
  lightboxIndex.value = index;
}

// ── Header ─────────────────────────────────────────────────
const isScrolled = ref(false);

function onScroll() {
  isScrolled.value = window.scrollY > 4;
}

function ensureFonts() {
  if (document.querySelector("link[data-pk-fonts]")) return;
  const preconnect = document.createElement("link");
  preconnect.rel = "preconnect";
  preconnect.href = "https://fonts.gstatic.com";
  preconnect.crossOrigin = "anonymous";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = FONTS_HREF;
  link.dataset.pkFonts = "true";
  document.head.append(preconnect, link);
}

onMounted(() => {
  ensureFonts();
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeydown);
  systemDark.addEventListener("change", onSystemThemeChange);
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
  document.removeEventListener("click", onDocumentClick);
  document.removeEventListener("keydown", onKeydown);
  systemDark.removeEventListener("change", onSystemThemeChange);
});
</script>

<style scoped>
/* ── Tokens ──────────────────────────────────────────────── */
.pk-site {
  --pk-serif: "Cormorant Garamond", "Times New Roman", Georgia, serif;
  --pk-sans: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --pk-gutter: 250px;
  --pk-header-h: 76px;
  --pk-ease: cubic-bezier(0.22, 1, 0.36, 1);

  --pk-bg: #ffffff;
  --pk-fg: #141414;
  --pk-muted: #767676;
  --pk-line: rgba(0, 0, 0, 0.08);
  --pk-header-bg: rgba(255, 255, 255, 0.82);
  --pk-menu-bg: #ffffff;
  --pk-placeholder: #f1f1f1;

  min-height: 100svh;
  display: flex;
  flex-direction: column;
  background: var(--pk-bg);
  color: var(--pk-fg);
  font-family: var(--pk-sans);
  -webkit-font-smoothing: antialiased;
  transition:
    background-color 0.4s var(--pk-ease),
    color 0.4s var(--pk-ease);
}

.pk-site[data-theme="dark"] {
  --pk-bg: #0e0e0e;
  --pk-fg: #f0efec;
  --pk-muted: #8f8f8f;
  --pk-line: rgba(255, 255, 255, 0.1);
  --pk-header-bg: rgba(14, 14, 14, 0.78);
  --pk-menu-bg: #161616;
  --pk-placeholder: #1a1a1a;
}

/* ── Header ──────────────────────────────────────────────── */
.pk-header {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 20;
  height: var(--pk-header-h);
  padding: 0 var(--pk-gutter);
  display: flex;
  align-items: center;
  gap: 32px;
  background: transparent;
  transition:
    background-color 0.4s var(--pk-ease),
    box-shadow 0.4s var(--pk-ease);
}

.pk-header.is-scrolled,
.pk-header.is-open {
  background: var(--pk-header-bg);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  box-shadow: 0 1px 0 var(--pk-line);
}

.pk-brand {
  font-family: var(--pk-serif);
  font-size: 26px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: inherit;
  text-decoration: none;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity 0.3s var(--pk-ease);
}

.pk-brand:hover {
  opacity: 0.7;
}

.pk-nav {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 28px;
}

.pk-nav-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  cursor: pointer;
  transition: opacity 0.3s var(--pk-ease);
}

.pk-nav-link:hover,
.pk-nav-link.is-active {
  opacity: 0.6;
}

.pk-caret {
  width: 11px;
  height: 11px;
  transition: transform 0.3s var(--pk-ease);
}

.pk-nav-link.is-active .pk-caret {
  transform: rotate(180deg);
}

.pk-dropdown {
  position: relative;
}

.pk-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  min-width: 220px;
  margin: 0;
  padding: 10px 0;
  list-style: none;
  background: var(--pk-menu-bg);
  border: 1px solid var(--pk-line);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.12);
}

.pk-menu-link {
  display: block;
  padding: 10px 22px;
  color: inherit;
  text-decoration: none;
  font-size: 13.5px;
  letter-spacing: 0.02em;
  white-space: nowrap;
  transition:
    opacity 0.25s var(--pk-ease),
    padding-left 0.25s var(--pk-ease);
}

.pk-menu-link:hover {
  opacity: 0.6;
  padding-left: 26px;
}

.pk-menu-link.is-current {
  font-weight: 500;
}

.pk-menu-link.is-current::before {
  content: "";
  display: inline-block;
  width: 4px;
  height: 4px;
  margin-right: 10px;
  vertical-align: middle;
  border-radius: 50%;
  background: currentColor;
}

.pk-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.pk-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  transition: opacity 0.3s var(--pk-ease);
}

.pk-icon-btn:hover {
  opacity: 0.6;
}

.pk-icon-btn svg {
  width: 20px;
  height: 20px;
}

.pk-burger {
  display: none;
  flex-direction: column;
  gap: 6px;
}

.pk-burger span {
  display: block;
  width: 20px;
  height: 1.4px;
  background: currentColor;
  transition: transform 0.35s var(--pk-ease);
}

.pk-burger.is-open span:first-child {
  transform: translateY(3.7px) rotate(45deg);
}

.pk-burger.is-open span:last-child {
  transform: translateY(-3.7px) rotate(-45deg);
}

/* ── Mobile menu ─────────────────────────────────────────── */
.pk-mobile-menu {
  position: fixed;
  top: var(--pk-header-h);
  left: 0;
  right: 0;
  z-index: 19;
  padding: 12px var(--pk-gutter) 28px;
  background: var(--pk-header-bg);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  box-shadow: 0 1px 0 var(--pk-line);
}

.pk-mobile-heading {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--pk-muted);
}

.pk-mobile-link {
  display: block;
  padding: 12px 0;
  border-bottom: 1px solid var(--pk-line);
  color: inherit;
  text-decoration: none;
  font-family: var(--pk-serif);
  font-size: 22px;
  transition: opacity 0.25s var(--pk-ease);
}

.pk-mobile-link:last-child {
  border-bottom: 0;
}

.pk-mobile-link:hover {
  opacity: 0.6;
}

.pk-mobile-link.is-current {
  font-weight: 600;
}

/* ── Main ────────────────────────────────────────────────── */
.pk-main {
  flex: 1;
  padding: calc(var(--pk-header-h) + 24px) var(--pk-gutter) 48px;
}

.pk-loading {
  min-height: 60vh;
}

.pk-empty {
  min-height: 50vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
}

.pk-empty-title {
  margin: 0;
  font-family: var(--pk-serif);
  font-size: 32px;
  font-weight: 500;
}

.pk-empty-text {
  margin: 0;
  color: var(--pk-muted);
  font-size: 14px;
}

/* ── Footer ──────────────────────────────────────────────── */
.pk-footer {
  padding: 24px var(--pk-gutter) 32px;
  text-align: center;
}

.pk-footer a {
  color: var(--pk-muted);
  text-decoration: none;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.7;
  transition: opacity 0.3s var(--pk-ease);
}

.pk-footer a:hover {
  opacity: 1;
}

/* ── Transitions ─────────────────────────────────────────── */
.pk-fade-enter-active {
  transition: opacity 0.5s var(--pk-ease);
}

.pk-fade-leave-active {
  transition: opacity 0.25s var(--pk-ease);
}

.pk-fade-enter-from,
.pk-fade-leave-to {
  opacity: 0;
}

.pk-pop-enter-active,
.pk-pop-leave-active {
  transition:
    opacity 0.25s var(--pk-ease),
    transform 0.25s var(--pk-ease);
}

.pk-pop-enter-from,
.pk-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.pk-sheet-enter-active,
.pk-sheet-leave-active {
  transition:
    opacity 0.3s var(--pk-ease),
    transform 0.3s var(--pk-ease);
}

.pk-sheet-enter-from,
.pk-sheet-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ── Responsive ──────────────────────────────────────────── */
@media (max-width: 1100px) {
  .pk-site {
    --pk-gutter: 64px;
  }
}

@media (max-width: 760px) {
  .pk-site {
    --pk-gutter: 24px;
    --pk-header-h: 62px;
  }

  .pk-brand {
    font-size: 21px;
  }

  .pk-nav {
    display: none;
  }

  .pk-actions {
    margin-left: auto;
  }

  .pk-burger {
    display: inline-flex;
  }

  .pk-main {
    padding-top: calc(var(--pk-header-h) + 14px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pk-site *,
  .pk-site *::before,
  .pk-site *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
</style>
