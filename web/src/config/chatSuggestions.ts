/**
 * Welcome-screen suggestion cards for the chat.
 *
 * One catalogue per prompt variant, because the same question means different
 * things to different photographers: a commercial one opens the chat with a
 * client in mind, someone shooting a dedicated style with a body of work in
 * mind, and a general user with their trips, family and everyday photos.
 *
 * - `commercialSuggestions` → commercial
 * - `generalSuggestions` → general (amateur, travel, family…)
 * - `styleSuggestions` → street-photography, documentary, artistic and hybrids
 *
 * Every catalogue keeps the same order, icons and length so the rotation window
 * in ChatView behaves identically whichever profile is active. The variant
 * mapping is `getProfileVariant`, the same one the artistic schema uses, so a
 * new profile lands on a catalogue without touching this file.
 */
import {
  ImagesOutline as ImagesIcon,
  SparklesOutline as SparklesIcon,
  SearchOutline as SearchSuggestionIcon,
  StarOutline as StarIcon,
  BulbOutline as BulbIcon,
  LayersOutline as LayersIcon,
  ShareSocialOutline as SocialIcon,
  BriefcaseOutline as PortfolioIcon,
  CloudUploadOutline as CloudUploadIcon,
} from "@vicons/ionicons5";
import { getProfileVariant } from "@/config/photo_schema";
import type { UserProfile } from "@/stores/userStore";

export interface SubQuery {
  title: string;
  prompt: string;
  needsPhotos: boolean;
  autoSend: boolean;
}

export interface Suggestion {
  title: string;
  description: string;
  icon: any;
  prompt: string;
  needsPhotos: boolean;
  autoSend: boolean;
  subQueries?: SubQuery[];
}

/** The only suggestion that stands on its own without a library behind it. */
export const appHelpSuggestion: Suggestion = {
  title: "Help with the app",
  description: "Ask me anything about how to use Photoreka",
  icon: BulbIcon,
  prompt: "Please explain how to use Photoreka to ",
  needsPhotos: false,
  autoSend: false,
  subQueries: [
    {
      title: "How does the search feature work?",
      prompt:
        "Explain how the search feature works in Photoreka, including filters and different search modes.",
      needsPhotos: false,
      autoSend: true,
    },
    {
      title: "How do I create and manage collections?",
      prompt:
        "How do I create collections in Photoreka and add photos to them?",
      needsPhotos: false,
      autoSend: true,
    },
    {
      title: "How do I organize my photos into series?",
      prompt:
        "How do I create photo series in Photoreka and what are they used for?",
      needsPhotos: false,
      autoSend: true,
    },
    {
      title: "How do I share my work from Photoreka?",
      prompt: "What are the ways to share my photos or series from Photoreka?",
      needsPhotos: false,
      autoSend: true,
    },
    {
      title: "How does photo analysis work?",
      prompt:
        "How does Photoreka analyze my photos, how is the data stored, and how is my privacy protected?",
      needsPhotos: false,
      autoSend: true,
    },
  ],
};

/**
 * For the dedicated styles — street photography, documentary, artistic and
 * their hybrids. The work is a body of work: series, portfolios, photobooks,
 * awards and long-term projects.
 */
