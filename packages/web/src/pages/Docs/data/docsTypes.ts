/**
 * Content model for the documentation. Articles are data, not JSX, so the
 * table of contents, the search index and the prev/next links can all be
 * derived from the same source instead of scraped from the DOM.
 */

export interface DocsFigure {
  /** Imported asset URL (Vite resolves the import to a hashed path). */
  src: string;
  caption: string;
}

export interface DocsSection {
  /** Slug used as the heading id and the "On this page" anchor. */
  id: string;
  title: string;
  paras: string[];
  /** Rendered as the ruled list — the design system has no bullets. */
  list?: string[];
  /** One italic aside per section at most; this is the only callout. */
  note?: string;
  figure?: DocsFigure;
}

export interface DocsArticle {
  lead: string;
  readingTime: string;
  updated: string;
  sections: DocsSection[];
}

/** Keyed by `${topicId}/${pagePath}` — the same key the SEO config uses. */
export type DocsArticleMap = Record<string, DocsArticle>;
