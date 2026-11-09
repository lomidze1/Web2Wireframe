/**
 * Keyword landing pages.
 *
 * Nobody searches "web2wireframe" — they search "html to figma" or
 * "convert website to figma". These four pages answer those queries directly,
 * one per import method, so each has genuinely different content. Four pages
 * saying the same thing in different words would read as doorway pages to
 * Google and get dropped from the index, so the split is by method, not by
 * synonym: HTML paste, live URL, browser extension, and the plugin itself.
 *
 * Pure data — no React imports. `src/seo/config.ts` reads the `faq` arrays
 * from here to build FAQPage structured data, so the page copy and the
 * schema can never drift apart.
 */

export interface LandingFaq {
  question: string;
  answer: string;
}

export interface LandingStep {
  n: string;
  title: string;
  body: string;
}

export interface LandingPoint {
  title: string;
  body: string;
}

export interface LandingRelated {
  to: string;
  label: string;
  note: string;
}

export interface LandingContent {
  /** Route path — also the key used by seoConfig and staticRoutes. */
  slug: string;
  kicker: string;
  h1: string;
  lead: string;
  /** <title> and <meta description> — kept beside the copy they summarise. */
  seoTitle: string;
  seoDescription: string;
  /** Breadcrumb label for the schema trail. */
  breadcrumb: string;
  /**
   * Which install the hero pushes. Defaults to the Figma plugin; the browser
   * extension page leads with Chrome, because that is the thing that page is
   * about — sending someone to Figma Community from it would be a dead end.
   */
  ctaPrimary?: "figma" | "chrome";
  intro: { title: string; body: string[] };
  points: LandingPoint[];
  stepsTitle: string;
  steps: LandingStep[];
  limits: { title: string; body: string; list: string[]; note: string };
  faq: LandingFaq[];
  related: LandingRelated[];
}

const HTML_TO_FIGMA: LandingContent = {
  slug: "/html-to-figma",
  kicker: "HTML import",
  h1: "HTML to Figma, without rebuilding the page by hand.",
  lead: "Paste the markup and the styles. The plugin reads them as a document — sections, rows, columns, the flex and grid rules holding them together — and lands the result in Figma as named, nested, editable frames.",
  seoTitle: "HTML to Figma — Import HTML and CSS as Editable Layers",
  seoDescription:
    "Paste HTML and CSS into Figma and get editable frames, real text layers and auto layout — not a flat image. Works for local builds, components and pages behind a login. Free.",
  breadcrumb: "HTML to Figma",
  intro: {
    title: "When you already have the code",
    body: [
      "A URL is the shortest route to a wireframe, but it needs a page that is publicly reachable. A great deal of the work worth importing isn't: a branch running on localhost, a component lifted out of a repository, an email template, a page sitting behind a VPN or a login.",
      "In all of those cases the markup is already in your hands. Paste it instead of pointing at it, and the import behaves exactly as it would for a live page.",
    ],
  },
  points: [
    {
      title: "Structure, not a screenshot",
      body: "The parser reads your markup as a document rather than a picture of one. What arrives in Figma is a layer tree that matches the block structure you wrote, with copy sitting in real text layers.",
    },
    {
      title: "Auto layout from your own flex and grid",
      body: "Where the CSS uses flexbox or grid, the import turns it into Figma auto layout with matching direction, gap and alignment. Where it doesn't map cleanly, the frame is positioned absolutely rather than guessed at.",
    },
    {
      title: "Fonts and colours read from the CSS",
      body: "Declared families, weights and colour values come across with the structure. Keep them as direct values, or have the import generate Figma variables so the file is ready to re-theme.",
    },
    {
      title: "Configured before, not cleaned up after",
      body: "The same settings panel applies: viewport widths, placeholder copy or the real words, grey boxes or real images. Set it once and every paste after this one starts there.",
    },
  ],
  stepsTitle: "Paste to frames, in five steps.",
  steps: [
    {
      n: "01",
      title: "Copy the markup",
      body: "Take the HTML for the page or the component. Bring the CSS with it — a style block, or the stylesheet pasted alongside — because the structure without the styles is structure without spacing or type.",
    },
    {
      n: "02",
      title: "Open the plugin in your Figma file",
      body: "W2W runs inside the file you already have open, so the import lands next to the frames it is meant to sit beside. Nothing is exported or round-tripped through another tool.",
    },
    {
      n: "03",
      title: "Paste into the HTML tab",
      body: "Drop the markup into the source field. Nothing is fetched — the plugin works from exactly what you pasted and nothing else.",
    },
    {
      n: "04",
      title: "Set the options",
      body: "Layout mode, text handling, assets, variables. This is the step people skip and the step that decides how much tidying you do afterwards.",
    },
    {
      n: "05",
      title: "Import",
      body: "Frames arrive named and nested, text is real text, auto layout is already applied wherever the markup allowed it. Rename nothing; start designing.",
    },
  ],
  limits: {
    title: "What HTML import can't do",
    body: "It reads what you paste and nothing else, which has three consequences worth knowing before you start.",
    list: [
      "JavaScript does not run, so anything a script builds at load time will not be there — for a client-rendered page, copy the rendered DOM out of your browser's developer tools rather than the source template",
      "Styles living in a file the paste doesn't include are invisible to it",
      "Fonts hosted somewhere the import can't reach fall back to the nearest available match",
    ],
    note: "If the page is live and public, web import is the shorter road.",
  },
  faq: [
    {
      question: "Can I import HTML into Figma without a plugin?",
      answer:
        "No. Figma has no built-in HTML importer, so converting markup into Figma layers means running it through a plugin. Web2Wireframe parses the HTML and CSS and builds the equivalent frames, text layers and auto layout inside the file you have open.",
    },
    {
      question: "Does it need the CSS as well as the HTML?",
      answer:
        "It works without it, but you get unstyled structure. Include the CSS — inline in a style block, or pasted alongside the markup — and the spacing, typography and colour come across too.",
    },
    {
      question: "Will the result be editable, or one flat image?",
      answer:
        "Editable. Text lands in text layers, sections in frames, and flex and grid structures as Figma auto layout. Nothing is rasterised except the images themselves.",
    },
    {
      question: "Can I import a page that sits behind a login?",
      answer:
        "Yes, and it is the main reason to choose HTML import over a URL. Open the page while you are logged in, copy the rendered markup from your browser's developer tools, and paste that.",
    },
    {
      question: "How much does HTML import cost?",
      answer:
        "Nothing. Web2Wireframe is free, with every setting unlocked.",
    },
  ],
  related: [
    {
      to: "/website-to-figma",
      label: "Website to Figma",
      note: "When the page is public, hand over the URL instead of the markup.",
    },
    {
      to: "/figma-browser-extension",
      label: "Browser extension",
      note: "Capture a live page — or one section of it — without touching code.",
    },
    {
      to: "/figma-wireframe-plugin",
      label: "The wireframe plugin",
      note: "What every option in the settings panel actually changes.",
    },
  ],
};

