import type { DocsArticle, DocsArticleMap } from "./docsTypes";
import { legacyArticles } from "./docsArticlesLegacy";
import screenshotImport1 from "../../../assets/how-it-work/card-details/screenshot-import-1.png";
import textSettings1 from "../../../assets/how-it-work/card-details/text-settings-1.png";
import colorSettings1 from "../../../assets/how-it-work/card-details/color-settings-1.png";
import urlImport1 from "../../../assets/how-it-work/card-details/url-import-1.png";
import urlImport2 from "../../../assets/how-it-work/card-details/url-import-2.png";

/**
 * The articles the product data says matter: nobody opens the settings
 * panel, and the first import is where users are lost.
 */
const featuredArticles: DocsArticleMap = {
  "start/set-settings": {
    lead: "Seven groups of options, each one a task you would otherwise redo by hand in Figma. Set them once and the plugin remembers.",
    readingTime: "6 min read",
    updated: "Updated 28 July 2026",
    sections: [
      {
        id: "where-the-settings-live",
        title: "Where the settings live",
        paras: [
          "The import screen shows a source field and an Import button. Everything else sits under More Options, one click below. It is collapsed by default and it is where the plugin actually earns its place — an import run on untouched defaults is a reasonable wireframe; an import run on your settings is the file you would have edited it into.",
        ],
        figure: {
          src: screenshotImport1,
          caption:
            "The import panel with the options visible below the source field.",
        },
      },
      {
        id: "viewports",
        title: "Viewports",
        paras: [
          "Choose every width you intend to design for and the plugin produces them in a single run, side by side on the canvas. Selecting them up front is the difference between one import and three, and a multi-viewport run is still a single import.",
        ],
        list: [
          "1440 — the default desktop frame",
          "768 — tablet and small laptop",
          "375 — mobile",
        ],
        note: "Default: 1440 only. Add the others before you import; they cannot be added afterwards without re-running.",
      },
      {
        id: "layout-mode",
        title: "Layout mode",
        paras: [
          "Auto layout converts the page's flex and grid structures into responsive Figma frames, falling back to absolute positioning only where the source does not map cleanly. Absolute pins every layer at the exact coordinates it was captured at.",
          "Choose auto layout whenever you intend to edit the file. Choose absolute when you want a faithful, frozen snapshot — an audit exhibit, or a reference you will annotate rather than change.",
        ],
      },
      {
        id: "text",
        title: "Text",
        paras: [
          "Semantic replaces the page's copy with neutral labels — Heading 1, Paragraph, Button — so structure reads before content. Lorem substitutes latin at the original character counts, which keeps line breaks and spacing honest. Real copy keeps the site's own words.",
        ],
        list: [
          "Semantic — structural reviews and redesign starting points",
          "Lorem — layout work where the measure matters",
          "Real copy — audits and stakeholder presentations",
        ],
        note: "Default: semantic. If you are showing the import to someone who has not seen the original page, use real copy.",
        figure: {
          src: textSettings1,
          caption:
            "The text options, with each mode described in the panel.",
        },
      },
      {
        id: "assets",
        title: "Assets",
        paras: [
          "Placeholders match the original image dimensions and keep the file light. Real assets download and embed the source images, which is what you want when presenting a redesign against the live page — and what you do not want when the page carries forty product photographs.",
        ],
      },
      {
        id: "colours-and-fonts",
        title: "Colours and fonts",
        paras: [
          "The plugin palette is five editable roles — text, background, secondary, surface and accent — tuned to read as a wireframe. The site palette imports what was actually on the page. Both are editable after import; neither is baked in.",
          "Fonts follow the same shape. Plugin defaults import instantly with no font linking. Site fonts keep the real typefaces, and where a face is not available in Figma, the plugin can download the binary so the file sets correctly instead of silently substituting.",
        ],
        note: "Every setting on this page is included. Web2Wireframe is free.",
        figure: {
          src: colorSettings1,
          caption:
            "The five colour roles, each editable before the import runs.",
        },
      },
      {
        id: "css-variables",
        title: "CSS variables",
        paras: [
          "Direct values write hex codes and sizes straight onto the layers. Figma variables create a reusable variable set instead, using the site's own custom-property names where they exist and generated names where they do not.",
          "Pick Figma variables when the import will feed a library or be re-themed. Pick direct values when it is a one-off reference.",
        ],
      },
      {
        id: "saving-your-defaults",
        title: "Saving your defaults",
        paras: [
          "The footer of the settings panel has a Save button. It writes the current configuration as your default for every future import, in every file. Most of the time you will set this once, in your first week, and never open the panel again.",
        ],
        note: "If you only do one thing after reading this page: set your four most-used options and press Save.",
      },
    ],
  },

  "start/fast-first-import": {
    lead: "Install, point the plugin at a page, set four options, import. About four minutes, most of it spent choosing.",
    readingTime: "4 min read",
    updated: "Updated 28 July 2026",
    sections: [
      {
        id: "before-you-start",
        title: "Before you start",
        paras: [
          "You need the Figma plugin installed and a Figma file open. The browser extension is optional and only needed for area capture.",
        ],
        list: [
          "Web2Wireframe from the Figma Community",
          "Any Figma design file, open",
          "A page you want to import — a public URL is the easiest first test",
        ],
      },
      {
        id: "run-it",
        title: "Run it",
        paras: [
          "Open the plugin from the Figma menu, paste a URL into the source field, and stop before pressing Import. The next step is the one that matters.",
        ],
        figure: {
          src: urlImport1,
          caption: "The plugin window with a URL in the source field.",
        },
      },
      {
        id: "set-four-options",
        title: "Set four options",
        paras: [
          "You do not need all seven groups on your first run. Four will change the result more than the rest combined.",
        ],
        list: [
          "Viewports — add 375 if you design mobile; it costs nothing extra",
          "Layout mode — auto layout, unless you want a frozen snapshot",
          "Text — semantic to read structure, real copy to show someone",
          "Assets — placeholders to stay light, real assets to present",
        ],
        note: "Then press Save in the settings footer so the next import starts here rather than at the defaults.",
      },
      {
        id: "import",
        title: "Import",
        paras: [
          "Frames arrive named and nested, text is real text, and auto layout is already applied wherever the source allowed it. Rename nothing; start designing.",
          "If the result is not what you expected, the settings panel is almost always the answer — change one group and run it again.",
        ],
        figure: {
          src: urlImport2,
          caption: "The import running, with the chosen options applied.",
        },
      },
    ],
  },
};

export const docsArticles: DocsArticleMap = {
  ...legacyArticles,
  ...featuredArticles,
};

/** Rendered for any page that is listed but not yet written. */
export const draftArticle: DocsArticle = {
  lead: "This page is being written. In the meantime the settings guide covers most of what people ask about here.",
  readingTime: "—",
  updated: "Draft",
  sections: [
    {
      id: "coming-soon",
      title: "Coming soon",
      paras: [
        "The reference for this topic is in progress. Until it lands, see Set your settings, which covers the options this page will describe, or open the live console on the overview page and change them yourself.",
      ],
      note: "Pages still in draft are marked in the sidebar so you are never sent to an empty page from search.",
    },
  ],
};

export function getArticle(key: string): {
  article: DocsArticle;
  isDraft: boolean;
} {
  const article = docsArticles[key];
  return article
    ? { article, isDraft: false }
    : { article: draftArticle, isDraft: true };
}
