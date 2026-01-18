// Library shared types

export interface WireframeItem {
  id: string;
  name: string;
  thumbnail?: string;
  createdAt: Date;
  updatedAt: Date;
  viewport: number;
  source: "web" | "screenshot" | "html" | "area" | "ai-page" | "ai-block";
  pageType?: string; // For AI generated: 'home', 'pricing', etc.
  blockType?: string; // For AI blocks: 'hero', 'footer', etc.
  url?: string; // Original URL for web imports
  isFavorite: boolean;
}

export interface FilterOptions {
  viewport: number | "all";
  source: WireframeItem["source"] | "all";
  sortBy: "date" | "name";
  sortOrder: "asc" | "desc";
  showFavoritesOnly: boolean;
}

export type LibraryMode = "my" | "community";
export type MyLibraryTab = "imported" | "ai-generated";
export type LibraryTab = "imported" | "ai-generated" | "community";
