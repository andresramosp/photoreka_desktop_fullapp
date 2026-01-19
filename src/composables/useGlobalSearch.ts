// composables/useGlobalSearch.ts
import { ref, computed, watch } from "vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useCollectionsStore } from "@/stores/collections.js";
import { useSeriesStore } from "@/stores/series.js";
import helpData from "@/assets/helpData.json";
import type { Ref } from "vue";

// Types for search results
export interface SearchResultPhoto {
  type: "photo";
  id: number | string;
  name: string;
  tags: string[];
  thumbnailUrl?: string;
  matchedOn: "name" | "tag";
  matchedTag?: string;
}

export interface SearchResultCollection {
  type: "collection";
  id: number | string;
  name: string;
  photoCount: number;
  coverUrl?: string;
}

export interface SearchResultSeries {
  type: "series";
  id: number | string;
  name: string;
  photoCount: number;
  coverUrl?: string;
}

export interface SearchResultTool {
  type: "tool";
  id: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  searchTerms?: string[];
}

export interface SearchResultHelp {
  type: "help";
  id: string;
  topicId: string;
  subtopicId: string;
  topicTitle: string;
  subtopicTitle: string;
  content: string;
  route: string;
}

export type SearchResult =
  | SearchResultPhoto
  | SearchResultCollection
  | SearchResultSeries
  | SearchResultTool
  | SearchResultHelp;

export interface GroupedResults {
  tools: SearchResultTool[];
  help: SearchResultHelp[];
  collections: SearchResultCollection[];
  series: SearchResultSeries[];
  photos: SearchResultPhoto[];
}

// Available tools in the app
const APP_TOOLS: SearchResultTool[] = [
  {
    type: "tool",
    id: "search",
    name: "Search",
    description: "Search photos using natural language",
    icon: "SearchOutline",
    route: "/search",
    searchTerms: [
      "find",
      "query",
      "semantic",
      "AI",
      "look",
      "discover",
      "explore",
    ],
  },
  {
    type: "tool",
    id: "canvas",
    name: "Canvas",
    description: "Arrange and sequence photos on a canvas",
    icon: "Workspace",
    route: "/canvas",
    searchTerms: [
      "arrange",
      "layout",
      "organize",
      "design",
      "composition",
      "board",
      "workspace",
      "drag",
      "position",
    ],
  },
  {
    type: "tool",
    id: "atlas",
    name: "3D Atlas",
    description: "Explore photos in a 3D space",
    icon: "CubeOutline",
    route: "/atlas",
    searchTerms: [
      "3D",
      "three dimensional",
      "immersive",
      "spatial",
      "navigate",
      "virtual",
      "cube",
      "space",
    ],
  },
  // {
  //   type: "tool",
  //   id: "project-builder",
  //   name: "Project Builder",
  //   description: "Build and curate photo projects",
  //   icon: "FlaskOutline",
  //   route: "/project-builder",
  //   searchTerms: [
  //     "curate",
  //     "curation",
  //     "build",
  //     "create",
  //     "portfolio",
  //     "project",
  //     "selection",
  //     "pick",
  //   ],
  // },
  {
    type: "tool",
    id: "framer",
    name: "Framer",
    description: "Add frames and borders to photos",
    icon: "SquareOutline",
    route: "/framer",
    searchTerms: [
      "frame",
      "border",
      "mat",
      "mount",
      "edge",
      "decoration",
      "style",
    ],
  },
  {
    type: "tool",
    id: "collections",
    name: "Collections",
    description: "Organize photos into collections",
    icon: "GridOutline",
    route: "/collections",
    searchTerms: ["group", "album", "folder", "set", "categorize", "organize"],
  },
  {
    type: "tool",
    id: "series",
    name: "Series",
    description: "Create ordered photo series",
    icon: "ListOutline",
    route: "/series",
    searchTerms: [
      "sequence",
      "order",
      "story",
      "narrative",
      "timeline",
      "ordered",
      "sequential",
      "arrange",
    ],
  },
  {
    type: "tool",
    id: "workspace",
    name: "Workspace",
    description: "View and manage your processed photos",
    icon: "LayersOutline",
    route: "/workspace",
    searchTerms: [
      "processed",
      "ready",
      "catalog",
      "library",
      "gallery",
      "view",
    ],
  },
  {
    type: "tool",
    id: "sync-area-upload",
    name: "Upload Photos",
    description: "Upload and import new photos",
    icon: "CloudUploadOutline",
    route: "/sync-area#upload",
    searchTerms: [
      "upload",
      "import",
      "add",
      "sync",
      "cloud",
      "transfer",
      "new",
      "select",
      "choose",
      "lightbox",
    ],
  },
  {
    type: "tool",
    id: "sync-area-processing",
    name: "Photo Processing",
    description: "Analyze and process uploaded photos",
    icon: "CloudUploadOutline",
    route: "/sync-area#processing",
    searchTerms: [
      "process",
      "analyze",
      "processing",
      "analysis",
      "queue",
      "batch",
      "compute",
    ],
  },
  {
    type: "tool",
    id: "settings",
    name: "Settings",
    description: "Configure app settings and preferences",
    icon: "SettingsOutline",
    route: "/settings",
    searchTerms: ["config", "preferences", "options", "configure", "setup"],
  },
  {
    type: "tool",
    id: "help",
    name: "Help",
    description: "Get help and learn about Photoreka features",
    icon: "HelpCircleOutline",
    route: "/help",
    searchTerms: [
      "help",
      "support",
      "guide",
      "tutorial",
      "docs",
      "documentation",
      "faq",
      "questions",
    ],
  },
];

