/** @jsx h */
import { h } from "preact";
import { useState, useMemo, useCallback } from "preact/hooks";
import styles from "./AIGenerated.css";
import {
  WireframeCard,
  EmptyState,
  FilterBar,
  WireframeItem,
  FilterOptions,
} from "../../shared";

// Mock data for AI generated wireframes
const MOCK_AI_WIREFRAMES: WireframeItem[] = [
  {
    id: "ai-1",
    name: "Home Page - Balanced",
    createdAt: new Date("2024-01-09"),
    updatedAt: new Date("2024-01-09"),
    viewport: 1440,
    source: "ai-page",
    pageType: "home",
    isFavorite: true,
  },
  {
    id: "ai-2",
    name: "Pricing Page - Detailed",
    createdAt: new Date("2024-01-08"),
    updatedAt: new Date("2024-01-08"),
    viewport: 1440,
    source: "ai-page",
    pageType: "pricing",
    isFavorite: false,
  },
  {
    id: "ai-3",
    name: "Hero Block",
    createdAt: new Date("2024-01-07"),
    updatedAt: new Date("2024-01-07"),
    viewport: 1920,
    source: "ai-block",
    blockType: "hero",
    isFavorite: true,
  },
  {
    id: "ai-4",
    name: "Testimonials Block",
    createdAt: new Date("2024-01-06"),
    updatedAt: new Date("2024-01-06"),
    viewport: 1440,
    source: "ai-block",
    blockType: "testimonials",
    isFavorite: false,
  },
  {
    id: "ai-5",
    name: "FAQ Page",
    createdAt: new Date("2024-01-05"),
    updatedAt: new Date("2024-01-05"),
    viewport: 768,
    source: "ai-page",
    pageType: "faq",
    isFavorite: false,
  },
  {
    id: "ai-6",
    name: "Footer Block",
    createdAt: new Date("2024-01-04"),
    updatedAt: new Date("2024-01-04"),
    viewport: 375,
    source: "ai-block",
    blockType: "footer",
    isFavorite: false,
  },
];

type AISubTab = "all" | "pages" | "blocks";

interface AIGeneratedProps {
  onNavigateToAIGeneration?: () => void;
}

export default function AIGenerated({
  onNavigateToAIGeneration,
}: AIGeneratedProps) {
  // State
  const [wireframes, setWireframes] =
    useState<WireframeItem[]>(MOCK_AI_WIREFRAMES);
  const [subTab, setSubTab] = useState<AISubTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterOptions>({
    viewport: "all",
    source: "all",
    sortBy: "date",
    sortOrder: "desc",
    showFavoritesOnly: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Filter wireframes by sub-tab first, then by other filters
  const filteredWireframes = useMemo(() => {
    let result = [...wireframes];

    // Sub-tab filter
    if (subTab === "pages") {
      result = result.filter((w) => w.source === "ai-page");
    } else if (subTab === "blocks") {
      result = result.filter((w) => w.source === "ai-block");
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          w.pageType?.toLowerCase().includes(query) ||
          w.blockType?.toLowerCase().includes(query)
      );
    }

    // Viewport filter
    if (filters.viewport !== "all") {
      result = result.filter((w) => w.viewport === filters.viewport);
    }

    // Favorites filter
    if (filters.showFavoritesOnly) {
      result = result.filter((w) => w.isFavorite);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (filters.sortBy === "date") {
        comparison =
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else {
        comparison = a.name.localeCompare(b.name);
      }
      return filters.sortOrder === "asc" ? -comparison : comparison;
    });

    return result;
  }, [wireframes, subTab, searchQuery, filters]);

  // Counts for sub-tabs
  const counts = useMemo(
    () => ({
      all: wireframes.length,
      pages: wireframes.filter((w) => w.source === "ai-page").length,
      blocks: wireframes.filter((w) => w.source === "ai-block").length,
    }),
    [wireframes]
  );

  // Handlers
  const handleFilterChange = useCallback(
    (newFilters: Partial<FilterOptions>) => {
      setFilters((prev) => ({ ...prev, ...newFilters }));
    },
    []
  );

  const handleOpen = useCallback((item: WireframeItem) => {
    parent.postMessage(
      { pluginMessage: { type: "open-wireframe", data: item } },
      "*"
    );
  }, []);

  const handleToggleFavorite = useCallback((item: WireframeItem) => {
    setWireframes((prev) =>
      prev.map((w) =>
        w.id === item.id ? { ...w, isFavorite: !w.isFavorite } : w
      )
    );
  }, []);

  const handleDelete = useCallback((item: WireframeItem) => {
    if (confirm(`Delete "${item.name}"?`)) {
      setWireframes((prev) => prev.filter((w) => w.id !== item.id));
    }
  }, []);

  const handleClearAll = useCallback(() => {
    const typeLabel =
      subTab === "pages" ? "page" : subTab === "blocks" ? "block" : "";
    const message =
      subTab === "all"
        ? "Delete all AI generated wireframes?"
        : `Delete all AI generated ${typeLabel} wireframes?`;

    if (confirm(`${message} This cannot be undone.`)) {
      if (subTab === "all") {
        setWireframes([]);
      } else {
        const sourceFilter = subTab === "pages" ? "ai-page" : "ai-block";
        setWireframes((prev) => prev.filter((w) => w.source !== sourceFilter));
      }
    }
  }, [subTab]);

  // Loading state
  if (isLoading) {
    return (
      <div class={styles.loadingState}>
        <div class={styles.loadingSpinner} />
        <div class={styles.loadingText}>Loading wireframes...</div>
      </div>
    );
  }

  // Empty state
  if (wireframes.length === 0) {
    return (
      <div class={styles.container}>
        <EmptyState
          icon="🤖"
          title="No AI generated wireframes"
          description="Use AI Generation to create page and block wireframes automatically."
          actionLabel="Go to AI Generations"
          onAction={onNavigateToAIGeneration}
        />
      </div>
    );
  }

  return (
    <div class={styles.container}>
      {/* Sub-tabs for Pages/Blocks */}
      <div class={styles.subTabs}>
        <button
          class={`${styles.subTab} ${subTab === "all" ? styles.active : ""}`}
          onClick={() => setSubTab("all")}
        >
          All ({counts.all})
        </button>
        <button
          class={`${styles.subTab} ${subTab === "pages" ? styles.active : ""}`}
          onClick={() => setSubTab("pages")}
        >
          Pages ({counts.pages})
        </button>
        <button
          class={`${styles.subTab} ${subTab === "blocks" ? styles.active : ""}`}
          onClick={() => setSubTab("blocks")}
        >
          Blocks ({counts.blocks})
        </button>
      </div>

      <FilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showSourceFilter={false}
      />

      <div class={styles.statsBar}>
        <span class={styles.statsCount}>
          {filteredWireframes.length} wireframes
        </span>
        {filteredWireframes.length > 0 && (
          <button class={styles.clearAllBtn} onClick={handleClearAll}>
            Clear{" "}
            {subTab === "all" ? "All" : subTab === "pages" ? "Pages" : "Blocks"}
          </button>
        )}
      </div>

      {filteredWireframes.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No matches found"
          description="Try adjusting your filters or search query."
        />
      ) : (
        <div class={styles.wireframesGrid}>
          {filteredWireframes.map((item) => (
            <WireframeCard
              key={item.id}
              item={item}
              onOpen={handleOpen}
              onToggleFavorite={handleToggleFavorite}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
