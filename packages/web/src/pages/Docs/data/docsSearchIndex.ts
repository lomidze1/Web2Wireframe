import { getAllDocPages } from "./docsStructure";
import { docsArticles } from "./docsArticles";
import { normalizeSearchText } from "../utils/docsSearchUtils";

export interface DocsSearchItem {
  id: string;
  pageTitle: string;
  topicTitle: string;
  topicId: string;
  pagePath: string;
  sectionTitle?: string;
  headingId?: string;
  searchText: string;
}

let cachedIndex: DocsSearchItem[] | null = null;

/**
 * Builds the search index straight from the content model — one entry per
 * page plus one per section. The previous implementation scraped headings
 * out of raw JSX source with a regex; now that articles are data, the index
 * and the rendered page cannot drift apart.
 */
export function getDocsSearchIndex(): DocsSearchItem[] {
  if (cachedIndex) return cachedIndex;

  const index: DocsSearchItem[] = [];

  for (const page of getAllDocPages()) {
    index.push({
      id: page.key,
      pageTitle: page.title,
      topicTitle: page.topicTitle,
      topicId: page.topicId,
      pagePath: page.path,
      searchText: normalizeSearchText(
        `${page.title} ${page.topicTitle} ${page.blurb}`,
      ),
    });

    const article = docsArticles[page.key];
    if (!article) continue;

    for (const section of article.sections) {
      index.push({
        id: `${page.key}#${section.id}`,
        pageTitle: page.title,
        topicTitle: page.topicTitle,
        topicId: page.topicId,
        pagePath: page.path,
        sectionTitle: section.title,
        headingId: section.id,
        searchText: normalizeSearchText(
          `${section.title} ${page.title} ${page.topicTitle}`,
        ),
      });
    }
  }

  cachedIndex = index;
  return index;
}

export function searchDocs(query: string, limit = 8): DocsSearchItem[] {
  const needle = normalizeSearchText(query);
  if (!needle) return [];
  return getDocsSearchIndex()
    .filter((item) => item.searchText.includes(needle))
    .slice(0, limit);
}

export function getSearchItemRoute(item: DocsSearchItem): string {
  const base = `/docs/${item.topicId}/${item.pagePath}`;
  return item.headingId ? `${base}#${item.headingId}` : base;
}