const WEBSITE_TO_FIGMA: LandingContent = {
  slug: "/website-to-figma",
  kicker: "URL import",
  h1: "Convert a website into an editable Figma file.",
  lead: "Paste a URL. The page comes back as named, nested Figma frames — real text, real colours, auto layout where the site used flexbox or grid — at every viewport width you asked for, in a single run.",
  seoTitle: "Website to Figma — Convert Any URL Into Editable Frames",
  seoDescription:
    "Paste a website URL and get editable Figma frames with real text, auto layout and your chosen viewports — desktop, tablet and mobile in one import. Free.",
  breadcrumb: "Website to Figma",
  intro: {
    title: "One paste, every width you design for",
    body: [
      "Most importers give you one output at one size and leave you to run the whole thing again for mobile. Choosing 1440, 768 and 375 up front costs the same single import and lands all three side by side on the canvas.",
      "The responsive story is visible before you have made a single decision about it, which is the point at which it is still cheap to change your mind.",
    ],
  },
  points: [
    {
      title: "Structure before pixels",
      body: "The parser looks for sections, rows, columns and repeated blocks before it looks at colour. What arrives is a layout you can rearrange, not a picture you can only crop.",
    },
    {
      title: "Auto layout inferred from the real CSS",
      body: "Flex and grid containers become Figma auto layout with matching direction, gap and alignment. Where the source doesn't map cleanly the frame falls back to absolute positioning, rather than to a confident wrong guess.",
    },
    {
      title: "The site's own fonts and colours",
      body: "Web fonts are matched against what Figma has, with the option to pull down the site's actual font files. Colours land as direct values, or as generated Figma variables if the file is headed for a library.",
    },
    {
      title: "Decide the output before it exists",
      body: "Placeholder copy or the site's own words. Grey boxes or the real images. Structural wireframe or full fidelity. Set once, remembered for every import after.",
    },
  ],
  stepsTitle: "URL to canvas, in five steps.",
  steps: [
    {
      n: "01",
      title: "Copy the address",
      body: "Any public page. A deep link to one template is usually more useful than a homepage — that is the layout you are going to be working on.",
    },
    {
      n: "02",
      title: "Open the plugin in your Figma file",
      body: "The import lands in the file you already have open, beside whatever you are comparing it against.",
    },
    {
      n: "03",
      title: "Paste the URL",
      body: "Drop it into the source field and stop before pressing Import. The next step is the one that matters.",
    },
    {
      n: "04",
      title: "Pick your viewports and options",
      body: "Add every width you intend to design for — they run together in one pass. Then choose layout mode, text handling and assets.",
    },
    {
      n: "05",
      title: "Import",
      body: "Frames arrive named and nested, one set per viewport, already laid out on the canvas.",
    },
  ],
  limits: {
    title: "When a URL isn't enough",
    body: "Some pages can't be fetched from a plain address, and it is better to know which before you try.",
    list: [
      "Anything behind a login or a paywall — nothing at that URL is visible without your session",
      "Sites running an aggressive bot challenge — the plugin says so and offers to hand the job to the browser extension, which captures from a tab you are already signed into",
      "Content that only appears after a scroll-triggered script has run",
    ],
    note: "For those three, the browser extension is the route in.",
  },
  faq: [
    {
      question: "How do I import a website into Figma?",
      answer:
        "Install a plugin that can read a live page, open it inside a Figma file, paste the site's URL, choose your viewport widths and layout options, and import. With Web2Wireframe the page arrives as editable frames and text layers rather than an image.",
    },
    {
      question: "Does Figma have a built-in website importer?",
      answer:
        "No. Figma cannot fetch a URL on its own, so converting a live site into Figma layers requires a plugin.",
    },
    {
      question: "Will the imported file use auto layout?",
      answer:
        "Where the source page used flexbox or CSS grid, yes — those become Figma auto layout frames with the same direction, gap and alignment. Anything that doesn't map cleanly is positioned absolutely so that nothing is invented.",
    },
    {
      question: "Can I import mobile and desktop in one go?",
      answer:
        "Yes. Select every viewport width you want in the settings panel and a single import produces all of them, side by side on the canvas.",
    },
    {
      question: "Is the imported design editable?",
      answer:
        "Yes. Text is text, sections are frames, and images arrive as image fills or as placeholders depending on what you chose. Nothing is flattened into a single picture.",
    },
    {
      question: "Is website import free?",
      answer:
        "Yes. Web2Wireframe is free, with every option unlocked from the first import.",
    },
  ],
  related: [
    {
      to: "/html-to-figma",
      label: "HTML to Figma",
      note: "When you have the markup but the page isn't publicly reachable.",
    },
    {
      to: "/figma-browser-extension",
      label: "Browser extension",
      note: "For one section only, or a site that refuses a plain fetch.",
    },
    {
      to: "/figma-wireframe-plugin",
      label: "The wireframe plugin",
      note: "What every option in the settings panel actually changes.",
    },
  ],
};

