export interface DocsPage {
  id: string;
  title: string;
  path: string;
  /** One-line descriptor shown on the hub — tells a reader which page is theirs. */
  blurb: string;
}

export interface DocsTopic {
  id: string;
  title: string;
  /** Full URL of the topic's first page — used by the topic redirects. */
  path: string;
  blurb: string;
  pages: DocsPage[];
}

/**
 * The documentation's information architecture. Page ids and paths are load
 * bearing — routes, the SEO config (`DOCS_PAGE_SEO`) and sitemap.xml all key
 * off `${topic.id}/${page.path}`, so they must not change without updating
 * those in step.
 */
export const docsNavigation: DocsTopic[] = [
  {
    id: "introduction",
    title: "Introduction",
    path: "/docs/introduction/what-is",
    blurb: "What the plugin does and who it is for.",
    pages: [
      {
        id: "what-is",
        title: "What is Web2Wireframe?",
        path: "what-is",
        blurb: "The one-paragraph version",
      },
      {
        id: "why-web2wireframe",
        title: "Why Web2Wireframe?",
        path: "why-web2wireframe",
        blurb: "Against importing blind",
      },
    ],
  },
  {
    id: "start",
    title: "Start",
    path: "/docs/start/getting-started",
    blurb: "Install it, configure it, run it once.",
    pages: [
      {
        id: "how-to-install",
        title: "How to install",
        path: "how-to-install",
        blurb: "Figma and the extension",
      },
      {
        id: "getting-started",
        title: "Getting started",
        path: "getting-started",
        blurb: "The plugin window",
      },
      {
        id: "set-settings",
        title: "Set your settings",
        path: "set-settings",
        blurb: "Read this one",
      },
      {
        id: "fast-first-import",
        title: "Fast first import",
        path: "fast-first-import",
        blurb: "Four minutes",
      },
    ],
  },
  {
    id: "import-methods",
    title: "Import methods",
    path: "/docs/import-methods/web-import",
    blurb: "Three ways in: a URL, pasted HTML, or a region.",
    pages: [
      {
        id: "web-import",
        title: "Web import",
        path: "web-import",
        blurb: "From a public URL",
      },
      {
        id: "html-import",
        title: "HTML import",
        path: "html-import",
        blurb: "Pasted markup",
      },
      {
        id: "area-capture",
        title: "Area capture",
        path: "area-capture",
        blurb: "One region only",
      },
    ],
  },
  {
    id: "browser-extension",
    title: "Browser extension",
    path: "/docs/browser-extension/extension-overview",
    blurb: "For pages Figma can't reach on its own.",
    pages: [
      {
        id: "extension-overview",
        title: "Extension overview",
        path: "extension-overview",
        blurb: "What it adds",
      },
      {
        id: "import-with-extension",
        title: "Import with the extension",
        path: "import-with-extension",
        blurb: "Capture to canvas",
      },
    ],
  },
];

export interface FlatDocsPage extends DocsPage {
  topicId: string;
  topicTitle: string;
  /** `${topicId}/${page.path}` — the key used by articles and the SEO config. */
  key: string;
  route: string;
}

export function getAllDocPages(): FlatDocsPage[] {
  return docsNavigation.flatMap((topic) =>
    topic.pages.map((page) => ({
      ...page,
      topicId: topic.id,
      topicTitle: topic.title,
      key: `${topic.id}/${page.path}`,
      route: `/docs/${topic.id}/${page.path}`,
    })),
  );
}

export function getTopics(): Omit<DocsTopic, "pages">[] {
  return docsNavigation.map(({ pages: _pages, ...topic }) => topic);
}
