/**
 * app_knowledge_content.ts
 * ─────────────────────────────────────────────────────────────
 * Static knowledge blocks served to the AI agent so it can
 * answer user questions about the app itself.
 *
 * Edit this file freely — no code changes required elsewhere.
 * ─────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────
// SECTION 1 — Terms & Privacy
// ─────────────────────────────────────────────────────────────
export const TERMS_AND_PRIVACY = `
## Photoreka — Terms of Use and Image Policy

### 1. Acceptance of Terms
By using Photoreka, you agree to comply with these Terms of Use and our Image Policy. If you do not agree, do not use the platform.

### 2. User Account and Responsibilities
- You are responsible for maintaining the confidentiality of your account.
- You must ensure that any content uploaded does not infringe third-party rights.

### 3. Image Ownership
- You retain 100% ownership and copyright of all images uploaded.
- Photoreka does not sell, license, or redistribute your images without your explicit consent.

### 4. Image Storage and Resolution
- Only reduced, low-resolution versions are stored on secure servers (Cloudflare R2) for analysis, searches, and previews.
- Original images are not permanently stored.
- Data is encrypted in transit and at rest.

### 5. Image Processing with AI
- Images are only analyzed to extract narrative and contextual tags, as well as other visual and technical aspects.
- Images are only analyzed; they are not edited, transformed, or altered in any way during processing.
- Processing uses proprietary open-source AI models and third-party AI models (including Google services) under paid/private plans that don't use images to train their models.
- Images may be temporarily transmitted to these providers solely for the requested functionality and under confidentiality agreements; they are not stored in this process.
- **Consent regarding AI processing:** By using Photoreka, you acknowledge and accept that your images will be processed using AI models as described above. If you do not agree, you should refrain from uploading images or using the platform.

### 6. Sharing and Third Parties
- Images are never shared publicly or with unauthorized third parties.
- Third-party service providers may access images only as strictly necessary for platform functionality and under binding confidentiality obligations.

### 7. Retention and Deletion
- You can delete your images at any time.
- Upon deletion, stored copies and derived data are removed within 30 days, except where legal retention obligations apply.

### 8. Limited License
By uploading images, you grant Photoreka a limited, non-exclusive, revocable license to store, process, and analyze images solely to provide platform functionalities.

### 9. Liability and Disclaimer
- Photoreka provides services "as is."
- We are not liable for any indirect damages arising from the use of the platform.
- Users are responsible for the legality and appropriateness of uploaded content.

### 10. Sensitive and Personal Images Disclaimer
Photoreka is intended solely for the management and analysis of artistic or documentary photographic bodies of work suitable for public or professional presentation. The platform is not recommended for the storage or processing of sensitive, private, or personal images. Users are strongly advised not to upload images containing personal, confidential, or sensitive content. Photoreka expressly disclaims any responsibility for potential data breaches or unauthorized disclosures of such content. By using Photoreka, you acknowledge that the platform is not liable for any consequences arising from the upload of sensitive or personal images.
`.trim()

// ─────────────────────────────────────────────────────────────
// SECTION 2 — General Usage & Help
// ─────────────────────────────────────────────────────────────
export const USAGE_AND_HELP = `
# Photoreka — Knowledge Base for Chatbot Assistant

> This document describes in detail every tool, section, and key concept of the Photoreka app. It is designed to be injected as system context into a chatbot assistant. It covers purpose, usage flow, expected behavior, tips, and FAQs for each section.

---

## What is Photoreka?

Photoreka is an **intelligent photo curation and organization platform** designed for photographers. It uses artificial intelligence to analyze, classify, score, and help rediscover photos in your catalog. The core workflow is:

1. **Upload photos** (Sync Area → Lightbox)
2. **Process them with AI** (Sync Area → Analysis)
3. **Explore and work with them** using the rest of the tools (Search, Canvas, Collections, Atlas, etc.)

The app is available on desktop and mobile, although some tools are desktop-only (Canvas, 3D Atlas, Series, Grid Maker).

---

## PHOTO LIFE CYCLE

Photos move through several internal states:

| State           | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| uploaded        | Just uploaded, not analyzed                                  |
| preprocessing   | Basic pre-analysis in progress                               |
| preprocessed    | Pre-analysis completed, ready for full analysis              |
| processing      | Full AI analysis in progress                                 |
| processed       | Fully analyzed and available in all tools                    |

Photos only appear in tools like Search, Collections, Atlas, etc. when they are in the "processed" state. Photos in "uploaded", "preprocessing", and "preprocessed" states are only visible in the **Sync Area**.

> **Tip:** If photos do not appear in Search or Workspace, they likely haven’t been processed yet. Go to Sync Area → Lightbox tab and click "Analyze Photos".

---

## 1. DASHBOARD (/dashboard)

**Purpose:** Home screen after authentication. Acts as a navigation hub and general status overview.

**Displays:**
- Personalized greeting with the user’s name
- **Daily Eureka Card**: one catalog photo selected for rediscovery
- Quick access to main tools: Canvas (with saved canvas preview), Workspace, Report & Statistics, Explorer (on mobile)
- **Recent Collections & Series** section

**Behavior:**
- If there are no processed photos, most shortcuts appear locked (disabled with visual indicator)
- On mobile, some desktop-only tools are hidden or replaced (e.g., Explorer instead of Canvas)
- The Daily Eureka Card appears only if there are processed photos

---

## 2. SYNC AREA (/sync-area)

**Purpose:** Entry point for importing and processing photos. First tool new users should use.

**Two tabs:**

### Lightbox Tab
- Lists all photos in "uploaded", "preprocessing", or "preprocessed" states
- Allows uploading new photos (drag & drop or file selector)
- Allows connecting external sources: **Lightroom** and **Google Photos**
- Allows selecting photos individually or in bulk to send for analysis
- Floating **"Analyze Photos"** button appears when there are photos in the lightbox

### Analyses Tab
- Shows photos currently being analyzed ("processing" state)
- Displays analysis progress
- Allows navigating back to Lightbox

**"Analyze Photos" Button:**
- Appears floating when photos are in the lightbox
- Enabled when at least 1 photo is "preprocessed" or "uploaded"
- Shows "processing" state while analysis is running
- Triggers backend AI analysis

**Typical Flow:**
1. Open Sync Area
2. Upload photos or connect Lightroom/Google Photos
3. Photos move from "uploaded" → "preprocessing" → "preprocessed"
4. Click "Analyze Photos"
5. Wait until photos become "processed"
6. Once processed, photos are available in all tools

> **Tip:** You can analyze photos in batches. You don’t need to wait for all of them to finish before using tools with those already processed.

---

## 3. WORKSPACE (/workspace)

**Purpose:** Library view of all **processed** photos. Main reference point of the full catalog.

**Displays:**
- Grid of processed photos
- Photo counter on mobile
- Empty state instructions if no processed photos

**Features:**
- Adjustable grid view
- Photo info panel access (click photo)
- Multi-selection for batch actions
- Available on desktop and mobile

If empty, it guides the user to Sync Area.

---

## 4. SEARCH / EXPLORER (/search)

**Purpose:** Intelligent semantic search engine across the photo catalog. One of Photoreka’s most powerful tools.

### Search Types

#### A) Semantic Search (Free text)
Write a natural description: "market at sunset", "child running in the rain", "minimalist architecture", "portrait with bokeh".

The AI identifies photos matching the visual and conceptual meaning. Words do not need to exist in metadata.

#### B) Tag Search
- Include tags (logical AND)
- Exclude tags
- Tags are AI-generated during processing
- Autocomplete suggests existing catalog tags

### Search Modes

#### Broad
Light scan across the entire library. Ideal for **moods**, **compositional aspects**, and **general visual style**.

#### Adaptive
Context-aware search. Enriches queries with related concepts. Ideal for **metaphors**, **cultural references**, and nuanced interpretation.

#### Precise
Highly analytical and focused. Ideal for **specific objects** and **taxonomic distinctions**.

| Mode     | Summary |
| -------- | ------- |
| Broad    | Wide scan; moods, visual style, composition |
| Adaptive | Context-enriched; metaphors, references |
| Precise  | High accuracy; concrete objects |

> **Tip:** Start with Broad for exploration. Use Precise when you know exactly what you want. Choose Adaptive for conceptual searches.

### Filters
- Visual Aspects (color, orientation, lighting, depth of field, genre, perspective, etc.)
- Artistic Scores
- Collections

### Results
- Relevance rating (1–3 stars)
- High match indicator
- Progressive pagination ("Load more")

### Actions
- Open Photo Info
- Multi-select
- Add to Collection
- Take to Tool
- Download as ZIP

---

## 5. COLLECTIONS (/collections)

**Purpose:** Manual album/grouping system. Thematic folders.

Collections are unordered thematic groups. Ideal for projects, clients, events, or editorial stages.

---

## 6. SERIES (/series)

**Purpose:** Ordered photo sequences with narrative intent (photo essays, books). Desktop only.

- Drag-and-drop ordering
- Play fullscreen slideshow
- Public shareable URL
- Designed for storytelling and presentation

---

## 7. CANVAS (/canvas)

**Purpose:** Infinite freeform visual board for composition, sequencing, and collage. Desktop only.

- Drag & drop photos
- Zoom & pan
- Multi-selection
- Delete photos
- Save manually

### Expansion (Key Feature)
Add related photos automatically:

- From Catalog
- From Canvas

Types:
- General (semantic/compositional similarity)
- Chromatic (color palette similarity)
- Narrative (contextual similarity)

If in Basic Mode, it means unprocessed photos are present.

---

## 8. FRAMER (/framer)

**Purpose:** Add presentation frames for social media or print.

- Social formats (Instagram 1:1, 4:5, 9:16, etc.)
- Print ratios (4:3, 16:9)
- Margin size slider
- Frame color selector

---

## 9. 3D ATLAS (/atlas)

**Purpose:** Immersive 3D visualization of catalog based on semantic similarity (AI embeddings). Desktop only.

- Orbit, zoom, select
- Filters (visual aspects, artistic scores, time range)
- Inflate factor
- Grid relaxation
- Floating semantic tags
- Auto tour
- Public shareable URL

---

## 10. 2D ATLAS (/2d-view)

2D version of semantic map. Mobile compatible. Same filters as 3D.

---

## 11. REPORT & STATISTICS (/report)

**Purpose:** Deep catalog analysis.

### Sections
- Usage Patterns
- Visual Aspects
- Artistic Scores distribution
- Portfolio consistency

---

## 12. PHOTO INFO PANEL

Detailed view of individual photo.

### Sections
- Metadata (EXIF, GPS)
- Tags (Contextual, Technical, Miscellaneous, Artistic)
- Artistic Scores (1–10 scale)
- Genre Presets
- Notes
- AI Insights (limited per session)

Global rating = weighted average.

---

## 13. SETTINGS (/settings)

- Account
- Preferences
- Integrations (Lightroom, Google Photos)

---

## CROSS-CUTTING CONCEPTS

- Multi-selection
- Take to Tool
- Locked vs Unlocked tools
- Usage limits
- Demo mode (/demo)
- Playground tools (public access without account)

---

## SIDEBAR NAVIGATION

Sync Area  
Library: Workspace · Collections · Series  
Explore: Search · Report · Atlas  
Create: Canvas · Framer · Grid Maker · Project Builder  
System: Chat · Settings · Help · Plan  

---

## FAQ

Why don’t I see my photos?  
They must be processed.

Collection vs Series?  
Collections are unordered. Series are ordered narrative sequences.

Can I share?  
Yes, via public Atlas and Series links.

How do Artistic Scores work?  
AI-generated 1–10 scores. Global rating is configurable.

Does Canvas auto-save?  
No.

How many photos can I have?  
Depends on your plan.

---

## KEY TERMINOLOGY

Catalog — All processed photos  
Lightbox — Uploaded but unprocessed photos  
Analysis — AI processing  
Embedding — Vector representation for similarity  
Tag — AI-generated label  
Artistic Score — 1–10 rating  
Global Rating — Weighted average  
Genre Preset — Predefined weight configuration  
Expansion — Canvas auto-similarity function  
Playground — Public tool mode  
Demo — Example catalog  
Take to Tool — Send photos to another tool  
Daily Eureka — Daily rediscovery card  

`.trim()
// ─────────────────────────────────────────────────────────────
// Combined export — what the tool returns to the agent
// ─────────────────────────────────────────────────────────────
export const APP_KNOWLEDGE_SECTIONS = {
  terms_and_privacy: TERMS_AND_PRIVACY,
  usage_and_help: USAGE_AND_HELP,
} as const

export type AppKnowledgeSection = keyof typeof APP_KNOWLEDGE_SECTIONS
