// composables/useGlobalSearch.ts
import { ref, computed, watch } from "vue";
import { usePhotosStore } from "@/stores/photos.js";
import { useCollectionsStore } from "@/stores/collections.js";
import { useSeriesStore } from "@/stores/series.js";
import { usePortfolioBuildsStore } from "@/stores/portfolioBuilds.js";
import { useUserStore } from "@/stores/userStore.js";
import { api } from "@/utils/axios.js";
import type { Ref } from "vue";

const CANVAS_STORAGE_KEY = "photoreka_canvas_data";

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

export interface SearchResultCanvas {
  type: "canvas";
  id: number | string;
  name: string;
  photoCount: number;
  updatedAt?: string;
}

export interface SearchResultPortfolio {
  type: "portfolio";
  id: number | string;
  name: string;
  photoCount: number;
  coverUrl?: string;
}

export type SearchResult =
  | SearchResultPhoto
  | SearchResultCollection
  | SearchResultSeries
  | SearchResultTool
  | SearchResultCanvas
  | SearchResultPortfolio;

export interface GroupedResults {
  tools: SearchResultTool[];
  collections: SearchResultCollection[];
  series: SearchResultSeries[];
  portfolios: SearchResultPortfolio[];
  photos: SearchResultPhoto[];
  canvases: SearchResultCanvas[];
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
    route: "3d-atlas",
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
    id: "import-area-upload",
    name: "Upload Photos",
    description: "Upload and import new photos",
    icon: "CloudUploadOutline",
    route: "/import-area#upload",
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
    id: "import-area-processing",
    name: "Photo Processing",
    description: "Analyze and process uploaded photos",
    icon: "CloudUploadOutline",
    route: "/import-area#processing",
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
    id: "chat-lab",
    name: "Chat Lab",
    description: "Chat with your photo library using AI",
    icon: "ChatbubbleOutline",
    route: "/chat-lab",
    searchTerms: [
      "chat",
      "ai",
      "assistant",
      "talk",
      "ask",
      "conversation",
      "lab",
      "natural language",
    ],
  },
  {
    type: "tool",
    id: "tagcloud",
    name: "Tag Cloud",
    description: "Visualize your photo tags as an interactive cloud",
    icon: "PricetagsOutline",
    route: "/tagcloud",
    searchTerms: [
      "tags",
      "keywords",
      "cloud",
      "labels",
      "categories",
      "visualization",
      "word cloud",
    ],
  },
  {
    type: "tool",
    id: "world-map",
    name: "World Map",
    description: "Explore your photos on an interactive world map",
    icon: "EarthOutline",
    route: "/world-map",
    searchTerms: [
      "map",
      "geo",
      "location",
      "gps",
      "geography",
      "places",
      "countries",
      "coordinates",
    ],
  },
  {
    type: "tool",
    id: "2d-atlas",
    name: "2D View",
    description: "Explore photos in a 2D scatter plot",
    icon: "ScanOutline",
    route: "/2d-atlas",
    searchTerms: [
      "2d",
      "scatter",
      "plot",
      "flat",
      "plane",
      "cluster",
      "similarity",
    ],
  },
  {
    type: "tool",
    id: "geo-recovery",
    name: "Geo Recovery",
    description: "Recover GPS location for photos missing coordinates",
    icon: "LocationOutline",
    route: "/geo-recovery",
    searchTerms: [
      "gps",
      "geolocation",
      "location",
      "recover",
      "coordinates",
      "missing",
      "guess",
    ],
  },
  {
    type: "tool",
    id: "settings",
    name: "Settings",
    description: "Configure app settings and preferences",
    icon: "SettingsOutline",
    route: "/settings",
    searchTerms: [
      "config",
      "preferences",
      "options",
      "configure",
      "setup",
      "credit",
      "package",
      "buy",
      "recharge",
      "analysys",
      "quota",
    ],
  },
];

export function useGlobalSearch() {
  const photosStore = usePhotosStore();
  const collectionsStore = useCollectionsStore();
  const seriesStore = useSeriesStore();
  const portfolioBuildsStore = usePortfolioBuildsStore();
  const userStore = useUserStore();

  const searchQuery = ref("");
  const isSearching = ref(false);
  const maxResultsPerCategory = ref(5);

  // Canvas list cache
  const canvasList = ref<SearchResultCanvas[]>([]);

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

  // Search portfolios
  const searchPortfolios = (query: string): SearchResultPortfolio[] => {
    if (!query || query.length < 2) return [];

    const builds = portfolioBuildsStore.allBuilds || [];

    return builds
      .filter((build: any) => {
        const name = build.config?.name || `Portfolio #${build.id}`;
        return matchesQuery(name, query);
      })
      .slice(0, maxResultsPerCategory.value)
      .map((build: any) => ({
        type: "portfolio" as const,
        id: build.id,
        name: build.config?.name || `Portfolio #${build.id}`,
        photoCount: build.resultCount ?? (build.photoItems || []).length,
        coverUrl: build.photoItems?.[0]?.thumbnailUrl,
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

  // Search canvases
  const searchCanvases = (query: string): SearchResultCanvas[] => {
    if (!query || query.length < 2) return [];
    return canvasList.value
      .filter((c) => matchesQuery(c.name, query))
      .slice(0, maxResultsPerCategory.value);
  };

  // Combined search results
  const searchResults = computed<GroupedResults>(() => {
    const query = searchQuery.value.trim();

    if (!query || query.length < 2) {
      return {
        tools: [],
        collections: [],
        series: [],
        portfolios: [],
        photos: [],
        canvases: [],
      };
    }

    return {
      tools: searchTools(query),
      collections: searchCollections(query),
      series: searchSeries(query),
      portfolios: searchPortfolios(query),
      photos: searchPhotos(query),
      canvases: searchCanvases(query),
    };
  });

  // Total results count
  const totalResults = computed(() => {
    const results = searchResults.value;
    return (
      results.tools.length +
      results.collections.length +
      results.series.length +
      results.portfolios.length +
      results.photos.length +
      results.canvases.length
    );
  });

  // Has any results
  const hasResults = computed(() => totalResults.value > 0);

  // Flat list of all results for keyboard navigation
  const flatResults = computed<SearchResult[]>(() => {
    const results = searchResults.value;
    return [
      ...results.tools,
      ...results.canvases,
      ...results.collections,
      ...results.series,
      ...results.portfolios,
      ...results.photos,
    ];
  });

  // Clear search
  const clearSearch = () => {
    searchQuery.value = "";
  };

  // Load canvas list for search
  const loadCanvases = async () => {
    try {
      if (userStore.isAuthenticated) {
        const res = await api.get("/api/canvas");
        canvasList.value = (res.data || []).map((c: any) => ({
          type: "canvas" as const,
          id: c.id,
          name: c.name || "My Canvas",
          photoCount: c.photoCount || 0,
          updatedAt: c.updatedAt,
        }));
      } else {
        const saved = localStorage.getItem(CANVAS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          canvasList.value = [
            {
              type: "canvas" as const,
              id: "local",
              name: "My Canvas",
              photoCount: parsed?.data?.photos?.length || 0,
            },
          ];
        }
      }
    } catch (error) {
      console.error("Error loading canvases for search:", error);
    }
  };

  // Initialize stores if needed
  const ensureDataLoaded = async () => {
    isSearching.value = true;
    try {
      await Promise.all([
        photosStore.getOrFetch(false),
        collectionsStore.getOrFetch(false),
        seriesStore.getOrFetch(false),
        portfolioBuildsStore.getOrFetch(false),
        loadCanvases(),
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
