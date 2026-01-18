/** @jsx h */
import { h } from "preact";
import { useState, useMemo, useCallback } from "preact/hooks";
import styles from "./WebImported.css";

import {
  WireframeCard,
  EmptyState,
  FilterBar,
  WireframeItem,
  FilterOptions,
} from "../../shared";

// Mock data for demonstration - in real app this would come from storage/API
const MOCK_IMPORTED_WIREFRAMES: WireframeItem[] = [
  {
    id: "1",
    name: "Apple Homepage",
    createdAt: new Date("2024-01-08"),
    updatedAt: new Date("2024-01-08"),
    viewport: 1440,
    source: "web",
    url: "https://apple.com",
    isFavorite: true,
  },
  {
    id: "2",
    name: "Stripe Pricing",
    createdAt: new Date("2024-01-07"),
    updatedAt: new Date("2024-01-07"),
    viewport: 1920,
    source: "web",
    url: "https://stripe.com/pricing",
    isFavorite: false,
  },
  {
    id: "3",
    name: "Dashboard Screenshot",
    createdAt: new Date("2024-01-06"),
    updatedAt: new Date("2024-01-06"),
    viewport: 1440,
    source: "screenshot",
    isFavorite: false,
  },
  {
    id: "4",
    name: "Custom HTML Layout",
    createdAt: new Date("2024-01-05"),
    updatedAt: new Date("2024-01-05"),
    viewport: 768,
    source: "html",
    isFavorite: true,
  },
  {
    id: "5",
    name: "Hero Section Area",
    createdAt: new Date("2024-01-04"),
    updatedAt: new Date("2024-01-04"),
    viewport: 375,
    source: "area",
    isFavorite: false,
  },
];

interface WebImportedProps {
  onNavigateToImport?: () => void;
}

export default function WebImported({ onNavigateToImport }: WebImportedProps) {
  // State
  const [wireframes, setWireframes] = useState<WireframeItem[]>(
    MOCK_IMPORTED_WIREFRAMES
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<FilterOptions>({
    viewport: "all",
    source: "all",
    sortBy: "date",
    sortOrder: "desc",
    showFavoritesOnly: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Filter and sort wireframes
  const filteredWireframes = useMemo(() => {
    let result = [...wireframes];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          w.url?.toLowerCase().includes(query)
      );
    }

    // Viewport filter
    if (filters.viewport !== "all") {
      result = result.filter((w) => w.viewport === filters.viewport);
    }

    // Source filter
    if (filters.source !== "all") {
      result = result.filter((w) => w.source === filters.source);
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
  }, [wireframes, searchQuery, filters]);

  // Handlers
  const handleFilterChange = useCallback(
    (newFilters: Partial<FilterOptions>) => {
      setFilters((prev) => ({ ...prev, ...newFilters }));
    },
    []
  );

  const handleOpen = useCallback((item: WireframeItem) => {
    console.log("Opening wireframe:", item.name);
    // In real app: send message to Figma to open/insert wireframe
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
    if (confirm("Delete all imported wireframes? This cannot be undone.")) {
      setWireframes([]);
    }
  }, []);

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
          icon="🌐"
          title="No imported wireframes"
          description="Import wireframes from websites, screenshots, HTML, or use the browser extension to get started."
          actionLabel="Go to Import"
          onAction={onNavigateToImport}
        />
      </div>
    );
  }

  return (
    <div class={styles.container}>
      <FilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showSourceFilter={true}
      />

      <div class={styles.statsBar}>
        <span class={styles.statsCount}>
          {filteredWireframes.length} of {wireframes.length} wireframes
        </span>
        {wireframes.length > 0 && (
          <button class={styles.clearAllBtn} onClick={handleClearAll}>
            Clear All
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
