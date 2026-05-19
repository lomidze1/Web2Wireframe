export interface DocsPage {
  id: string;
  title: string;
  path: string;
  source: string;
}

export interface DocsTopic {
  id: string;
  title: string;
  icon: string;
  path: string;
  pages: DocsPage[];
}

export const docsNavigation: DocsTopic[] = [
  {
    id: "introduction",
    title: "Introduction",
    icon: "👋",
    path: "/docs/introduction/what-is",
    pages: [
      {
        id: "what-is",
        title: "What is Web2Wireframe?",
        path: "what-is",
        source: "IntroductionWhatIs",
      },
      {
        id: "why-web2wireframe",
        title: "Why Web2Wireframe?",
        path: "why-web2wireframe",
        source: "IntroductionWhy",
      },
    ],
  },
  {
    id: "start",
    title: "Start",
    icon: "⚡",
    path: "/docs/start/getting-started",
    pages: [
      {
        id: "how-to-install",
        title: "How to Install",
        path: "how-to-install",
        source: "InstallHowTo",
      },
      {
        id: "getting-started",
        title: "Getting Started",
        path: "getting-started",
        source: "StartGettingStarted",
      },
      {
        id: "set-settings",
        title: "Set Settings",
        path: "set-settings",
        source: "StartSetSettings",
      },
      {
        id: "fast-first-import",
        title: "Fast First Import",
        path: "fast-first-import",
        source: "StartFastFirstImport",
      },
    ],
  },
  {
    id: "import-methods",
    title: "Import Methods",
    icon: "📥",
    path: "/docs/import-methods/web-import",
    pages: [
      {
        id: "web-import",
        title: "Web Import",
        path: "web-import",
        source: "ImportWeb",
      },
      {
        id: "screenshot-import",
        title: "Screenshot Import",
        path: "screenshot-import",
        source: "ImportScreenshot",
      },
      {
        id: "html-import",
        title: "HTML Import",
        path: "html-import",
        source: "ImportHTML",
      },
      {
        id: "area-capture",
        title: "Area Capture",
        path: "area-capture",
        source: "ImportAreaCapture",
      },
    ],
  },
  {
    id: "browser-extension",
    title: "Browser Extension",
    icon: "🧩",
    path: "/docs/browser-extension/extension-overview",
    pages: [
      {
        id: "extension-overview",
        title: "Extension Overview",
        path: "extension-overview",
        source: "BrowserExtensionOverview",
      },
      {
        id: "import-with-extension",
        title: "Import with Extension",
        path: "import-with-extension",
        source: "BrowserExtensionImport",
      },
    ],
  },
  {
    id: "pricing",
    title: "Pricing & Plans",
    icon: "💳",
    path: "/docs/pricing/overview",
    pages: [
      {
        id: "overview",
        title: "Pricing Overview",
        path: "overview",
        source: "PricingOverview",
      },
      {
        id: "purchase",
        title: "Purchase & Access",
        path: "purchase",
        source: "PricingPurchase",
      },
      {
        id: "additional",
        title: "Additional Information",
        path: "additional",
        source: "PricingAdditional",
      },
    ],
  },
];

export const getAllDocPages = (): (DocsPage & {
  topicId: string;
  topicTitle: string;
})[] => {
  return docsNavigation.flatMap((topic) =>
    topic.pages.map((page) => ({
      ...page,
      topicId: topic.id,
      topicTitle: topic.title,
    })),
  );
};

export const getTopics = (): Omit<DocsTopic, "pages">[] => {
  return docsNavigation.map(({ ...topic }) => ({
    id: topic.id,
    title: topic.title,
    icon: topic.icon,
    path: topic.path,
  }));
};
