/** @jsx h */
import { h, ComponentChildren } from "preact";
import styles from "./components.css";
import { WireframeItem, FilterOptions } from "./types";

// Wireframe Card Component
interface WireframeCardProps {
  item: WireframeItem;
  onOpen: (item: WireframeItem) => void;
  onToggleFavorite: (item: WireframeItem) => void;
  onDelete?: (item: WireframeItem) => void;
}

export function WireframeCard({
  item,
  onOpen,
  onToggleFavorite,
  onDelete,
}: WireframeCardProps) {
  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const getSourceLabel = (source: WireframeItem["source"]) => {
    switch (source) {
      case "web":
        return "Web";
      case "screenshot":
        return "Screenshot";
      case "html":
        return "HTML";
      case "area":
        return "Area";
      case "ai-page":
        return "AI Page";
      case "ai-block":
        return "AI Block";
      default:
        return source;
    }
  };

  const getSourceClass = (source: WireframeItem["source"]) => {
    switch (source) {
      case "web":
        return styles.web;
      case "screenshot":
        return styles.screenshot;
      case "html":
        return styles.html;
      case "area":
        return styles.area;
      case "ai-page":
        return styles.aiPage;
      case "ai-block":
        return styles.aiBlock;
      default:
        return "";
    }
  };

  return (
    <div class={styles.wireframeCard}>
      <div class={styles.cardThumbnail}>
        {item.thumbnail ? (
          <img src={item.thumbnail} alt={item.name} />
        ) : (
          <div class={styles.placeholderIcon}>⬚</div>
        )}
        <button
          class={`${styles.favoriteBtn} ${
            item.isFavorite ? styles.isFavorite : ""
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(item);
          }}
          title={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          {item.isFavorite ? "★" : "☆"}
        </button>
      </div>
      <div class={styles.cardBody}>
        <div class={styles.cardName} title={item.name}>
          {item.name}
        </div>
        <div class={styles.cardMeta}>
          <span class={`${styles.sourceBadge} ${getSourceClass(item.source)}`}>
            {getSourceLabel(item.source)}
          </span>
          <span class={styles.cardViewport}>📐 {item.viewport}px</span>
          <span class={styles.cardDate}>{formatDate(item.createdAt)}</span>
        </div>
        <div class={styles.cardActions}>
          <button
            class={`${styles.cardActionBtn} ${styles.primary}`}
            onClick={() => onOpen(item)}
          >
            Open
          </button>
          {onDelete && (
            <button
              class={styles.cardActionBtn}
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item);
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Empty State Component
interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon = "📁",
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div class={styles.emptyState}>
      <div class={styles.emptyIcon}>{icon}</div>
      <div class={styles.emptyTitle}>{title}</div>
      <div class={styles.emptyDescription}>{description}</div>
      {actionLabel && onAction && (
        <button class={styles.emptyAction} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// Filter Bar Component
interface FilterBarProps {
  filters: FilterOptions;
  onFilterChange: (filters: Partial<FilterOptions>) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showSourceFilter?: boolean;
  sourceOptions?: Array<{ value: string; label: string }>;
}

export function FilterBar({
  filters,
  onFilterChange,
  searchQuery,
  onSearchChange,
  showSourceFilter = true,
  sourceOptions,
}: FilterBarProps) {
  const defaultSourceOptions = [
    { value: "all", label: "All Sources" },
    { value: "web", label: "Web" },
    { value: "screenshot", label: "Screenshot" },
    { value: "html", label: "HTML" },
    { value: "area", label: "Area" },
  ];

  const viewportOptions = [
    { value: "all", label: "All Viewports" },
    { value: "1920", label: "1920px" },
    { value: "1440", label: "1440px" },
    { value: "1024", label: "1024px" },
    { value: "768", label: "768px" },
    { value: "375", label: "375px" },
  ];

  return (
    <div class={styles.filterBar}>
      <input
        type="text"
        class={styles.searchInput}
        placeholder="Search wireframes..."
        value={searchQuery}
        onInput={(e) => onSearchChange((e.target as HTMLInputElement).value)}
      />

      <div class={styles.filterGroup}>
        <span class={styles.filterLabel}>Viewport:</span>
        <select
          class={styles.filterSelect}
          value={String(filters.viewport)}
          onChange={(e) =>
            onFilterChange({
              viewport:
                (e.target as HTMLSelectElement).value === "all"
                  ? "all"
                  : parseInt((e.target as HTMLSelectElement).value),
            })
          }
        >
          {viewportOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {showSourceFilter && (
        <div class={styles.filterGroup}>
          <span class={styles.filterLabel}>Source:</span>
          <select
            class={styles.filterSelect}
            value={filters.source}
            onChange={(e) =>
              onFilterChange({
                source: (e.target as HTMLSelectElement)
                  .value as FilterOptions["source"],
              })
            }
          >
            {(sourceOptions || defaultSourceOptions).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        class={`${styles.filterToggle} ${
          filters.showFavoritesOnly ? styles.active : ""
        }`}
        onClick={() =>
          onFilterChange({ showFavoritesOnly: !filters.showFavoritesOnly })
        }
      >
        ★ Favorites
      </button>

      <div class={styles.filterGroup}>
        <span class={styles.filterLabel}>Sort:</span>
        <select
          class={styles.filterSelect}
          value={`${filters.sortBy}-${filters.sortOrder}`}
          onChange={(e) => {
            const [sortBy, sortOrder] = (
              e.target as HTMLSelectElement
            ).value.split("-");
            onFilterChange({
              sortBy: sortBy as FilterOptions["sortBy"],
              sortOrder: sortOrder as FilterOptions["sortOrder"],
            });
          }}
        >
          <option value="date-desc">Newest First</option>
          <option value="date-asc">Oldest First</option>
          <option value="name-asc">Name A-Z</option>
          <option value="name-desc">Name Z-A</option>
        </select>
      </div>
    </div>
  );
}

// Export index
export type { WireframeItem, FilterOptions, LibraryTab } from "./types";
