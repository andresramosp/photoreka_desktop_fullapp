/**
 * useDemoSafeSearch
 *
 * Detects inappropriate search queries for demo users and enforces a two-strike policy:
 *   - Strike 1 → show a warning modal explaining the app's purpose.
 *   - Strike 2 → log the user out and set a localStorage ban flag.
 *
 * Ban persistence: even after logout the ban flag stays in localStorage so the
 * demo session cannot be reused in the same browser.
 */
import { ref, computed } from "vue";
import { useUserStore } from "@/stores/userStore";
import { useRouter } from "vue-router";

// ── Keyword list ──────────────────────────────────────────────────────────────
// Covers explicit sexual content in English and Spanish.
// Intentionally kept as simple lowercase stems so partial matches are caught.
const BLOCKED_KEYWORDS = [
  // English
  "porn",
  "porno",
  "pornography",
  "xxx",
  "sex",
  "sexy",
  "nude",
  "nudes",
  "naked",
  "nsfw",
  "erotic",
  "erotica",
  "hentai",
  "boobs",
  "tits",
  "ass",
  "vagina",
  "penis",
  "cock",
  "pussy",
  "fuck",
  "fucking",
  "blowjob",
  "cumshot",
  "creampie",
  "gangbang",
  "milf",
  "dildo",
  "masturbat",
  "orgasm",
  "fetish",
  "bdsm",
  "onlyfans",
  "stripper",
  "escort",
  "prostitut",
  "whore",
  "slut",

  // Spanish
  "porno",
  "pornografia",
  "pornografía",
  "sexo",
  "sexy",
  "desnuda",
  "desnudo",
  "desnudos",
  "desnudas",
  "follando",
  "follar",
  "coño",
  "polla",
  "pene",
  "tetas",
  "culo",
  "culito",
  "puta",
  "putita",
  "prostituta",
  "escort",
  "masturbaci",
  "orgasmo",
  "erótico",
  "erotico",
  "erótica",
  "erotica",
  "lencería",
  "lenceria",
  "stripper",
  "onlyfans",
];

// ── Storage keys ──────────────────────────────────────────────────────────────
const LS_BAN_KEY = "photoreka_demo_ban";
const LS_WARN_KEY = "photoreka_demo_warn_count";

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD") // decompose accented chars
    .replace(/[\u0300-\u036f]/g, ""); // strip accent marks
}

function containsBlockedKeyword(query) {
  const normalized = normalizeText(query);
  return BLOCKED_KEYWORDS.some((kw) => {
    const normKw = normalizeText(kw);
    // Word-boundary-aware: match if the keyword appears as a token
    // (preceded/followed by a non-word char or string boundary).
    const re = new RegExp(`(^|[^a-z])${normKw}([^a-z]|$)`);
    return re.test(normalized);
  });
}

// ── Composable ────────────────────────────────────────────────────────────────
export function useDemoSafeSearch() {
  const userStore = useUserStore();
  const router = useRouter();

  const isDemoUser = computed(
    () => userStore.user?.email === "demo@photorekatest.com",
  );

  // Modal visibility state
  const showWarningModal = ref(false);
  // "warning" → first strike, "banned" → second strike (auto-logout)
  const warningType = ref("warning");

  /** Returns true when the query should be blocked. */
  function checkQuery(query) {
    if (!isDemoUser.value) return false;
    if (!query || !query.trim()) return false;

    // If already banned, block silently (logout will have already fired).
    if (localStorage.getItem(LS_BAN_KEY) === "true") {
      _enforceBan();
      return true;
    }

    if (!containsBlockedKeyword(query)) return false;

    // Increment the warning counter
    const currentCount = parseInt(localStorage.getItem(LS_WARN_KEY) || "0", 10);
    const newCount = currentCount + 1;
    localStorage.setItem(LS_WARN_KEY, String(newCount));

    if (newCount === 1) {
      // First offence – show a friendly warning
      warningType.value = "warning";
      showWarningModal.value = true;
    } else {
      // Second offence (or more) – ban & logout
      warningType.value = "banned";
      showWarningModal.value = true;
      _enforceBan();
    }

    return true; // caller should abort the search
  }

  /** Called when the "banned" modal is dismissed (or immediately on second strike). */
  function _enforceBan() {
    localStorage.setItem(LS_BAN_KEY, "true");
    // Give the modal a moment to render before logging out
    setTimeout(() => {
      userStore.logout();
      router.replace({ name: "login" });
    }, 2500);
  }

  function closeWarningModal() {
    showWarningModal.value = false;
  }

  /** True when this browser has been permanently banned from using the demo. */
  const isBanned = computed(() => localStorage.getItem(LS_BAN_KEY) === "true");

  return {
    isDemoUser,
    isBanned,
    checkQuery,
    showWarningModal,
    warningType,
    closeWarningModal,
  };
}
