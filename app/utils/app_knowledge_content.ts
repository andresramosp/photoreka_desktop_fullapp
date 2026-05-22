/**
 * app_knowledge_content.ts
 * -----------------------------------------------------------------
 * Static knowledge blocks served to the AI agent so it can
 * answer user questions about the app itself.
 *
 * Edit this file freely -- no code changes required elsewhere.
 * -----------------------------------------------------------------
 */

// -----------------------------------------------------------------
// SECTION 1 -- Terms & Privacy
// -----------------------------------------------------------------
export const TERMS_AND_PRIVACY = `
## Photoreka -- Terms of Use and Image Policy

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

// -----------------------------------------------------------------
// SECTION 2 -- General Usage & Help
// -----------------------------------------------------------------
export const USAGE_AND_HELP = `
# Photoreka -- Knowledge Base for Chatbot Assistant

> This document describes in detail every tool, section, and key concept of the Photoreka app. It is designed to be injected as system context into a chatbot assistant. It covers purpose, usage flow, expected behavior, tips, and FAQs for each section.

---

## RESPONSE FORMATTING — HOW TO REFERENCE APP SECTIONS

Whenever you mention a section, tool, or page of the app in your response, you **must** include a navigable link using the following token syntax. The front end will render it as a clickable link that takes the user directly to that location.

