// config/chatTemplates/portfolioBuilder.js

import { RefreshOutline } from "@vicons/ionicons5";
import { TOOL_ICONS, getToolById } from "@/config/toolsConfig";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds";

const PortfolioIcon = TOOL_ICONS[getToolById("portfolios").icon];

/**
 * Chat-assisted portfolio building.
 *
 * The user states a direction once, then curates round by round: the assistant
 * proposes photos, the user keeps the ones that work with the ✓ button, and the
 * kept set — which the assistant can see — becomes the portfolio when they hit
 * the CTA in the selection panel.
 */
export default {
  id: "portfolio-builder",

  modal: {
    title: "Chat Assisted Portfolio",
    subtitle:
      "Curate round by round, keep what works, build when it holds together.",
    icon: PortfolioIcon,
  },

  // ── Setup form ────────────────────────────────────────────────────────────
  setup: {
    title: "Chat Assisted Portfolio",
    description:
      "Tell the assistant what you're after. It will start proposing photos right away, and you keep the ones that earn their place.",
    submitLabel: "Start curating",
    notice:
      "Every round costs credits, like any ChatLab message. The cost per round depends on the intelligence mode you pick.",
    // Rendered as titled cards, in this order. A field names the section it
    // belongs to; anything unassigned falls to the end, outside the cards.
    sections: [
      { id: "brief", title: "1. The brief" },
      { id: "scope", title: "2. Where to look" },
      { id: "rounds", title: "3. How the session runs" },
    ],
    fields: [
      {
        key: "name",
        section: "brief",
        type: "text",
        label: "Portfolio name",
        required: true,
        maxlength: 200,
        placeholder: "e.g. 'Urban Stories 2025' or 'Night Light Series'…",
      },
      {
        key: "theme",
        section: "brief",
        type: "textarea",
        label: "Theme & direction",
        required: true,
        maxlength: 500,
        minRows: 3,
        maxRows: 6,
        placeholder:
          "e.g. 'European cities at night — moody, wet asphalt, solitary figures. No tourists, no landmarks. I want it to feel like walking home late.'",
        help: "The assistant reads this on every turn, so be as specific about what you want as about what you don't. You can still make adjustments during the chat session.",
      },
      {
        key: "collectionIds",
        section: "scope",
        type: "collections",
        label: "Search only in these collections",
        placeholder: "All collections",
        help: "Leave empty to curate from your whole catalog. The restriction is applied on every round of the session — though you can still pull something in from outside by @-mentioning it.",
        // Blocks the session when the pinned collections hold fewer analyzed photos
        // than the value of THIS other field. Curating 20 photos out of a pool of 12
        // isn't a tight brief, it's an impossible one — and the assistant would spend
        // rounds (and credits) discovering that.
        atLeast: "targetSize",
      },
      {
        key: "modeId",
        section: "rounds",
        type: "intelligenceMode",
        label: "Intelligence mode",
        // Portfolio-specific framing; overrides the generic backend copy.
        notes: {
          scout:
            "Fastest and cheapest. Good for a broad first sweep of a large catalog.",
          default: "The balanced option. Right for most portfolios.",
          curator_plus:
            "Deepest aesthetic judgment. Noticeably more expensive per round.",
        },
      },
      {
        key: "targetSize",
        section: "rounds",
        type: "slider",
        label: "Portfolio size",
        min: 10,
        max: 50,
        step: 5,
        default: 20,
        unit: "photos",
        marks: { 10: "10", 20: "20", 30: "30", 40: "40", 50: "50" },
        help: "A target, not a cap — you decide when the selection is done.",
      },
      {
        key: "photosPerTurn",
        section: "rounds",
        type: "slider",
        label: "Photos per round",
        min: 5,
        max: 20,
        step: 2,
        default: 10,
        unit: "per turn",
        marks: { 5: "5", 10: "10", 15: "15", 20: "20" },
        help: "How many photos the assistant shows each turn. A round can hold 20 at most.",
      },
    ],
  },

  // ── How the chat itself behaves during the session ────────────────────────
  session: {
    // Matches the id in api/app/services/chat_templates_service.ts, which owns the
    // tool allowlist and the phase prompts for this session. Sent on every turn.
    backendId: "portfolio-builder",
    modeField: "modeId",
    // Which answer holds the collection ids ChatView re-sends on every turn. The
    // server enforces them inside search_advanced; nothing here can lift them.
    scopeField: "collectionIds",
    hideHistory: true,
    hideNewChat: true,
    hideActions: true,
    hideTopbar: true,
    pinSelectionPanel: true,
    // The opening turn is the generated brief below, not something the user
    // typed — it would be unrecognisable in the sidebar. Kept out of the history
    // entirely, which is also what lets the friendly mask stay display-only.
    hiddenConversation: true,
  },

  // ── The opening brief ─────────────────────────────────────────────────────
  // Sent as the first user message. The backend pins the first user turn above
  // the context window once it slides (ConversationService.buildOpeningMessage),
  // so this stays in force for the whole conversation without any extra plumbing.
  // PARAMETERS ONLY — deliberately. How the assistant should behave in this session
  // (rounds, grouping, reading the selection, what not to offer, how long to write) lives
  // in the server-side template's phase2Addendum, NOT here. Two reasons: this is a USER
  // message, and a rule stated by the user is negotiable — a later turn contradicts it and
  // it degrades into a preference, while the system prompt applies with full authority on
  // every turn. And these four values are the one thing the server cannot know on its own,
  // which is the whole job of this text.
  buildPrompt: (
    v,
  ) => `I want to build a photography portfolio from my catalog. This is the brief for the session:

**Portfolio name:** ${v.name.trim()}
**Theme and direction:** ${v.theme.trim()}
**Target size:** around ${v.targetSize} photos in the finished portfolio.
**Photos per round:** about ${v.photosPerTurn}.

Let's begin with the first round.`,

  // What the user sees in their own bubble instead of the brief above.
  maskMessage: (v) =>
    `Let's build "${v.name.trim()}" — a portfolio of around ${v.targetSize} photos.\n\n${v.theme.trim()}`,

  // ── Fixed chips under a reply ─────────────────────────────────────────────
  // Phase 3 suggested actions are off in this session (`hideActions`), and its
  // rounds are long: by the time the user reaches the end of a bubble holding a
  // dozen photos, the footer is what they are looking at — not the sentence at
  // the top offering another round. So the offer is also placed where the eye
  // lands. Declarative and local: `send` is the literal message posted on click.
  messageActions: [
    {
      id: "show-more",
      label: "Show me more",
      tooltip: "Bring another round of photos you haven't been shown yet",
      icon: RefreshOutline,
      send: "show me more",
      // Only under the newest reply that actually put photos on screen: "more"
      // is relative to everything shown so far, so offering it halfway up the
      // transcript would say something the click doesn't do.
      when: (message, { isLatest }) =>
        isLatest && !message.isError && (message.photoLists?.length ?? 0) > 0,
    },
  ],

  // ── Help shown once, after the first reply lands ──────────────────────────
  hint: {
    storageKey: "chat_template_hint_portfolio_builder",
    title: "Keep the ones that work",
    body: "Hover any photo and hit the ✓ to send it to your curated selection. Whole group at once with the ✓✓ next to its label. That selection is what becomes your portfolio — and the assistant reads it to know what's still missing.",
  },

  // ── Warn before discarding an in-progress session ─────────────────────────
  // `hiddenConversation` keeps this session out of the history list, so once
  // it's closed there is no way back into it — closing mid-curation is real
  // data loss, not a click away from a resume.
  closeConfirm: {
    title: "Close this chat?",
    message:
      "You'll lose this conversation and the photos you've curated so far — there's no way back into this session once it's closed.",
  },

  // ── The selection panel's call to action ──────────────────────────────────
  panelAction: {
    label: "Create your Portfolio",
    icon: PortfolioIcon,
    /** Half the target, floored at 5 — below that there is no portfolio to make. */
    minPhotos: (v) => Math.max(5, Math.round((v.targetSize ?? 20) / 2)),
    /** Drives the "12 / 20" counter in the panel header. */
    target: (v) => v.targetSize ?? null,
    hint: (count, min) =>
      `Curate ${min - count} more photo${min - count === 1 ? "" : "s"} to continue`,

    // Dismissable heads-up before the action runs — creating the portfolio ends
    // this chat session, which isn't obvious from the button label alone.
    confirm: {
      storageKey: "chat_template_confirm_portfolio_builder",
      title: "Close chat and create portfolio?",
      message: (v) =>
        `This will end the chat session and create "${v.name.trim()}" from your curated photos. You can keep refining it afterwards from the Portfolios tab.`,
    },

    async run({ photoIds, values, context }) {
      const store = usePortfolioBuildsStore();
      const name = values.name.trim();

      // Same two steps the "create portfolio from these photos" path in
      // CollectionModal uses: an empty manual build, then the layout endpoint.
      const { buildId } = await store.createManual({
        name,
        description: values.theme.trim() || undefined,
        setId: context?.setId ?? null,
      });
      const { added } = await store.addPhotosToBuild(buildId, photoIds);

      // The freshly created portfolio isn't in the cached list yet.
      await store.fetchBuilds();

      return {
        buildId,
        successMessage: `"${name}" created with ${added} photo${added === 1 ? "" : "s"}`,
      };
    },
  },
};
