import { docsNavigation } from "./docsStructure";
import {
  buildHeadingIds,
  normalizeSearchText,
  stripHeadingText,
} from "../utils/docsSearchUtils";

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

const headingRegex = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/g;
const rawPages = import.meta.glob("../pages/*.tsx", {
  as: "raw",
  eager: true,
}) as Record<string, string>;

let cachedIndex: DocsSearchItem[] | null = null;

const buildIndex = (): DocsSearchItem[] => {
  const items: DocsSearchItem[] = [];

  docsNavigation.forEach((topic) => {
    topic.pages.forEach((page) => {
      const pagePath = `/docs/${topic.id}/${page.path}`;
      const baseSearchText = normalizeSearchText(
        `${page.title} ${topic.title}`
      );

      items.push({
        id: `${topic.id}-${page.id}`,
        pageTitle: page.title,
        topicTitle: topic.title,
        topicId: topic.id,
        pagePath,
        searchText: baseSearchText,
      });

      const sourceKey = Object.keys(rawPages).find((key) =>
        key.endsWith(`/${page.source}.tsx`)
      );

      if (!sourceKey) {
        return;
      }

      const source = rawPages[sourceKey];
      headingRegex.lastIndex = 0;
      const headings: string[] = [];
      let match = headingRegex.exec(source);
      while (match) {
        const headingText = stripHeadingText(match[2]);
        if (headingText) {
          headings.push(headingText);
        }
        match = headingRegex.exec(source);
      }

      const headingIds = buildHeadingIds(headings);
      headings.forEach((heading, index) => {
        if (normalizeSearchText(heading) === normalizeSearchText(page.title)) {
          return;
        }
        const headingId = headingIds[index];
        items.push({
          id: `${topic.id}-${page.id}-${headingId}`,
          pageTitle: page.title,
          topicTitle: topic.title,
          topicId: topic.id,
          pagePath,
          sectionTitle: heading,
          headingId,
          searchText: normalizeSearchText(
            `${page.title} ${topic.title} ${heading}`
          ),
        });
      });
    });
  });

  return items;
};

export const getDocsSearchIndex = (): DocsSearchItem[] => {
  if (!cachedIndex) {
    cachedIndex = buildIndex();
  }
  return cachedIndex;
};
