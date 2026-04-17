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

## REGISTRATION & PROFILE SETUP

### Sign-Up Process
New users create an account and are presented with two permanent configuration choices that define their workflow: **Import Mode** and **Photography Profile**. These choices cannot be changed after setup.

### Import Mode Selection

Users must choose how they prefer to manage photo imports. This decision affects the primary workflow and available tools.

#### Web-first Workflow
- Your main photo import flow is through the **Photoreka web interface**
- Upload photos from multiple sources with ease
- Includes: Import from computer (drag & drop or browse) · Connect Google Photos and sync automatically · Works from any device with a browser · Lightroom plugin available as optional secondary source
- **Best for:** Photographers using multiple sources or preferring web-based management

#### Lightroom-first Workflow
- Your photo imports must **always be done from the Lightroom Plugin** to maintain synchronization
- Full access to all Photoreka web tools and features
- Search tool integrated directly into Lightroom
- Perfect for photographers who organize everything in Lightroom
- **Important:** If you upload photos directly through the web, they will be analyzed but won't appear in your Lightroom catalog, causing workflow inconsistencies
- **Best for:** Photographers using Lightroom as their primary photo management system

**Note:** Import Mode is locked after registration and cannot be changed. Choose carefully based on your current workflow.

### Photography Profile Selection

#### General Profile

**General Photography**
- Perfect for everyday photos, family moments, travel, and mixed collections
- The engine adapts to any type of photography without requiring specific categorization
- No particular bias—balanced evaluation across all photographic styles

#### Single Profiles

**Street Photography**
- Optimized for candid moments and urban life documentation
- Biased toward: Authentic, unposed moments · Strong composition in urban contexts · Human subjects and environmental storytelling · Humor and visual games in everyday life

**Documentary Photography**
- Optimized for storytelling and real-world documentation
- Biased toward: Narrative strength and emotional impact · Context and environmental awareness · Authenticity over stylized aesthetics · Series coherence and photo essay potential

**Artistic Photography**
- Optimized for creative expression and fine art
- Biased toward: Creative vision and conceptual execution · Technical mastery · Color theory, light, and visual poetry · Unique perspectives and experimental approaches

#### Dual Profiles (Combination Mode)

**Artistic + Documentary**
- Storytelling through artistic expression
- Combines: Narrative strength with creative visual language · Real-world subjects treated artistically · Conceptual depth in documentary projects · Aesthetic beauty without compromising authenticity

**Artistic + Street Photography**
- Creative urban documentation with artistic flair
- Emphasizes: Candid moments elevated through artistic composition · Experimental approaches to street scenes · Visual poetry in everyday urban life · Technical mastery in spontaneous situations

**Documentary + Street Photography**
- Narrative urban storytelling
- Balances: Candid moments with strong narrative context · Urban environments as stages for human stories · Authenticity in composition and decisive timing · Series work documenting social reality

### How Profile Affects the App

**Artistic Scores Weighting**
The selected profile influences how AI assigns and weights artistic scores (1–10 scale) across your catalog. It creates a "slight preference" in evaluation—emphasizing qualities relevant to your chosen style.

**Search & Recommendations**
Semantic search and assistant recommendations are subtly influenced by your profile, surfacing photos that align with your declared photographic sensibility.

**Atlas & Visualizations**
The 3D and 2D Atlas organize photos based on similarity. Your profile helps determine which visual and conceptual relationships are prioritized.

**Important Note**
✦ **Your profile does not restrict uploads.** You can upload photos of any type regardless of your chosen profile. The profile only creates a slight preference in how the engine evaluates and organizes your work, ensuring scores and recommendations align with your artistic vision.

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
- Search filters by visual aspects and date range
- Ranking and filters by artistic scores (aesythic, composition, storytelling, humor, etc.)
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

## 13. CHAT (/chat)

**Purpose:** AI assistant for photo analysis, recommendations, and collection management. Desktop and mobile.

**Key Features:**

### Photo Analysis & Discovery
- Ask questions about your catalog
- Get curated photo recommendations
- Receive contextual insights about collections
- Explore themes and visual patterns

### Photo Curation with Assistant Guidance
The assistant can show you relevant photos from your catalog and provides an **"Add to Collection" button** for quick collection/series management:

- **Add to Collection**: Send displayed photos directly to an existing collection or create a new one
- **Add to Series**: Organize displayed photos into a series, maintaining narrative order

**Workflow:**
1. Open Chat with the assistant
2. Describe what you're looking for or ask about your catalog
3. Assistant displays relevant photos with "Add to Collection" button
4. Click "Add to Collection" → Select destination (Collection or Series)
5. Photos are instantly added to your chosen grouping

### Benefits
- Avoid manual searching and tagging
- Curate selections directly from assistant recommendations
- Build collections/series conversationally
- Organize photos based on semantic understanding rather than metadata alone

---

## 14. SETTINGS (/settings)

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
Library: Workspace · Collections  
Explore: Search · Report · Atlas (3D & 2D)
Create: Canvas · Framer · Series
Chat
System : Settings · Help
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