const FIGMA_WIREFRAME_PLUGIN: LandingContent = {
  slug: "/figma-wireframe-plugin",
  kicker: "The plugin",
  h1: "A Figma wireframe plugin that asks before it imports.",
  lead: "Web2Wireframe turns a real page into a wireframe whose shape you chose — greyscale or full colour, placeholder copy or the site's own words, boxes or real images. Eight decisions before the import, instead of an evening of cleanup after it.",
  seoTitle: "Figma Wireframe Plugin — Turn Any Website Into a Wireframe",
  seoDescription:
    "A Figma plugin that converts a URL, HTML or a captured region into an editable wireframe — with fidelity, text, assets and auto layout decided before the import runs.",
  breadcrumb: "Figma wireframe plugin",
  intro: {
    title: "What 'wireframe' means here",
    body: [
      "A wireframe is not a lower-quality import. It is a deliberate one. Strip the photography and you can see the layout. Swap marketing copy for placeholders at the original character counts and you can see the hierarchy without reading the sales pitch. Drop the brand palette and structure is all that is left.",
      "That is exactly what you want when the question is whether the page works, rather than what colour the button is. Every one of those is a switch you throw, not a separate mode you are locked into.",
    ],
  },
  points: [
    {
      title: "Fidelity is a dial, not a mode",
      body: "The same import can land as a grey structural wireframe or as a full-colour copy of the page. You decide per import, and the plugin remembers the answer.",
    },
    {
      title: "Four ways in",
      body: "A live URL, raw HTML, or a region drawn on a page with the browser extension. Same parser, same settings panel, same kind of output.",
    },
    {
      title: "Auto layout on purpose",
      body: "Flex and grid become Figma auto layout so the frames respond when you edit them — or absolute positioning throughout, if what you actually want is a frozen snapshot.",
    },
    {
      title: "Set it once",
      body: "The settings footer has a Save button that writes your configuration as the default for every future import, in every file. Most people set it in their first week and never open the panel again.",
    },
  ],
  stepsTitle: "Installed to imported, in five steps.",
  steps: [
    {
      n: "01",
      title: "Install from Figma Community",
      body: "One click, no account to create. The browser extension is optional and only needed for area capture.",
    },
    {
      n: "02",
      title: "Open it inside a design file",
      body: "The plugin runs in the file you have open, which is where the import lands.",
    },
    {
      n: "03",
      title: "Hand it a page",
      body: "A URL, an image, pasted markup, or a region drawn with the extension. The choice depends on what you can reach, not on what you want out.",
    },
    {
      n: "04",
      title: "Configure the import",
      body: "Viewports, layout mode, text, assets, colours, fonts, variables. Every group maps to a job you would otherwise do by hand in Figma afterwards.",
    },
    {
      n: "05",
      title: "Import and keep working",
      body: "Named, nested frames with real text and auto layout already applied. Rename nothing.",
    },
  ],
  limits: {
    title: "What it is not",
    body: "It converts pages that exist. Two things follow from that.",
    list: [
      "It does not invent a page from a prompt or generate a concept from a description — there is no 'make me a landing page' step, so if you have nothing to point it at, it has nothing to do",
      "It imports a page as it was captured, which means hover states, animations and anything a script builds after the fact are not in a static capture and so are not in the file",
    ],
    note: "For the long version of every setting, see How it works.",
  },
  faq: [
    {
      question:
        "Is there a Figma plugin that converts a website into a wireframe?",
      answer:
        "Yes. Web2Wireframe runs inside Figma and converts a live URL, pasted HTML or a captured region into editable wireframe frames, with the fidelity — greyscale through to full colour — chosen before the import runs.",
    },
    {
      question:
        "What is the difference between a wireframe import and a full-fidelity one?",
      answer:
        "The same parse, different output settings. A wireframe swaps photography for placeholder boxes, replaces marketing copy with placeholder text at the original character counts, and mutes the palette, so what remains is structure. Full fidelity keeps all three.",
    },
    {
      question: "Do I need the browser extension?",
      answer:
        "Only for area capture — drawing a region on a live page — and for sites that block direct fetching. Everything else works from the plugin on its own.",
    },
    {
      question: "Does it work on Figma's free plan?",
      answer:
        "Yes. It is a Figma Community plugin and runs in any Figma file you are able to edit.",
    },
    {
      question: "What does the plugin cost?",
      answer:
        "Nothing. Web2Wireframe is free, with every setting unlocked from the first import.",
    },
  ],
  related: [
    {
      to: "/website-to-figma",
      label: "Website to Figma",
      note: "The URL route — the fastest one when the page is public.",
    },
    {
      to: "/html-to-figma",
      label: "HTML to Figma",
      note: "Paste the markup when you already have it.",
    },
    {
      to: "/figma-browser-extension",
      label: "Browser extension",
      note: "Draw a region on a live page and import only that.",
    },
  ],
};

