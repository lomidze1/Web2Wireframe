import type { DocsArticle, DocsArticleMap } from "./docsTypes";
import { legacyArticles } from "./docsArticlesLegacy";
import screenshotImport1 from "../../../assets/how-it-work/card-details/screenshot-import-1.png";
import screenshotImport2 from "../../../assets/how-it-work/card-details/screenshot-import-2.png";
import textSettings1 from "../../../assets/how-it-work/card-details/text-settings-1.png";
import colorSettings1 from "../../../assets/how-it-work/card-details/color-settings-1.png";
import fontSettings1 from "../../../assets/how-it-work/card-details/font-settings-1.png";
import areaSelection1 from "../../../assets/how-it-work/card-details/area-selection-import-1.png";
import urlImport1 from "../../../assets/how-it-work/card-details/url-import-1.png";
import urlImport2 from "../../../assets/how-it-work/card-details/url-import-2.png";

/**
 * The three articles the product data says matter: nobody opens the settings
 * panel, screenshot import is the most-used method, and the first import is
 * where users are lost.
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
          "Choose every width you intend to design for and the plugin produces them in a single run, side by side on the canvas. Selecting them up front is the difference between one import and three, and a multi-viewport run still counts as one import against your monthly quota.",
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
          "Fonts follow the same shape. Plugin defaults import instantly with no font linking. Site fonts keep the real typefaces, and where a face is not available in Figma, Pro can download the binary so the file sets correctly instead of silently substituting.",
        ],
        note: "Font binary download is the only Pro-gated setting. Everything else on this page works on the free plan.",
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

  "import-methods/screenshot-import": {
    lead: "Generate a wireframe from a static image when a URL will not reach the page. The most-used import method, by some distance.",
    readingTime: "5 min read",
    updated: "Updated 28 July 2026",
    sections: [
      {
        id: "what-screenshot-import-does",
        title: "What screenshot import does",
        paras: [
          "Instead of fetching a live page, the plugin reads an image and converts its visual structure into editable Figma frames. It looks for sections, rows, columns and repeated blocks the same way the URL importer does — the difference is that the evidence is pixels rather than markup.",
          "Use it whenever the page cannot be reached directly: anything behind a login, a checkout step, a paywalled article, or a design that only ever existed as an image.",
        ],
        figure: {
          src: screenshotImport1,
          caption: "The screenshot tab, waiting for an image.",
        },
      },
      {
        id: "what-you-can-import",
        title: "What you can import",
        paras: [
          "Most common capture formats and sources work, as long as the layout is legible in the image.",
        ],
        list: [
          "Desktop website screenshots",
          "Mobile screenshots, from a device or an emulator",
          "Full-page captures",
          "Cropped sections of an interface",
          "Slides and pages exported from a PDF",
        ],
      },
      {
        id: "getting-a-good-result",
        title: "Getting a good result",
        paras: [
          "The parser only has what is in the image, so the quality of the capture sets the ceiling on the quality of the import.",
        ],
        list: [
          "Capture at the highest resolution you can",
          "Take the page in a clean state — no cookie banners, tooltips or open menus",
          "Crop out the browser chrome so the layout starts at the page edge",
          "Import one screen at a time rather than a stitched collage",
        ],
        figure: {
          src: screenshotImport2,
          caption:
            "A capture loaded and ready, with the import options below it.",
        },
      },
      {
        id: "settings-that-matter-here",
        title: "Settings that matter here",
        paras: [
          "Screenshot imports have no CSS to read, so two options do more work than usual. Site palette is inferred from the image itself and is often the more useful choice; and because there is no markup, semantic text placeholders tend to read more cleanly than attempted real copy.",
          "Everything else behaves exactly as it does for a URL import.",
        ],
        note: "Layout mode still applies. Auto layout is inferred from visual alignment, so a well-aligned capture produces markedly better frames.",
        figure: {
          src: fontSettings1,
          caption: "Font handling for an import with no markup to read.",
        },
      },
      {
        id: "limits",
        title: "Limits",
        paras: [
          "Because the import works from a static image, some things are genuinely unavailable to it.",
        ],
        list: [
          "Very small or low-contrast text may be grouped rather than transcribed",
          "Overlapping or visually ambiguous sections can merge",
          "Heavy blurs, gradients and shadows can obscure block edges",
          "Hover and interactive states are not in the picture, so they are not in the import",
        ],
        note: "If a URL is available, web import will always give a more structured result. Reach for screenshots when it is not.",
      },
      {
        id: "next",
        title: "Next",
        paras: [
          "Area capture, from the browser extension, is the middle ground: it works on the live page like web import, but takes only the region you draw.",
        ],
        figure: {
          src: areaSelection1,
          caption: "Area capture, taking a single region from a live page.",
        },
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
