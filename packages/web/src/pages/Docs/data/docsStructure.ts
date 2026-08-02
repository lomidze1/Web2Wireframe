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
    blurb: "Four ways in. Screenshot is the one most people use.",
    pages: [
      {
        id: "web-import",
        title: "Web import",
        path: "web-import",
        blurb: "From a public URL",
      },
      {
        id: "screenshot-import",
        title: "Screenshot import",
        path: "screenshot-import",
        blurb: "Behind a login",
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
  {
    id: "pricing",
    title: "Pricing & plans",
    path: "/docs/pricing/overview",
    blurb: "Ten free imports a month, every option unlocked.",
    pages: [
      {
        id: "overview",
        title: "Pricing overview",
        path: "overview",
        blurb: "Free and Pro",
      },
      {
        id: "purchase",
        title: "Purchase & access",
        path: "purchase",
        blurb: "Billing and licences",
      },
      {
        id: "additional",
        title: "Additional information",
        path: "additional",
        blurb: "Refunds, VAT, teams",
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