**Syntax:**
- \`{url:/path}\` — the path is used as the display label
- \`{url:/path|Label}\` — custom display label

**Examples:**
- Go to {url:/import-area|Import Area} to upload your photos.
- You can manage your account in {url:/settings|Settings}.
- Open {url:/canvas} to start arranging photos on the board.

**Known app paths:**
| Section | Path |
| --- | --- |
| Dashboard | /dashboard |
| Import Area | /import-area |
| Workspace | /workspace |
| Search / Explorer | /search |
| Collections | /collections |
| Series | /series |
| Portfolios | /portfolios |
| Canvas | /canvas |
| Framer | /framer |
| 3D Atlas | /atlas |
| 2D Atlas | /2d-view |
| Tag Cloud | /tagcloud |
| Report & Statistics | /report |
| ChatLab | /chat-lab |
| Settings | /settings |
| Help Center | /help |

Always prefer a descriptive label over the raw path. For example, write \`{url:/import-area|Import Area}\` rather than \`{url:/import-area}\`.

---

## What is Photoreka?

Photoreka is an **intelligent photo curation and organization platform** designed for photographers. It uses artificial intelligence to analyze, classify, score, and help rediscover photos in your catalog. The core workflow is:

1. **Upload photos** (Import Area -> Lightbox)
2. **Process them with AI** (Import Area -> Analysis)
3. **Explore and work with them** using the rest of the tools (Search, Canvas, Collections, Atlas, etc.)

The app is available on desktop and mobile, although some tools are desktop-only (Canvas, 3D Atlas, Series).

---

## REGISTRATION & PROFILE SETUP

### Sign-Up Process
New users create an account and are presented with two permanent configuration choices that define their workflow: **Import Mode** and **Photography Profile**. These choices cannot be changed after setup.

### Import Mode Selection

Users must choose how they prefer to manage photo imports. This decision affects the primary workflow and available tools.

#### Web-first Workflow
- Your main photo import flow is through the **Photoreka web interface**
- Upload photos from multiple sources with ease
- Includes: Import from computer (drag & drop or browse) / Connect Google Photos and sync automatically / Works from any device with a browser / Lightroom plugin available as optional secondary source
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
- No particular bias -- balanced evaluation across all photographic styles

#### Single Profiles

**Street Photography**
- Optimized for candid moments and urban life documentation
- Biased toward: Authentic, unposed moments / Strong composition in urban contexts / Human subjects and environmental storytelling / Humor and visual games in everyday life

**Documentary Photography**
- Optimized for storytelling and real-world documentation
- Biased toward: Narrative strength and emotional impact / Context and environmental awareness / Authenticity over stylized aesthetics / Series coherence and photo essay potential

**Artistic Photography**
- Optimized for creative expression and fine art
- Biased toward: Creative vision and conceptual execution / Technical mastery / Color theory, light, and visual poetry / Unique perspectives and experimental approaches

**Commercial Photography**
- Optimized for advertising, product, fashion, lifestyle, and editorial work
- Biased toward: Professional visual polish and brand-appropriate aesthetics / Clear, unambiguous subject presentation / Commercial storytelling (lifestyle aspirations, brand values, use-case context) / Originality that stands out from generic stock imagery
- **Note:** This profile uses a completely different set of scoring criteria than all other profiles (see Artistic Scores section below). It also uses a dedicated set of genre values: advertising, product, fashion, portrait, lifestyle, food.

#### Dual Profiles (Combination Mode)

**Artistic + Documentary**
- Storytelling through artistic expression
- Combines: Narrative strength with creative visual language / Real-world subjects treated artistically / Conceptual depth in documentary projects / Aesthetic beauty without compromising authenticity

**Artistic + Street Photography**
- Creative urban documentation with artistic flair
- Emphasizes: Candid moments elevated through artistic composition / Experimental approaches to street scenes / Visual poetry in everyday urban life / Technical mastery in spontaneous situations

**Documentary + Street Photography**
- Narrative urban storytelling
- Balances: Candid moments with strong narrative context / Urban environments as stages for human stories / Authenticity in composition and decisive timing / Series work documenting social reality

### How Profile Affects the App

**Artistic Scores Weighting**
The selected profile influences how AI assigns and weights artistic scores (1-10 scale) across your catalog. It creates a "slight preference" in evaluation -- emphasizing qualities relevant to your chosen style.

For **all non-commercial profiles** (General, Street, Documentary, Artistic, and all dual combinations), the 8 scoring criteria are organized in two groups:
- **Fundamentals:** Aesthetic Quality, Composition, Storytelling, Originality
- **Bonus:** Message/Depth, Humor, Visual Games, Candidness

For **Commercial Photography**, the criteria set is purpose-built for commercial work and differs from all other profiles:
- **Fundamentals:** Aesthetic Quality, Composition, Storytelling, Commercial Intent
- **Bonus:** Originality, Humor, Subject Clarity, Candidness

Each profile maps to a genre preset that adjusts the weight of each criterion in the global rating calculation. Commercial users have a single "commercial" preset with fixed weights optimized for advertising, product, fashion, and lifestyle photography.

**Search & Recommendations**
Semantic search and assistant recommendations are subtly influenced by your profile, surfacing photos that align with your declared photographic sensibility.

**Atlas & Visualizations**
The 3D and 2D Atlas organize photos based on similarity. Your profile helps determine which visual and conceptual relationships are prioritized.

**Important Note**
Your profile does not restrict uploads. You can upload photos of any type regardless of your chosen profile. The profile only creates a slight preference in how the engine evaluates and organizes your work, ensuring scores and recommendations align with your artistic vision.

---

## PHOTO LIFE CYCLE

Photos move through several internal states:

| State           | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| uploaded        | Just uploaded, not analyzed                                  |
| preprocessing   | Basic pre-analysis in progress (CLIP embedding, color histogram, metadata) |
| preprocessed    | Pre-analysis completed, ready for full analysis              |
| processing      | Full AI analysis in progress (vision description, tags, chunks, detections) |
| processed       | Fully analyzed and available in all tools                    |

Photos only appear in tools like Search, Collections, Atlas, etc. when they are in the "processed" state. Photos in "uploaded", "preprocessing", and "preprocessed" states are only visible in the **Import Area**.

### What Happens During Analysis
The AI analysis pipeline extracts:
- **Descriptions**: context, story, visual accents, visual aspects, artistic scores
- **Tags**: organized by category (contextual, technical, miscellaneous, artistic)
- **Searchable chunks**: text fragments with embeddings for semantic search
- **CLIP embeddings**: visual similarity vectors for photo-to-photo search
- **Color histograms**: dominant and full palette for chromatic search
- **Object detections**: bounding boxes for visual elements
- **EXIF metadata**: camera info, GPS, date taken, technical settings

> **Tip:** If photos do not appear in Search or Workspace, they likely haven't been processed yet. Go to Import Area -> Lightbox tab and click "Analyze Photos".

---

## 1. DASHBOARD (/dashboard)

**Purpose:** Home screen after authentication. Acts as a navigation hub and general status overview.

**Displays:**
- Personalized greeting with the user's name
- **Daily Eureka Card**: one catalog photo selected for rediscovery. Hover reveals a carousel of AI-generated insights about the photo
- Quick access to main tools: Canvas (with thumbnail preview of last saved canvas), Workspace (with preview), Report & Statistics
- **Recent Collections & Series** section with quick-access cards

**Behavior:**
- If there are no processed photos, most shortcuts appear locked (disabled with visual indicator)
- On mobile, desktop-only tools are hidden; Explorer card replaces Canvas
- The Daily Eureka Card appears only if there are processed photos

---

## 2. SYNC AREA (/import-area)

**Purpose:** Entry point for importing and processing photos. First tool new users should use.

**Two tabs:**

### Lightbox Tab
- Lists all photos in "uploaded", "preprocessing", or "preprocessed" states
- Allows uploading new photos (drag & drop or file selector)
- Allows connecting external sources: **Lightroom**, **Google Photos**, and **Dropbox**
- Allows selecting photos individually or in bulk to send for analysis
- Floating **"Analyze Photos"** button appears when there are photos in the lightbox
- **Duplicate detection**: automatically identifies duplicate photos during upload with two search modes. **Exact duplicates** match photos taken at the same capture moment using the EXIF "dateTaken" timestamp (truncated to the second), which is useful even if the file was edited, resized, re-exported, or cropped. **Similar duplicates** use perceptual hashing (dHash) to find visually near-identical images and minor re-saves. Context-aware actions depend on whether duplicates are in the lightbox or already analyzed in the workspace. Bulk clean option available
- **Swap Photo**: allows replacing an already-analyzed photo with a new version without losing its position in the catalog

### Analyses Tab
- Shows photos currently being analyzed ("processing" state)
- Displays real-time analysis progress via WebSocket
- Allows navigating back to Lightbox
- **You do not need to stay on the page or keep the browser open** -- analysis continues in the background on the server. You will be notified when the batch finishes, even if you closed the tab or disconnected from the internet.

### Analysis Duration
- **Small batches (fewer than ~50 photos):** typically a few minutes.
- **Large batches (hundreds or thousands of photos):** between 1 and 4 hours under normal load; up to ~8 hours during peak demand.
- Individual photos become available in the catalog as soon as they reach the "processed" state, so you can start using tools before the entire batch is done.

### Import Sources
Photos can be imported from multiple sources, all going through the same pipeline:

| Source | Details |
| --- | --- |
| **Local files** | Drag & drop or file browser. EXIF extracted client-side |
| **Google Photos** | OAuth integration. Opens Google Photos picker to select albums/photos |
| **Dropbox** | Chooser integration. 5 MB per file limit |
| **Lightroom Plugin** | Requires plugin installation. Handoff token authentication. Full walkthrough guide available in-app |

All imports go through a unified pipeline: EXIF extraction -> client-side resize (1500px main + 800px thumbnail) -> upload to secure cloud storage.

**"Analyze Photos" Button:**
- Appears floating when there are photos in the lightbox
- Enabled when at least 1 photo is "preprocessed" or "uploaded"
- Shows "processing" state while analysis is running
- Triggers backend AI analysis

**Post-Analysis Experience:**
- **Processing Summary Modal**: celebration screen with confetti showing genre breakdown of analyzed photos, top highlights with "breaks record" badges
- **Onboarding Slider** (first time): guides user to continue uploading or start experimenting with tools
- **Welcome Batch Modal**: shows feature availability table by catalog size (200 / 500 / 1000 / 3000+ photos)

**Typical Flow:**
1. Open Import Area
2. Upload photos or connect Lightroom/Google Photos/Dropbox
3. Photos move from "uploaded" -> "preprocessing" -> "preprocessed"
4. Click "Analyze Photos"
5. Wait until photos become "processed" (progress shown in real-time)
6. Once processed, photos are available in all tools

> **Tip:** You can analyze photos in batches. You don't need to wait for all of them to finish before using tools with those already processed.

---

## 3. WORKSPACE (/workspace)

**Purpose:** Library view of all **processed** photos. Main reference point of the full catalog.

**Displays:**
- Grid of processed photos with adjustable grid size
- Photo counter on mobile
- Empty state instructions if no processed photos (guides to Import Area)

**Features:**
- **Sorting**: by artistic score (any criterion), by date, by filename
- **Filename search**: quick filter by photo name
- **Time range histogram filter**: visual date range slider with histogram showing photo distribution over time
- **Tag search**: filter by AI-generated tags
- **Visual Aspects filters**: palette, orientation, temperature, stylistic, lighting, depth of field, framing, genre, perspective
- **Artistic Score filters**: filter by score thresholds with >= and <= operators on any of the 8 criteria
- **Genre filter**: filter by photographic genre
- **Custom Artistic Weights**: manually adjust weight sliders for each scoring criterion to customize the global rating calculation
- **Duplicate detection**: find and clean duplicate photos directly from workspace, using both the **Exact duplicates** mode (same EXIF "dateTaken" capture timestamp) and the **Similar duplicates** mode (visual similarity via dHash)
- **Photo Info Panel**: click any photo to open detailed info
- **Multi-selection**: select multiple photos for batch actions
- **Take to Tool**: send selected photos to Canvas, Framer, or Atlas
- **Download as ZIP**: download selected photos

Available on desktop and mobile.

---

## 4. SEARCH / EXPLORER (/search)

**Purpose:** Intelligent semantic search engine across the photo catalog. One of Photoreka's most powerful tools. Separate layouts optimized for desktop and mobile.

### Search Types

#### A) Semantic Search (Free text)
Write a natural description: "market at sunset", "child running in the rain", "minimalist architecture", "portrait with bokeh".

The AI identifies photos matching the visual and conceptual meaning. Words do not need to exist in metadata.

#### B) Tag Search
- Include tags (logical AND)
- Exclude tags
- Tags are AI-generated during processing
- Autocomplete suggests existing catalog tags with debounced search

### Search Modes

#### Broad
Light scan across the entire library. Ideal for **moods**, **compositional aspects**, and **general visual style**.

#### Adaptive
Context-aware search. Enriches queries with related concepts. Ideal for **metaphors**, **cultural references**, and nuanced interpretation.

#### Precise
Highly analytical and focused. Ideal for **specific objects** and **taxonomic distinctions**. Costs additional GPU credits.

| Mode     | Summary | Cost |
| -------- | ------- | ---- |
| Broad    | Wide scan; moods, visual style, composition | Standard |
| Adaptive | Context-enriched; metaphors, references | Standard |
| Precise  | High accuracy; concrete objects | Standard + GPU credits |

> **Tip:** Start with Broad for exploration. Use Precise when you know exactly what you want. Choose Adaptive for conceptual searches.

### Filters
- **Visual Aspects**: palette, orientation, temperature, stylistic treatment, lighting, depth of field, framing, genre, perspective
- **Artistic Scores**: filter by any of the 8 criteria with >= or <= operators
- **Collections**: limit search to specific collections

### Results
- Relevance rating (1-3 stars): excellent, good, fair
- High match indicator
- Cursor-based progressive pagination ("Load more")

### Actions
- Open Photo Info
- Multi-select
- Add to Collection
- Take to Tool (Canvas, Framer, Atlas)
- Download as ZIP

---

## 5. COLLECTIONS (/collections)

**Purpose:** Manual album/grouping system. Thematic folders.

Collections are unordered thematic groups. Ideal for projects, clients, events, or editorial stages.

**Features:**
- Create collections with title and optional description
- Inline title editing directly in collection detail view
- Add/remove photos from any tool (Workspace, Search, Chat, multi-selection)
- Each collection is assigned a decorative gradient from a set of 12 predefined styles
- Mobile: dropdown overflow menu for actions
- Collection detail view shows all photos with grid controls

> **Tip:** You can create collections directly from ChatLab recommendations -- the assistant's "Add to Collection" button lets you send curated results to a new or existing collection.

### Collection Sets (Folders for Collections)

Collection Sets are **folders that group collections** into a hierarchical structure. They add an organizational layer on top of collections, making it easier to manage large libraries.

**Key concepts:**
- A Set can contain **collections** and/or **child sets** (nested folders)
- Sets are self-referential: a set can have a parent set, enabling multi-level nesting
- Sets do **not** directly contain photos -- only collections contain photos
- A collection can belong to exactly one set, or be at the root level (no set)

**Operations:**
- **Create a set**: provide a name, optional description, and optionally assign it a parent set
- **Rename / update**: change name, description, or re-parent (move to a different parent set)
- **Move a collection**: reassign a collection to a different set or to the root level
- **Delete a set**: the set is removed, its child sets are promoted to the deleted set's parent (or root), and its collections are moved to the parent set (or root). No collections or photos are lost

**Behavior on delete (cascade promotion):**
When a set is deleted, nothing is lost:
1. Child sets -> promoted to the deleted set's parent (or root if no parent)
2. Collections inside -> moved to the deleted set's parent (or root if no parent)

> **Tip:** Use sets to mirror project folder structures -- for example, a "2026" set containing "Client A" and "Client B" child sets, each with their own collections. Deleting a parent set is safe: its contents are automatically promoted rather than deleted.

---

## 6. SERIES (/series)

**Purpose:** Ordered photo sequences with narrative intent (photo essays, books). Desktop only.

**Features:**
- Drag-and-drop reordering of photos
- Insert photos at a specific position (not just append at end)
- Move individual photos to a new position
- Play fullscreen slideshow with photo strip navigation at the bottom
- Public shareable URL by series name
- Designed for storytelling and presentation

> **Tip:** Series maintain a strict order. Use them for photo essays, book layouts, or any sequence where the order of photos matters narratively.

---

## PORTFOLIO BUILDER

**Purpose:** AI-powered automatic curation of a cohesive portfolio from the user's catalog. The builder selects, refines, and (optionally) sequences a fixed-size set of photos that matches the user's stated criteria.

### How it works
The pipeline runs asynchronously in the background (users can leave the page and come back). It goes through 7 internal stages: **parsing → recall → coherence scoring → evaluation → refinement → sequencing → completion**.

1. **Recall** — builds a large candidate pool from the catalog (up to ~7× the target size, capped) using the user's filters, weights, and theme preferences.
2. **Coherence scoring** — scores how well each candidate fits the chosen coherence mode.
3. **Evaluation** — an LLM evaluates batches of candidates against the brief.
4. **Refinement** — trims down to the target size with similarity-gate and quality checks.
5. **Sequencing (optional)** — orders the final photos for narrative/visual flow.

### Configuration inputs
- **Target size:** between 10 and 40 photos.
- **Weights:** per-criterion weights (0–10) across the 8 artistic score fields — aesthetic_quality, composition, storytelling, originality, message, humor, visual_games, candidness. Used to bias which photos are considered strongest.
- **Coherence mode:** controls how photos relate to each other as a set.
    - free — no coherence constraint, pure quality-driven selection.
    - visual — photos share overall visual style (composition, framing, treatment).
    - chromatic — photos share a consistent color palette and tonal register.
    - narrative — photos share a common story, theme, or subject thread.
    - heterogeneous — deliberately diverse portfolio, maximising variety.
- **Theme preferences (optional, free text):** natural-language hints about theme, mood, or constraints to bias recall.
- **Style preferences (optional, free text):** natural-language hints about visual style, treatment, or aesthetic to bias recall.
- **Filters (optional):** visual-aspect filters, date range, and/or restrict the pool to specific collections.

### Output
Each completed build stores:
- An **ordered list of photo IDs** that form the final portfolio.
- A **builder pool** — photos the LLM approved but that didn't make the final cut (surfaced as alternative suggestions the user can swap in).
- Notes on the refinement and sequencing passes.

### Constraints & behavior
- Only one build can be in progress at a time per user.
- Requires a sufficiently analyzed catalog (enough eligible photos after filters); otherwise the build is rejected at eligibility check.
- Builds consume credits (AI evaluation + sequencing).
- The user can **abort** an in-progress build, **delete** a completed one, and **manually edit the layout** (reorder or remove photos) of a completed build after the fact.
- Builds are the appropriate destination when the user wants a "final selection", "curated set", "show reel", or a ready-to-present body of work — not for exploratory searching.

> **Tip:** If a user is dissatisfied with ChatLab's ranking or curation for a large selection task, the Portfolio Builder is the right tool to redirect them to: it evaluates the full catalog in batches with LLM judgment, not just a sampled subset.

---

## 7. CANVAS (/canvas)

**Purpose:** Infinite freeform visual board for composition, sequencing, and collage. Desktop only.

**Core Features:**
- Drag & drop photos freely on an infinite board
- Zoom & pan (mouse wheel + drag)
- Multi-selection (click + drag selection rectangle)
- Per-photo opacity control
- Per-photo z-index layering
- Tag pills visible on photos (toggleable)
- Object detection areas (bounding boxes) can be displayed on photos
- Auto-align / snap to grid
- Crop selector integrated per photo
- Delete photos (moved to a discarded tracking list)

### Multi-Canvas Support
- Save and load multiple named canvases
- Canvas manager popover for switching between canvases
- Unsaved changes tracking with warning
- Manual save required (no auto-save)

### Expansion (Key Feature)
Add related photos automatically from your catalog or from the current canvas:

| Type | Description |
| --- | --- |
| General | Semantic and compositional similarity |
| Chromatic | Color palette similarity |
| Narrative | Contextual and storytelling similarity |

Expansion supports crop regions (search by a specific area of a photo), collection filtering, and inverted/opposite similarity.

If Canvas shows "Basic Mode", it means unprocessed photos are present on the board.

---

## 8. FRAMER (/framer)

**Purpose:** Add presentation frames for social media or print.

**Features:**
- Social formats: Instagram 1:1, 4:5, 9:16, and more
- Print ratios: 4:3, 16:9, and others
- Margin size slider for adjusting frame thickness
- Frame color selector
- High-resolution download (resolution doubled on mobile for crisp output)
- Download multiple framed photos as a ZIP file
- Dedicated mobile layout with compact horizontal frame picker

---

## 9. 3D ATLAS (/atlas)

**Purpose:** Immersive 3D visualization of the entire catalog based on semantic similarity (AI embeddings). Desktop only.

Photos are positioned in 3D space so that visually and conceptually similar photos appear closer together. The layout is computed from AI embeddings using dimensionality reduction.

**Features:**
- **Two navigation modes**: Orbit controls (click + drag to rotate) and First-person controls (WASD + mouse, FPS-style)
- Filters: visual aspects, artistic scores, time range
- Inflate factor: spread photos apart for clarity
- Grid relaxation: automatic overlap-free layout adjustment
- **Floating semantic tags**: AI-generated labels floating in 3D space near relevant photo clusters
- **Tag beacons**: visual markers for specific tags
- Multiple clustering types (by different embedding categories)
- Auto tour: automated camera path through the catalog
- Touch controls with gesture hints overlay (tablet)
- Level-of-detail (LOD) management for large catalogs
- Public shareable URL

---

## 10. 2D ATLAS (/2d-view)

**Purpose:** 2D version of the semantic map. Mobile compatible.

Photos are positioned on a 2D plane based on AI embedding similarity, similar to the 3D Atlas but as a flat, scrollable/zoomable view.

**Features:**
- Configuration panel with: clustering type selector, display options, search filters, patterns overlay
- Dedicated mobile layout for the configuration panel
- Tag beacons and pattern tags overlay
- Grid relaxation for overlap-free positioning
- Same filters as 3D Atlas (visual aspects, artistic scores, time range)

---

## 11. REPORT & STATISTICS (/report)

**Purpose:** Deep catalog analysis with AI-generated insights. Section-based navigation sidebar.

### Sections

#### Patterns Analysis
AI-generated narrative, cultural, and stylistic patterns found across the catalog. Displayed as a carousel of pattern cards.
- Requires approximately 200+ processed photos to generate
- Automatically rebuilds when the catalog changes significantly (250+ new/removed photos)
- Shows placeholder descriptions for each pattern type when the catalog is too small

#### Visual Aspects
Analysis of technical characteristics across the catalog: color palettes, orientation distribution, lighting conditions, depth of field usage, genre breakdown, and more.

#### Artistic Scores
Distribution charts showing how photos score across the 8 criteria. Includes an **evolution over time chart** showing how artistic quality trends change as the catalog grows.

#### Portfolio Consistency
Overall consistency and coherence assessment of the photographic body of work.

---

## 12. PHOTO INFO PANEL

Detailed view of an individual photo. Opens as a side panel or dialog. Separate layouts for desktop and mobile. Supports navigation between photos without closing the panel.

### Sections

#### Metadata
EXIF data: camera make/model/lens, focal length, aperture, exposure, ISO, flash, white balance, GPS coordinates, date taken, orientation.

#### Tags
Organized in 4 categories:
- **Contextual** (context_story): narrative and scene tags
- **Technical** (visual_aspects): technical photographic tags
- **Miscellaneous** (visual_accents): accent and detail tags
- **Artistic** (artistic_scores): artistic quality tags

#### Artistic Scores
8 criteria scored 1-10 with named levels (Disastrous -> Masterpiece).

For **non-commercial profiles**:
- **Fundamentals:** Aesthetic Quality, Composition, Storytelling, Originality
- **Bonus:** Message/Depth, Humor, Visual Games, Candidness

For **Commercial Photography** (different criteria set):
- **Fundamentals:** Aesthetic Quality, Composition, Storytelling, Commercial Intent
- **Bonus:** Originality, Humor, Subject Clarity, Candidness

**Global Rating** = weighted average of all criteria. Weights are determined by the user's genre preset but can be customized manually with individual sliders per criterion.

**Genre Presets:** predefined weight configurations for different photography styles. Non-commercial profiles can choose from: General, Street, Documentary, Artistic. Commercial Photography has a single dedicated preset ("commercial") with weights optimized for advertising, product, fashion, and lifestyle work. Selecting a preset automatically adjusts all weight sliders.

#### Notes
Free-text notes per photo with word count indicator. Auto-saves.

#### AI Photo Insights
AI-generated insights about the photo, with multiple insight types:
- **General**: overall description and interpretation
- **Cultural**: cultural references, historical context
- **Technical**: technical analysis of photographic choices
- **Artistic**: artistic merit and creative aspects
- **Custom question**: ask any specific question about the photo

Limited uses per session. Each insight call consumes credits.

#### Similar Photos
A section showing visually or conceptually similar photos from the catalog.

#### Actions
- **Send to ChatLab**: open the photo as context in a chat conversation
- **Add to Collection / Series**
- **Take to Tool**: send to Canvas, Framer, or Atlas

---

## 13. CHATLAB (/chat-lab)

**Purpose:** AI assistant for photo analysis, recommendations, catalog exploration, and collection management. Desktop and mobile.

### Intelligence Modes
ChatLab offers 3 intelligence modes that determine the AI model quality and cost:

| Mode | Description | Cost |
| --- | --- | --- |
| **Scout** | Fast and economical. Uses lightweight models. Good for simple questions | 0.5x credits |
| **Assistant** | Default mode. Balanced quality and cost | 1x credits |
| **Curator** | Premium mode. Uses the most capable models for nuanced curation and deep analysis | 2x credits |

### Conversations
- Conversations are **persisted on the server** (up to 50 per user)
- Sidebar shows conversation list with titles, sorted by most recent
- Rename, archive, or delete conversations
- Start a new conversation at any time
- Conversation context includes the last 5 turns for continuity

### Photo Context
- Send up to **10 photos as context** with any message
- The assistant can see and analyze the attached photos
- The assistant can search your catalog, sample photos, get detailed photo info, and even search the web to enrich its responses

### Photo Analysis & Discovery
- Ask questions about your catalog ("What are my most common themes?", "Find photos with strong storytelling")
- Get curated photo recommendations with relevance grouping
- Receive contextual insights about collections
- Explore themes and visual patterns

### Photo Curation with Assistant Guidance
The assistant can show you relevant photos from your catalog and provides an **"Add to Collection" button** for quick collection/series management:

- **Add to Collection**: Send displayed photos directly to an existing collection or create a new one
- **Add to Series**: Organize displayed photos into a series, maintaining narrative order

### If You Have No Analyzed Photos
ChatLab works even with 0 analyzed photos -- in this case, the assistant answers questions about the app itself, explains features, and helps you get started.

### Rate Limits
ChatLab has usage limits: 3 messages/minute, 10/hour, 15/day, 100/month.

> **Tip:** Use Scout mode for quick questions to save credits. Switch to Curator when you need deep, nuanced curation or analysis of your work.

---

## 14. SETTINGS (/settings)

**Purpose:** Account and app configuration.

### Sections

| Section | Details |
| --- | --- |
| **Account** | Name, email, avatar |
| **Preferences** | Language, theme (dark/light) |
| **Connections** | Google Photos (OAuth), Dropbox, Lightroom plugin, Instagram (coming soon) |
| **Invite Friends** | Generate and send invite codes |
| **Change Password** | Available for email-based accounts only (not for Google OAuth users) |
| **Delete Account** | Permanent account deletion |

---

## 15. HELP CENTER (/help)

**Purpose:** Searchable knowledge base with topic-based navigation.

**Features:**
- Topic cards grid on the main page
- Sidebar navigation by topic and subtopic
- Full-text search across all help content
- Subtopic content rendered dynamically

---

## CROSS-CUTTING CONCEPTS

### Multi-selection
Available in Workspace, Search results, Collections, and Series. Select multiple photos to perform batch actions: add to collection, take to tool, download as ZIP, delete.

### Take to Tool
From any multi-selection context, send photos directly to:
- **Canvas**: opens Canvas with the selected photos placed on the board
- **Framer**: opens Framer with the selected photos
- **2D/3D Atlas**: opens the atlas filtered to the selected photos (2D Atlas supports single photo only)

### Global Omni-Search (Header Bar)
The search bar in the top header (desktop only) provides instant search across:
- Photos (by filename or tag match)
- Collections (by name)
- Series (by name)
- Saved canvases (by name)
- Tools (by name)
- Help topics

Results appear in a grouped dropdown with keyboard navigation. This is distinct from the Search tool -- it's a quick-access navigation feature.

### Duplicate Detection
Photoreka offers two complementary ways to search for duplicates:
- **Exact duplicates**: photos with the same EXIF "dateTaken" capture timestamp, normalized to the second. This is designed to catch the same capture event even if the file was later resized, color-graded, converted, or cropped
- **Similar duplicates**: photos that are visually near-identical according to perceptual hashing (dHash). This catches pixel-level duplicates and minor re-saves, but it is less robust to aggressive edits or crops than the exact mode
- Context-aware: identifies whether duplicates are in the lightbox (unanalyzed) or workspace (already analyzed)
- Bulk clean actions: remove all duplicates at once
- Filter view: All / Duplicates Only / Unique Only
- Also supports **Swap Photo**: replace an already-analyzed photo with a new version

### Credits & Usage System
Every AI-powered operation in Photoreka consumes credits:
- **Search** (semantic): standard credit cost per query; Precise mode costs additional GPU credits
- **ChatLab**: cost varies by intelligence mode (Scout 0.5x, Assistant 1x, Curator 2x)
- **Photo Insights**: each AI insight call consumes credits
- **Photo Analysis**: processing new photos consumes credits

Your plan includes a credit budget. When credits run out, AI features become temporarily unavailable until the budget resets or is expanded. An "Insufficient Credits" notification with a link to Settings appears when a credit-gated action fails.

Usage indicators in the sidebar show: analyzed photos count vs. limit, and storage usage.

To expand your photo limit or top up credits, see the **Payments & Purchases** section below or visit {url:/settings|Settings}.

### Locked vs Unlocked Tools
When the user has no processed photos, most tools appear locked (greyed out with a visual indicator). Processing at least 1 photo unlocks the full app.

### Mobile vs Desktop
| Feature | Desktop | Mobile |
| --- | --- | --- |
| Canvas | Yes | No |
| 3D Atlas | Yes | No |
| Series | Yes | No |
| 2D Atlas | Yes | Yes |
| Search | Full layout | Compact layout |
| Framer | Sidebar layout | Horizontal compact picker |
| Photo Info | Side panel | Dialog overlay |
| Global Search | Header bar | Not available |
| Dashboard | Canvas + Workspace previews | Explorer card instead |
| Sidebar | Collapsible sider (toggle/hover/always-expanded) | Overlay drawer |

---

## SIDEBAR NAVIGATION

Import Area
Workspace
Library: Collections / Series
Search
Atlas: 2D Atlas / 3D Atlas
Canvas
ChatLab
Report
Framer
Settings

---

## PAYMENTS & PURCHASES

Photoreka uses a **one-time payment model** — no subscriptions. All purchases are processed securely via Stripe Checkout. There are two types of purchasable items:

### Photo Analysis Packages
Photo packages expand your **analyzed photo limit** — the total number of photos you can process with AI.
- Each package grants a fixed number of **analyzed photo slots** (e.g. 500, 1 000 photos)
- May include **bonus AI credits** at no extra cost
- One-time purchase; slots do not expire

### AI Credit Packages
Credit packages top up your **AI credit balance** for operations such as semantic search, ChatLab, photo insights, and portfolio builder.
- Each package grants a fixed number of **AI credits**
- One-time purchase; credits do not expire

### How to Purchase
Go to {url:/settings|Settings} or click any "Buy more" / "Upgrade" prompt that appears when you reach a capacity or credit limit. You will be redirected to Stripe Checkout. After payment, your new photo slots and/or credits are applied to your account immediately.

### Purchase History
Past purchases are visible in {url:/settings|Settings} under the Payments section. After returning from Stripe Checkout the app verifies the session and activates the granted resources automatically.

### Storage Costs
Storage is **free for the first 2 years** from your first photo analysis. After that, the cost is very marginal — and still free for very small catalogs.

Monthly cost examples:
- ~5 000 photos: **≈ €0.25 / month**
- ~10 000 photos: **≈ €0.50 / month**
- ~20 000 photos: **≈ €1.00 / month**

---

## FAQ

**Why don't I see my photos?**
They must be processed. Go to Import Area -> Lightbox tab -> click "Analyze Photos".

**How long does photo analysis take?**
For small batches (fewer than ~50 photos) it typically takes a few minutes. For larger batches (hundreds or thousands of photos) expect 1–4 hours under normal conditions, and up to ~8 hours during peak demand. You do not need to stay on the page -- analysis runs on the server and you will be notified when it finishes. Photos become available in the catalog one by one as they are processed, so you can start using Search, Canvas, and other tools before the full batch is done.

**Collection vs Series?**
Collections are unordered thematic groups. Series are ordered narrative sequences with drag-and-drop reordering.

**What are Collection Sets?**
Sets are folders that group collections into a hierarchy. A set can contain collections and nested child sets. Sets don't hold photos directly -- only collections do. Deleting a set is safe: its child sets and collections are promoted to the parent level automatically.

**Can I share my work?**
Yes, Series and 3D Atlas have public shareable URLs.

**How do Artistic Scores work?**
AI-generated 1-10 scores across 8 criteria. For non-commercial profiles the criteria are: Aesthetic Quality, Composition, Storytelling, Originality, Message, Humor, Visual Games, Candidness. For the Commercial Photography profile the criteria are: Aesthetic Quality, Composition, Storytelling, Commercial Intent, Originality, Humor, Subject Clarity, Candidness. The Global Rating is a weighted average based on your genre preset, which you can customize with manual sliders.

**Does Canvas auto-save?**
No. You must save manually. Unsaved changes are tracked with a warning indicator.

**How many photos can I have?**
Depends on your plan. Usage indicators in the sidebar show your current count vs. limit.

**What are the ChatLab modes?**
Scout (fast, cheap), Assistant (balanced, default), Curator (premium, best quality). Each uses different AI models at different credit costs.

**Can I import from Google Photos?**
Yes. Connect your Google account in Import Area or Settings -> Connections. The Google Photos picker lets you select albums or individual photos.

**Can I import from Dropbox?**
Yes, with a 5 MB per file limit. Connect via Import Area.

**What is the Omni-Search in the header?**
A quick-access search bar (desktop only) that searches across photos, collections, series, canvases, tools, and help topics simultaneously. Different from the Search tool.

**What are credits?**
Credits are the internal currency for AI operations. Every search, chat message, and photo insight consumes credits. Your plan includes a credit budget. You can top up credits at any time with a one-time Credit Package purchase — go to {url:/settings|Settings} or click any "Buy more" prompt.

**How do I get more analyzed photo slots?**
Purchase a Photo Analysis Package via {url:/settings|Settings}. Each package adds a fixed number of photo slots to your account, optionally with bonus AI credits included. Purchases are one-time and slots do not expire.

**How much does storage cost?**
Storage is free for the first 2 years from your first photo analysis. After that the cost is very marginal: approximately €0.25/month for ~5 000 photos, €0.50/month for ~10 000 photos, and €1.00/month for ~20 000 photos. Very small catalogs remain free.

**How does duplicate detection work?**
Photoreka has two duplicate search modes available in the Lightbox and Workspace. **Exact duplicates** groups photos that share the same EXIF "dateTaken" timestamp to the second, which is useful for catching the same shot across exports or edits. **Similar duplicates** uses perceptual hashing (dHash) to find visually near-identical photos and minor re-saves. You can review results and clean them in bulk.

**Can I use Photoreka on mobile?**
Yes, with an adapted layout. Canvas, 3D Atlas, and Series are desktop-only. All other tools work on mobile.

---

## KEY TERMINOLOGY

Collection Set -- Folder that groups collections into a hierarchical structure. Sets can be nested. Deleting a set promotes its contents to the parent level
Catalog -- All processed photos in your library
Lightbox -- Uploaded but unprocessed photos (visible only in Import Area)
Analysis -- AI processing pipeline that extracts tags, scores, embeddings, and metadata
Embedding -- Vector representation of a photo used for semantic similarity
Tag -- AI-generated label assigned during analysis, organized by category
Artistic Score -- 1-10 AI rating across 8 criteria
Global Rating -- Weighted average of all artistic scores
Genre Preset -- Predefined weight configuration for a photography style. Non-commercial profiles: General, Street, Documentary, Artistic. Commercial Photography: a single "commercial" preset
Expansion -- Canvas feature that finds and adds similar photos automatically
Take to Tool -- Send selected photos from any view to Canvas, Framer, or Atlas
Daily Eureka -- Dashboard card showing a daily rediscovered photo with AI insights
ChatLab -- AI assistant with 3 intelligence modes (Scout, Assistant, Curator)
Credits -- Internal currency consumed by AI operations (search, chat, insights, analysis)
Omni-Search -- Global search bar in the header for quick navigation across all content types
Duplicate Detection -- Two duplicate search modes: Exact duplicates by EXIF "dateTaken" capture timestamp, and Similar duplicates by perceptual hash (dHash)
Swap Photo -- Replace an already-analyzed photo with a new version
Photo Package -- One-time purchase that expands the analyzed photo limit; may include bonus AI credits
Credit Package -- One-time purchase that tops up the AI credit balance for search, chat, insights, and other AI operations
Storage Cost -- Monthly fee for storing analyzed photos; free for the first 2 years from first analysis, then very marginal (≈ €0.25/month per ~5 000 photos)

`.trim()
// -----------------------------------------------------------------
// Combined export -- what the tool returns to the agent
// -----------------------------------------------------------------
export const APP_KNOWLEDGE_SECTIONS = {
  terms_and_privacy: TERMS_AND_PRIVACY,
  usage_and_help: USAGE_AND_HELP,
} as const

export type AppKnowledgeSection = keyof typeof APP_KNOWLEDGE_SECTIONS
