/** @jsx h */
import { h } from "preact";
import { useState, useMemo, useCallback } from "preact/hooks";
import styles from "./Community.css";

// Types for community wireframes
interface CommunityWireframe {
  id: string;
  name: string;
  thumbnail?: string;
  author: string;
  downloads: number;
  type: "page" | "block";
  category: string;
  viewport: number;
  createdAt: Date;
}

type Category =
  | "all"
  | "landing"
  | "pricing"
  | "hero"
  | "footer"
  | "nav"
  | "testimonials"
  | "faq";
type SortBy = "popular" | "newest" | "name";

// Mock community data
const MOCK_COMMUNITY_WIREFRAMES: CommunityWireframe[] = [
  {
    id: "c1",
    name: "Modern Landing Page",
    author: "design_pro",
    downloads: 1247,
    type: "page",
    category: "landing",
    viewport: 1440,
    createdAt: new Date("2024-01-09"),
  },
  {
    id: "c2",
    name: "SaaS Pricing Table",
    author: "ui_master",
    downloads: 892,
    type: "block",
    category: "pricing",
    viewport: 1440,
    createdAt: new Date("2024-01-08"),
  },
  {
    id: "c3",
    name: "Hero with Video BG",
    author: "creative_dev",
    downloads: 756,
    type: "block",
    category: "hero",
    viewport: 1920,
    createdAt: new Date("2024-01-07"),
  },
  {
    id: "c4",
    name: "Minimal Footer",
    author: "clean_ui",
    downloads: 634,
    type: "block",
    category: "footer",
    viewport: 1440,
    createdAt: new Date("2024-01-06"),
  },
  {
    id: "c5",
    name: "Startup Homepage",
    author: "design_pro",
    downloads: 521,
    type: "page",
    category: "landing",
    viewport: 1440,
    createdAt: new Date("2024-01-05"),
  },
  {
    id: "c6",
    name: "FAQ Accordion",
    author: "component_king",
    downloads: 489,
    type: "block",
    category: "faq",
    viewport: 768,
    createdAt: new Date("2024-01-04"),
  },
  {
    id: "c7",
    name: "Testimonials Carousel",
    author: "ui_master",
    downloads: 412,
    type: "block",
    category: "testimonials",
    viewport: 1440,
    createdAt: new Date("2024-01-03"),
  },
  {
    id: "c8",
    name: "Navigation Bar",
    author: "nav_expert",
    downloads: 378,
    type: "block",
    category: "nav",
    viewport: 1920,
    createdAt: new Date("2024-01-02"),
  },
];

const CATEGORIES: Array<{ value: Category; label: string }> = [
  { value: "all", label: "All" },
  { value: "landing", label: "Landing" },
  { value: "pricing", label: "Pricing" },
  { value: "hero", label: "Hero" },
  { value: "footer", label: "Footer" },
  { value: "nav", label: "Navigation" },
  { value: "testimonials", label: "Testimonials" },
  { value: "faq", label: "FAQ" },
];

export default function Community() {
  const [wireframes] = useState<CommunityWireframe[]>(
    MOCK_COMMUNITY_WIREFRAMES
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [sortBy, setSortBy] = useState<SortBy>("popular");
  const [isLoading, setIsLoading] = useState(false);

  // Filter and sort
  const filteredWireframes = useMemo(() => {
    let result = [...wireframes];

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (w) =>
          w.name.toLowerCase().includes(query) ||
          w.author.toLowerCase().includes(query)
      );
    }

    // Category
    if (category !== "all") {
      result = result.filter((w) => w.category === category);
    }

    // Sort
    switch (sortBy) {
      case "popular":
        result.sort((a, b) => b.downloads - a.downloads);
        break;
      case "newest":
        result.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        break;
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return result;
  }, [wireframes, searchQuery, category, sortBy]);

  // Total stats
  const totalDownloads = useMemo(
    () => wireframes.reduce((sum, w) => sum + w.downloads, 0),
    [wireframes]
  );

  // Handlers
  const handleUse = useCallback((item: CommunityWireframe) => {
    parent.postMessage(
      { pluginMessage: { type: "use-community-wireframe", data: item } },
      "*"
    );
  }, []);

  const handlePreview = useCallback((_item: CommunityWireframe) => {
    // TODO: Show preview modal
  }, []);

  const handleContribute = useCallback(() => {
    alert("Publishing wireframes to Community will be available soon!");
  }, []);

  if (isLoading) {
    return (
      <div class={styles.loadingState}>
        <div class={styles.loadingSpinner} />
        <div class={styles.loadingText}>Loading community wireframes...</div>
      </div>
    );
  }

  return (
    <div class={styles.container}>
      {/* Stats Banner */}
      <div class={styles.statsBanner}>
        <div class={styles.statsInfo}>
          <div class={styles.statsTitle}>
            🌍 {wireframes.length.toLocaleString()} Community Wireframes
          </div>
          <div class={styles.statsSubtitle}>
            {totalDownloads.toLocaleString()} total downloads
          </div>
        </div>
        <button class={styles.contributeBtn} onClick={handleContribute}>
          + Contribute
        </button>
      </div>

      {/* Search Bar */}
      <div class={styles.searchBar}>
        <input
          type="text"
          class={styles.searchInput}
          placeholder="Search wireframes..."
          value={searchQuery}
          onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
        />
        <select
          class={styles.sortSelect}
          value={sortBy}
          onChange={(e) =>
            setSortBy((e.target as HTMLSelectElement).value as SortBy)
          }
        >
          <option value="popular">Most Popular</option>
          <option value="newest">Newest</option>
          <option value="name">Name A-Z</option>
        </select>
      </div>

      {/* Category Tabs */}
      <div class={styles.categoryTabs}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            class={`${styles.categoryTab} ${
              category === cat.value ? styles.active : ""
            }`}
            onClick={() => setCategory(cat.value)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Wireframes Grid */}
      <div class={styles.wireframesGrid}>
        {filteredWireframes.map((item) => (
          <div key={item.id} class={styles.communityCard}>
            <div class={styles.cardThumbnail}>
              {item.thumbnail ? (
                <img src={item.thumbnail} alt={item.name} />
              ) : (
                <div class={styles.placeholderIcon}>
                  {item.type === "page" ? "📄" : "🧱"}
                </div>
              )}
              <div class={styles.downloadCount}>
                ⬇ {item.downloads.toLocaleString()}
              </div>
            </div>
            <div class={styles.cardBody}>
              <div class={styles.cardName} title={item.name}>
                {item.name}
              </div>
              <div class={styles.cardMeta}>
                <span class={`${styles.typeBadge} ${styles[item.type]}`}>
                  {item.type}
                </span>
                <span class={styles.cardAuthor}>by {item.author}</span>
              </div>
              <div class={styles.cardActions}>
                <button class={styles.useBtn} onClick={() => handleUse(item)}>
                  Use
                </button>
                <button
                  class={styles.previewBtn}
                  onClick={() => handlePreview(item)}
                >
                  👁
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
