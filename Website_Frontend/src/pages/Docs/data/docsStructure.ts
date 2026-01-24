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
    id: "ai-generation",
    title: "AI Generation",
    icon: "✨",
    path: "/docs/ai-generation/overview",
    pages: [
      {
        id: "overview",
        title: "AI Generation Overview",
        path: "overview",
        source: "AIGenerationOverview",
      },
      {
        id: "page-generation",
        title: "Page Generation (Generate Page)",
        path: "page-generation",
        source: "AIGenerationPage",
      },
      {
        id: "block-generation",
        title: "Block Generation (Generate Block)",
        path: "block-generation",
        source: "AIGenerationBlock",
      },
      {
        id: "pricing",
        title: "AI Generation Pricing & Availability",
        path: "pricing",
        source: "AIGenerationPricing",
      },
    ],
  },
  {
    id: "library",
    title: "Library",
    icon: "📚",
    path: "/docs/library/overview",
    pages: [
      {
        id: "overview",
        title: "Library Overview",
        path: "overview",
        source: "LibraryOverview",
      },
      {
        id: "my-library",
        title: "My Library",
        path: "my-library",
        source: "LibraryMy",
      },
      {
        id: "community-library",
        title: "Community Library",
        path: "community-library",
        source: "LibraryCommunity",
      },
      {
        id: "contributing",
        title: "Contributing to the Community",
        path: "contributing",
        source: "LibraryContributing",
      },
      {
        id: "best-practices",
        title: "Best Practices for Using the Library",
        path: "best-practices",
        source: "LibraryBestPractices",
      },
      {
        id: "value",
        title: "Value of the Library in Your Workflow",
        path: "value",
        source: "LibraryValue",
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
        title: "Purchase & Subscription",
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