export function useGlobalSearch() {
  const photosStore = usePhotosStore();
  const collectionsStore = useCollectionsStore();
  const seriesStore = useSeriesStore();

  const searchQuery = ref("");
  const isSearching = ref(false);
  const maxResultsPerCategory = ref(5);

  // Normalize string for search (lowercase, trim, remove accents)
  const normalizeString = (str: string): string => {
    return str
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };

  // Check if a string matches the query
  const matchesQuery = (text: string, query: string): boolean => {
    if (!text || !query) return false;
    return normalizeString(text).includes(normalizeString(query));
  };

  // Search tools
  const searchTools = (query: string): SearchResultTool[] => {
    if (!query || query.length < 2) return [];

    return APP_TOOLS.filter((tool) => {
      // Check name match
      if (matchesQuery(tool.name, query)) return true;

      // Check description match
      if (matchesQuery(tool.description, query)) return true;

      // Check search terms match
      if (tool.searchTerms) {
        return tool.searchTerms.some((term) => matchesQuery(term, query));
      }

      return false;
    }).slice(0, maxResultsPerCategory.value);
  };

  // Search help topics
  const searchHelp = (query: string): SearchResultHelp[] => {
    if (!query || query.length < 2) return [];

    const results: SearchResultHelp[] = [];
    const topics = helpData.topics || [];

    for (const topic of topics) {
      if (results.length >= maxResultsPerCategory.value) break;

      for (const subtopic of topic.subtopics || []) {
        if (results.length >= maxResultsPerCategory.value) break;

        // Only search in topic title and subtopic title
        if (
          matchesQuery(topic.title, query) ||
          matchesQuery(subtopic.title, query)
        ) {
          results.push({
            type: "help",
            id: `${topic.id}-${subtopic.id}`,
            topicId: topic.id,
            subtopicId: subtopic.id,
            topicTitle: topic.title,
            subtopicTitle: subtopic.title,
            content: subtopic.content,
            route: `/help?topic=${topic.id}&subtopic=${subtopic.id}`,
          });
        }
      }
    }

    return results;
  };

  // Search collections
  const searchCollections = (query: string): SearchResultCollection[] => {
    if (!query || query.length < 2) return [];

    const collections = collectionsStore.allCollections || [];

    return collections
      .filter((collection: any) => matchesQuery(collection.name, query))
      .slice(0, maxResultsPerCategory.value)
      .map((collection: any) => ({
        type: "collection" as const,
        id: collection.id,
        name: collection.name,
        photoCount: collection.photoCount || collection.photos?.length || 0,
        coverUrl:
          collection.photos?.[0]?.thumbnailUrl || collection.photos?.[0]?.url,
      }));
  };

  // Search series
  const searchSeries = (query: string): SearchResultSeries[] => {
    if (!query || query.length < 2) return [];

    const allSeries = seriesStore.allSeries || [];

    return allSeries
      .filter((series: any) => matchesQuery(series.name, query))
      .slice(0, maxResultsPerCategory.value)
      .map((series: any) => ({
        type: "series" as const,
        id: series.id,
        name: series.name,
        photoCount: series.photoCount || series.photos?.length || 0,
        coverUrl: series.photos?.[0]?.thumbnailUrl || series.photos?.[0]?.url,
      }));
  };

  // Search photos by name and tags
  const searchPhotos = (query: string): SearchResultPhoto[] => {
    if (!query || query.length < 2) return [];

    const photos = photosStore.allPhotos || [];
    const results: SearchResultPhoto[] = [];

    for (const photo of photos) {
      if (results.length >= maxResultsPerCategory.value) break;

      // Check name match
      const photoName =
        photo.originalFileName || photo.name || photo.filename || "";
      if (matchesQuery(photoName, query)) {
        // Extract tag names from tag objects
        const tagNames = (photo.tags || []).map((t: any) =>
          typeof t === "string" ? t : t.name || t.tag?.name || "",
        );

        results.push({
          type: "photo",
          id: photo.id,
          name: photoName,
          tags: tagNames,
          thumbnailUrl: photo.thumbnailUrl || photo.url,
          matchedOn: "name",
        });
        continue;
      }

      // DISABLED: Check tags match
      // Uncomment to enable tag search
      /*
      const tags = photo.tags || [];
      for (const tag of tags) {
        // Handle different tag structures: string, {name: "..."}, {tag: {name: "..."}}
        const tagName = typeof tag === "string" ? tag : tag.name || tag.tag?.name || "";
        
        if (tagName && matchesQuery(tagName, query)) {
          // Extract all tag names for display
          const tagNames = tags.map((t: any) =>
            typeof t === "string" ? t : t.name || t.tag?.name || ""
          );
          
          results.push({
            type: "photo",
            id: photo.id,
            name: photoName,
            tags: tagNames,
            thumbnailUrl: photo.thumbnailUrl || photo.url,
            matchedOn: "tag",
            matchedTag: tagName,
          });
          break;
        }
      }
      */
    }

    return results;
  };

  // Combined search results
  const searchResults = computed<GroupedResults>(() => {
    const query = searchQuery.value.trim();

    if (!query || query.length < 2) {
      return {
        tools: [],
        help: [],
        collections: [],
        series: [],
        photos: [],
      };
    }

    return {
      tools: searchTools(query),
      help: searchHelp(query),
      collections: searchCollections(query),
      series: searchSeries(query),
      photos: searchPhotos(query),
    };
  });

  // Total results count
  const totalResults = computed(() => {
    const results = searchResults.value;
    return (
      results.tools.length +
      results.help.length +
      results.collections.length +
      results.series.length +
      results.photos.length
    );
  });

  // Has any results
  const hasResults = computed(() => totalResults.value > 0);

  // Flat list of all results for keyboard navigation
  const flatResults = computed<SearchResult[]>(() => {
    const results = searchResults.value;
    return [
      ...results.tools,
      ...results.collections,
      ...results.series,
      ...results.photos,
      ...results.help,
    ];
  });

  // Clear search
  const clearSearch = () => {
    searchQuery.value = "";
  };

  // Initialize stores if needed
  const ensureDataLoaded = async () => {
    isSearching.value = true;
    try {
      await Promise.all([
        photosStore.getOrFetch(false),
        collectionsStore.getOrFetch(false),
        seriesStore.getOrFetch(false),
      ]);
    } catch (error) {
      console.error("Error loading search data:", error);
    } finally {
      isSearching.value = false;
    }
  };

  return {
    searchQuery,
    searchResults,
    totalResults,
    hasResults,
    flatResults,
    isSearching,
    maxResultsPerCategory,
    clearSearch,
    ensureDataLoaded,
    APP_TOOLS,
  };
}