const FIGMA_BROWSER_EXTENSION: LandingContent = {
  slug: "/figma-browser-extension",
  kicker: "Browser extension",
  h1: "Capture part of a live page, straight into Figma.",
  lead: "Draw a region on any page and import only that. Or hand the plugin a page a plain URL cannot reach — because the capture comes from the tab you are already signed into.",
  seoTitle: "Figma Browser Extension — Capture a Page Section Into Figma",
  seoDescription:
    "Draw a box around any part of a web page and import just that section into Figma — or capture pages a URL can't reach, from the tab you're already signed into. Free Chrome extension.",
  breadcrumb: "Browser extension",
  ctaPrimary: "chrome",
  intro: {
    title: "Two problems a URL can't solve",
    body: [
      "Pasting a URL works beautifully right up until it doesn't, and it fails in two specific ways — the two people hit most often.",
      "The first is scale: you wanted one pricing table and the importer handed you a forty-section marketing page. The second is access: the page needs your session, or the site turns away anything that doesn't look like a person in a browser. The extension answers both, because it captures from the tab you already have open.",
    ],
  },
  points: [
    {
      title: "One section, not the whole document",
      body: "Draw a box around a hero, a pricing table, a card grid or a dashboard panel, and only that region is parsed. Quicker to import, and far quicker to work with once it lands.",
    },
    {
      title: "Pages behind a login",
      body: "Anything past a sign-in, a paywall or a payment step is visible to the extension, because it reads the page you are already looking at with your session intact.",
    },
    {
      title: "Sites that turn importers away",
      body: "Some sites challenge any request that doesn't look like a person in a browser. From the extension that distinction disappears — the request is coming from your own browser, in your own tab.",
    },
    {
      title: "Handed straight to the plugin",
      body: "No file to save, no URL to carry across. The capture arrives in Web2Wireframe inside Figma, where the same settings panel and the same saved defaults apply.",
    },
  ],
  stepsTitle: "Live page to canvas, in five steps.",
  steps: [
    {
      n: "01",
      title: "Install the extension",
      body: "One click from the Chrome Web Store. It works beside the plugin rather than replacing it — the extension captures, the plugin builds the frames.",
    },
    {
      n: "02",
      title: "Open the page you want",
      body: "Sign in, dismiss the cookie banner, scroll to the part you care about. Whatever you can see is what can be captured.",
    },
    {
      n: "03",
      title: "Capture the page, or draw a region",
      body: "Take the whole document, or box off a single section. For component work the region is almost always the better answer.",
    },
    {
      n: "04",
      title: "Switch to Figma",
      body: "The capture is waiting in the plugin, in the file you already have open.",
    },
    {
      n: "05",
      title: "Set the options and import",
      body: "Layout mode, text, assets, variables — the same panel as a URL or HTML import, with whatever defaults you saved.",
    },
  ],
  limits: {
    title: "What the extension needs from you",
    body: "It reads the page as it stands in your browser, which sets a few expectations.",
    list: [
      "It works alongside the plugin, not instead of it — the capture happens in the browser, the frames are built in Figma",
      "Chrome and Chromium-based browsers (Edge, Brave, Arc); it is distributed through the Chrome Web Store",
      "Regions carrying heavy animation, video or an open overlay capture poorly — let the page settle first",
      "Box off one logical section per capture; a selection straddling two unrelated blocks produces a muddled frame",
    ],
    note: "If the page is public and you want all of it, plain URL import from inside the plugin is fewer steps.",
  },
  faq: [
    {
      question: "Is there a Figma browser extension for importing websites?",
      answer:
        "Yes. The Web2Wireframe extension is published on the Chrome Web Store and works together with the Figma plugin — you capture a page or a region in the browser, and the plugin turns it into editable Figma frames.",
    },
    {
      question: "Can I import just one section of a website into Figma?",
      answer:
        "Yes. Draw a box around the region you want — a hero, a pricing table, a card grid — and only that part is parsed. It is the fastest route when you are building a component library rather than copying a whole page.",
    },
    {
      question: "Can I import a page that needs a login?",
      answer:
        "Yes. The extension captures the page you are already looking at, with your session intact, so anything behind a sign-in, a paywall or a payment step is available to it.",
    },
    {
      question: "What about sites that block importers?",
      answer:
        "Some sites challenge any request that doesn't look like a person in a browser. Capturing from the extension sidesteps that, because the request comes from your own browser in your own tab.",
    },
    {
      question: "Do I need both the extension and the plugin?",
      answer:
        "For area capture, yes — the extension does the capturing and the plugin builds the Figma frames. If you only ever import public URLs or pasted HTML, the plugin on its own is enough.",
    },
    {
      question: "Which browsers does it work in?",
      answer:
        "Chrome and Chromium-based browsers such as Edge, Brave and Arc. It is distributed through the Chrome Web Store.",
    },
    {
      question: "Does the extension cost extra?",
      answer:
        "No. The extension is free, and so is the plugin.",
    },
  ],
  related: [
    {
      to: "/website-to-figma",
      label: "Website to Figma",
      note: "Fewer steps, when the page is public and you want all of it.",
    },
    {
      to: "/html-to-figma",
      label: "HTML to Figma",
      note: "If you can reach the markup, paste it instead of capturing it.",
    },
    {
      to: "/figma-wireframe-plugin",
      label: "The wireframe plugin",
      note: "What every option in the settings panel actually changes.",
    },
  ],
};

export const landingPages: LandingContent[] = [
  HTML_TO_FIGMA,
  WEBSITE_TO_FIGMA,
  FIGMA_WIREFRAME_PLUGIN,
  FIGMA_BROWSER_EXTENSION,
];

export const landingRoutes: string[] = landingPages.map((page) => page.slug);

export function getLandingContent(slug: string): LandingContent | undefined {
  return landingPages.find((page) => page.slug === slug);
}