export const styleSuggestions: Suggestion[] = [
  {
    title: "Help me find some photos",
    description:
      "Describe what you're looking for and I'll search your library",
    icon: SearchSuggestionIcon,
    prompt: "Hello, I'm looking for photos that ",
    needsPhotos: false,
    autoSend: false,
    subQueries: [
      {
        title: "Best Portrait Shots from Last 3 Years",
        prompt:
          "Search my library for my strongest portrait photos from the last 3 years. Only in colour and vertical format. Rank them by visual impact, storytelling, and overall cohesion.",
        needsPhotos: false,
        autoSend: true,
      },

      {
        title: "Find Hidden Gems",
        prompt:
          "Look for photos that are hidden gems in my library, which may not be immediately obvious but have unique qualities.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Curating Decay Study",
        prompt:
          "Find images with dark, decaying environments. Emphasize shadow, texture, abandonment, and emotional weight. Rank by atmospheric intensity.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Finding photos for awards",
        prompt:
          "Help me find photos for photography awards. They must be from the last year to meet the requirements. Give me suggestions for each specific award.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },

  {
    title: "Sequence my photos",
    description:
      "Get suggestions for sequencing photos into a series or collection",
    icon: LayersIcon,
    prompt:
      "Can you create a sequence using these photos? Suggest a compelling order and explain the narrativeflow you see. Recommend a title for the series.",
    needsPhotos: true,
    autoSend: true,
  },
  {
    title: "Library Analysis",
    description: "Understand trends and strengths in your catalog",
    icon: SparklesIcon,
    prompt:
      "Analyze my photo library and give me portfolio insights. Where do I excel and what areas could I develop further?",
    needsPhotos: false,
    autoSend: true,
    subQueries: [
      {
        title: "Identifying Gaps",
        prompt:
          "Based on my current patterns, what subjects or aesthetic styles are underrepresented? Suggest specific steps to enrich my catalogue with new styles or themes.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Overall Work Assessment",
        prompt:
          "Review my entire photo library and provide an honest assessment. Give me an internal ranking of my usage patterns and identify which pieces reach that 'Unique' (10/10) level of impact.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Gender Representation",
        prompt:
          "Analyze my photo library and determine whether men or women appear more frequently as primary subjects across all genres. Break down the distribution and explain if this reflects a stylistic bias, contextual coincidence, or recurring thematic inclination.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Recurring Subtle Pattern Detection",
        prompt:
          "Scan my entire photo library and identify a subtle recurring pattern, object, gesture, symbol, or specific real-world detail that appears across multiple images. Detect any unconscious fixation I may repeatedly photograph without realizing it.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },
  {
    title: "Find similar photos",
    description:
      "Find photos in my library with similar storytelling to these ones",
    icon: ImagesIcon,
    prompt:
      "Look at these photos and find others in my library that share a similar mood, subject matter, or storytelling style. Explain what visual or thematic thread connects them.",
    needsPhotos: true,
    autoSend: true,
  },
  {
    title: "Which version is the best?",
    description:
      "I'm unsure which version of a photo to keep. Help me choose the best one",
    icon: StarIcon,
    prompt:
      "I have multiple versions of the same shot and I can't decide which to keep. Please compare these photos technically and artistically and recommend the strongest one with a clear reason.",
    needsPhotos: true,
    autoSend: true,
  },
  {
    title: "Social media ideas",
    description: "Turn photos from your library into posts worth publishing",
    icon: SocialIcon,
    prompt:
      "Help me come up with social media ideas using photos from my library. Suggest concepts, which photos to use, and how to present them.",
    needsPhotos: false,
    autoSend: true,
    subQueries: [
      {
        title: "Post for Today's World Day",
        prompt:
          "Find out which international day or observance is being celebrated today, then design an Instagram post inspired by it using photos from my library. Pick the images that fit best, propose a layout or carousel order, and write a caption with hashtags.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Weekly Instagram Carousel",
        prompt:
          "Build a 5-10 image Instagram carousel from my library around a single visual theme. Suggest the exact order, explain the narrative arc, and write a caption plus hashtags that match the mood.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "This Week's Posts",
        prompt:
          "Pick 3 photos from my library that would work as standalone posts this week. For each one, explain why it stands out, suggest the best day to publish it, and write a caption with hashtags.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Behind the Photo Story",
        prompt:
          "Pick one of my strongest photos and turn it into a storytelling post. Explain what makes the image work technically and emotionally, and write a caption that shares the story behind it in my voice.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },
  {
    title: "Portfolio ideas",
    description: "Discover portfolio themes hiding in your catalog",
    icon: PortfolioIcon,
    prompt:
      "Analyze my photo library and propose portfolio themes I could build from what I already have. For each idea, explain the concept and which photos would anchor it.",
    needsPhotos: false,
    autoSend: true,
    subQueries: [
      {
        title: "Discover the hidden Photobook in my catalog",
        prompt:
          "Analyze my catalog and find the potential photobook within it. Omit overly repetitive themes and conventions, and focus on meaningful themes beyond the obvious.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Start a Portfolio With 5 Opening Photos",
        prompt:
          "Help me start building a portfolio from my library, one step at a time. Choose a unifying theme and pick just the first 5 photos that open the sequence. Explain why each one earns its place, how they set the tone, and what kind of image should come next so we can keep growing the set together.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Portfolio for a Specific Audience",
        prompt:
          "Help me tailor a portfolio for a specific audience, such as galleries, editorial clients, or commercial brands. Ask me which one I'm targeting if needed, then suggest which photos from my library fit that audience and how to frame the selection.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Long-Term Project Potential",
        prompt:
          "Look for an unfinished thread in my library that could grow into a long-term photo project or photobook. Explain the concept, show me the photos that already support it, and tell me what I still need to shoot to complete it.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },
  appHelpSuggestion,
];

/**
 * Commercial work is judged by what a client can use, so the cards ask about
 * briefs, copy space, deliverable takes and pitchable sets rather than personal
 * projects, awards or photobooks.
 */
export const commercialSuggestions: Suggestion[] = [
  {
    title: "Help me find some photos",
    description: "Describe the brief and I'll pull candidates from your library",
    icon: SearchSuggestionIcon,
    prompt: "Hello, I'm looking for photos that ",
    needsPhotos: false,
    autoSend: false,
    subQueries: [
      {
        title: "Best Commercial Work from Last 3 Years",
        prompt:
          "Search my library for my strongest commercial photos from the last 3 years. Rank them by commercial intent, subject clarity, and production quality, and tell me which ones a client would respond to first.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Images With Room for Copy",
        prompt:
          "Find images in my library with clean negative space where a headline, a logo, or a call to action could sit. Tell me where the copy would go in each one and which format it suits best.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Product Hero Shots",
        prompt:
          "Find my strongest product-forward hero shots. Rank them by subject clarity, lighting control, and how cleanly the product reads at small sizes.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Lifestyle Shots for a Campaign",
        prompt:
          "Find lifestyle images that feel natural rather than staged, where a product or a brand could live believably in the scene. Rank them by how usable they would be in a campaign.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },

  {
    title: "Sequence my photos",
    description: "Order photos into a campaign set or a client deck",
    icon: LayersIcon,
    prompt:
      "Can you sequence these photos for a client presentation? Suggest a compelling order, explain how the set builds from opener to closer, and recommend a title for the campaign.",
    needsPhotos: true,
    autoSend: true,
  },
  {
    title: "Library Analysis",
    description: "Understand what your catalog can sell",
    icon: SparklesIcon,
    prompt:
      "Analyze my photo library from a commercial standpoint. Which categories and looks am I strongest in, and what would I need to develop to win more work?",
    needsPhotos: false,
    autoSend: true,
    subQueries: [
      {
        title: "Identifying Gaps",
        prompt:
          "Based on my current work, which commercial categories, product types, or lighting setups are underrepresented in my catalogue? Suggest specific shoots that would close those gaps.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Overall Work Assessment",
        prompt:
          "Review my entire photo library and give me an honest commercial assessment. Rank my work internally and identify which images are strong enough to lead a pitch.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Most Licensable Images",
        prompt:
          "Identify the images in my library with the strongest licensing or stock potential. Explain what makes each one commercially usable and which kind of buyer it fits.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "My Recognizable Visual Signature",
        prompt:
          "Scan my library and describe the recurring visual signature a client would recognize across my work: lighting, palette, framing, or staging habits. Then tell me how to describe it in a pitch.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },
  {
    title: "Find similar photos",
    description: "Find photos in my library that match this look",
    icon: ImagesIcon,
    prompt:
      "Look at these photos and find others in my library with the same lighting, palette, and mood, so I can present a consistent set. Explain what visual thread connects them.",
    needsPhotos: true,
    autoSend: true,
  },
  {
    title: "Which version should I deliver?",
    description:
      "I'm unsure which take to send the client. Help me choose the best one",
    icon: StarIcon,
    prompt:
      "I have multiple takes of the same setup and I can't decide which to deliver. Please compare these photos technically and commercially and recommend the strongest one with a clear reason.",
    needsPhotos: true,
    autoSend: true,
  },
  {
    title: "Social media ideas",
    description: "Turn your work into posts that attract clients",
    icon: SocialIcon,
    prompt:
      "Help me come up with social media ideas using photos from my library that would attract commercial clients. Suggest concepts, which photos to use, and how to present them.",
    needsPhotos: false,
    autoSend: true,
    subQueries: [
      {
        title: "Post for Today's World Day",
        prompt:
          "Find out which international day or observance is being celebrated today, then design an Instagram post inspired by it using photos from my library. Pick the images that fit best, propose a layout or carousel order, and write a caption with hashtags.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Case Study Carousel",
        prompt:
          "Build a 5-10 image Instagram carousel from my library that reads as a case study of a single shoot or client look. Suggest the exact order, explain the arc from setup to final frame, and write a caption plus hashtags.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "This Week's Posts",
        prompt:
          "Pick 3 photos from my library that would work as standalone posts this week to reach potential clients. For each one, explain why it stands out commercially, suggest the best day to publish it, and write a caption with hashtags.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Behind the Shoot Story",
        prompt:
          "Pick one of my strongest commercial photos and turn it into a behind-the-shoot post. Explain the setup and the problem it solved, and write a caption that builds credibility with clients in my voice.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },
  {
    title: "Portfolio ideas",
    description: "Discover client-ready sets hiding in your catalog",
    icon: PortfolioIcon,
    prompt:
      "Analyze my photo library and propose portfolio sets I could show clients from what I already have. For each idea, explain the concept, the sector it targets, and which photos would anchor it.",
    needsPhotos: false,
    autoSend: true,
    subQueries: [
      {
        title: "Find a Ready-Made Campaign in my Catalog",
        prompt:
          "Analyze my catalog and find a complete campaign already sitting inside it. Skip the obvious and repetitive material, and show me a coherent set with a concept a brand could buy.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Start a Portfolio With 5 Opening Photos",
        prompt:
          "Help me start building a client portfolio from my library, one step at a time. Choose a sector to target and pick just the first 5 photos that open it. Explain why each one earns its place, what it proves about my work, and what kind of image should come next so we can keep growing the set together.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Portfolio for a Specific Client",
        prompt:
          "Help me tailor a portfolio for a specific kind of client, such as a fashion brand, a food and hospitality business, an agency, or an e-commerce company. Ask me which one I'm targeting if needed, then suggest which photos from my library fit and how to frame the selection.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "What's Missing to Pitch a Sector",
        prompt:
          "Pick a commercial sector my library is close to covering but does not fully serve yet. Show me the photos that already support it, and tell me exactly what I still need to shoot before I can pitch it.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },
  appHelpSuggestion,
];

/**
 * The general profile: amateur, travel, family and everyday photography. There
 * is no portfolio or client behind the catalog, so the cards ask about trips,
 * people, keepers, prints and albums instead of series, briefs and awards.
 */
export const generalSuggestions: Suggestion[] = [
  {
    title: "Help me find some photos",
    description:
      "Describe what you're looking for and I'll search your library",
    icon: SearchSuggestionIcon,
    prompt: "Hello, I'm looking for photos that ",
    needsPhotos: false,
    autoSend: false,
    subQueries: [
      {
        title: "Best Shots From My Last Trip",
        prompt:
          "Find the best photos from my most recent trip. Pick the ones worth keeping and sharing, and tell me why each one stands out.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "My Favourite People",
        prompt:
          "Find my warmest, most natural photos of family and friends. Skip the stiff posed ones and rank the rest by how alive the moment feels.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Find Hidden Gems",
        prompt:
          "Look for photos that are hidden gems in my library, which may not be immediately obvious but have unique qualities.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Photos Worth Printing",
        prompt:
          "Find the photos in my library that would look best printed and framed on a wall. Consider colour, detail, and how well each one holds up at a large size.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },

  {
    title: "Sequence my photos",
    description: "Put these photos in an order that tells the story",
    icon: LayersIcon,
    prompt:
      "Can you put these photos in a good order to tell the story of what happened? Explain the flow you see and suggest a title for the set.",
    needsPhotos: true,
    autoSend: true,
  },
  {
    title: "Library Analysis",
    description: "See what you shoot most and how you're improving",
    icon: SparklesIcon,
    prompt:
      "Analyze my photo library and tell me what I photograph most, what I'm good at, and what I could work on to take better photos.",
    needsPhotos: false,
    autoSend: true,
    subQueries: [
      {
        title: "What Do I Photograph Most?",
        prompt:
          "Break down my photo library by subject, place, and the people who appear most. Tell me what the numbers say about how I actually use my camera.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Am I Getting Better?",
        prompt:
          "Compare my recent photos with my older ones and tell me honestly whether my photography is improving. Point to specific images that show the change.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "What Should I Try Next?",
        prompt:
          "Based on what I already shoot, suggest new subjects, times of day, or techniques I haven't tried yet. Keep the suggestions practical for my next few outings.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "My Top 20 Photos Ever",
        prompt:
          "Go through my entire library and pick my 20 best photos of all time. Rank them and explain in plain terms what makes each one work.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },
  {
    title: "Find similar photos",
    description: "Find other photos in my library like these ones",
    icon: ImagesIcon,
    prompt:
      "Look at these photos and find others in my library with a similar mood, subject, or feeling. Explain what they have in common.",
    needsPhotos: true,
    autoSend: true,
  },
  {
    title: "Which one should I keep?",
    description: "I took several similar shots. Help me pick the keeper",
    icon: StarIcon,
    prompt:
      "I took several similar shots and I can't decide which to keep. Please compare these photos and tell me which one is the strongest and why, in plain language.",
    needsPhotos: true,
    autoSend: true,
  },
  {
    title: "Social media ideas",
    description: "Turn photos from your library into posts worth sharing",
    icon: SocialIcon,
    prompt:
      "Help me come up with ideas for sharing photos from my library. Suggest which ones to post, how to present them, and what to write.",
    needsPhotos: false,
    autoSend: true,
    subQueries: [
      {
        title: "Post for Today's World Day",
        prompt:
          "Find out which international day or observance is being celebrated today, then design an Instagram post inspired by it using photos from my library. Pick the images that fit best, propose a layout or carousel order, and write a caption with hashtags.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Trip Recap Carousel",
        prompt:
          "Build a 5-10 image carousel from one of my trips. Suggest the exact order so it reads like a little story, and write a caption with hashtags.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "This Week's Posts",
        prompt:
          "Pick 3 photos from my library that would work as standalone posts this week. For each one, explain why it stands out, suggest the best day to publish it, and write a caption with hashtags.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Behind the Photo Story",
        prompt:
          "Pick one of my strongest photos and turn it into a storytelling post. Explain what makes the image work and write a caption that shares the story behind it in my voice.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },
  {
    title: "Album and print ideas",
    description: "Discover albums and prints hiding in your catalog",
    icon: PortfolioIcon,
    prompt:
      "Analyze my photo library and suggest photo albums or print sets I could make from what I already have. For each idea, explain the theme and which photos would go in it.",
    needsPhotos: false,
    autoSend: true,
    subQueries: [
      {
        title: "Make an Album From a Trip",
        prompt:
          "Pick one of my trips and build a photo album from it. Choose the images, put them in order, and tell me which one should open and close the book.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Best of the Year",
        prompt:
          "Put together a best-of set from the past year. Pick the photos that sum it up, explain why each one made the cut, and suggest how to present them.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "Photos to Print and Frame",
        prompt:
          "Choose a small set of photos from my library that would work together on a wall. Suggest sizes, how to arrange them, and what makes them hang well as a group.",
        needsPhotos: false,
        autoSend: true,
      },
      {
        title: "A Gift Album for Someone",
        prompt:
          "Help me build a photo album as a gift for someone close to me. Ask me who it's for if needed, then pick the photos of them or with them that would mean the most, and put them in order.",
        needsPhotos: false,
        autoSend: true,
      },
    ],
  },
  appHelpSuggestion,
];

/**
 * With an empty library every suggestion above is a dead end — they all search,
 * compare or analyze photos the user doesn't have yet. These take their place
 * until there's a catalog to talk about. Profile-neutral: nobody has shown us
 * any work yet.
 */
export const onboardingSuggestions: Suggestion[] = [
  {
    title: "How do I import my photos?",
    description: "Walk me through getting my catalog in",
    icon: CloudUploadIcon,
    prompt:
      "How do I import and analyze my photos into Photoreka? Walk me through the two processes step by step.",
    needsPhotos: false,
    autoSend: true,
  },
  {
    title: "What is Photoreka?",
    description: "Get an overview of what you can do here",
    icon: SparklesIcon,
    prompt:
      "What is Photoreka and how can it help me as a photographer? Give me a short overview.",
    needsPhotos: false,
    autoSend: true,
  },

  // {
  //   title: "What happens after import?",
  //   description: "See what unlocks after your first import",
  //   icon: LayersIcon,
  //   prompt:
  //     "Once my photos are imported and analyzed, what can I do with them in Photoreka? What tools will I have?",
  //   needsPhotos: false,
  //   autoSend: true,
  // },
  // appHelpSuggestion,
];

/**
 * One catalogue per prompt variant. `getProfileVariant` collapses every profile
 * onto one of the three, hybrids included, so `street-photography|artistic`
 * lands on the style set exactly as either half would on its own.
 */
const SUGGESTIONS_BY_VARIANT: Record<string, Suggestion[]> = {
  commercial: commercialSuggestions,
  general: generalSuggestions,
  style: styleSuggestions,
};

/** The suggestion set for `profile`. A missing profile reads as general. */
export function getSuggestionsForProfile(
  profile?: UserProfile | null,
): Suggestion[] {
  return (
    SUGGESTIONS_BY_VARIANT[getProfileVariant(profile)] ?? generalSuggestions
  );
}
