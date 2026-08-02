import type { DocsArticleMap } from "./docsTypes";
import urlImport1 from "../../../assets/how-it-work/card-details/url-import-1.png";
import urlImport2 from "../../../assets/how-it-work/card-details/url-import-2.png";
import htmlImport1 from "../../../assets/how-it-work/card-details/html-import-1.png";
import areaSelection1 from "../../../assets/how-it-work/card-details/area-selection-import-1.png";

/**
 * The twelve reference pages carried over from the previous docs build. The
 * prose is the same material Google already indexes — it has been reflowed
 * into the section model and brought in line with the plugin's vocabulary
 * (Semantic / Real copy / Site palette / Figma variables).
 */
export const legacyArticles: DocsArticleMap = {
  "introduction/what-is": {
    lead: "Web2Wireframe converts a website into a clean, structured, fully editable wireframe inside Figma.",
    readingTime: "3 min read",
    updated: "Updated 2 August 2026",
    sections: [
      {
        id: "overview",
        title: "Overview",
        paras: [
          "Web2Wireframe is a Figma plugin that converts websites into clean, structured wireframes in seconds. It combines multi-method import — URL, screenshot, HTML, area capture and the browser extension — with reusable wireframe libraries, so you can move from an existing website to an editable Figma layout faster and more consistently.",
        ],
      },
      {
        id: "what-problem-it-solves",
        title: "What problem it solves",
        paras: [
          "Creating wireframes from existing websites is slow and repetitive. Designers and product teams usually spend hours rebuilding layouts by hand just to understand structure, hierarchy and content flow. Web2Wireframe removes that friction by converting the page automatically. Instead of starting from a blank canvas, you get an organised layout that reflects the real page structure and can be edited, refined or redesigned immediately.",
          "That makes it especially useful in a handful of recurring situations.",
        ],
        list: [
          "Starting a redesign or a UX audit",
          "Exploring ideas based on real products or competitors",
          "Working under a tight deadline",
          "Collaborating with teams that need clear, structural layouts",
        ],
      },
      {
        id: "how-web2wireframe-works",
        title: "How Web2Wireframe works",
        paras: [
          "Web2Wireframe reads the structure of a website rather than its visual design. It detects layout, hierarchy and content blocks, then converts them into clean wireframe elements inside Figma.",
          "You choose an import method, adjust the settings if you want to, and start the import. The plugin organises sections, components and spacing, producing a wireframe that reflects the original page while remaining fully editable — a structured starting point you can iterate on rather than rebuild.",
        ],
      },
      {
        id: "what-you-get-in-figma",
        title: "What you get in Figma",
        paras: [
          "When the import finishes, Web2Wireframe places a structured wireframe directly on your Figma canvas. Elements are organised into logical sections, so the layout is easy to read, navigate and modify.",
          "Every wireframe is fully editable. You can adjust spacing, rearrange components, replace content or apply your own design system without limits. The structure is designed to support iteration, not to lock you into a fixed layout.",
          "Wireframe libraries are integrated as well, so common components can be reused and kept consistent across pages and projects as you continue working.",
        ],
      },
    ],
  },

  "introduction/why-web2wireframe": {
    lead: "Why start from a real page instead of a blank canvas — and who this is built for.",
    readingTime: "4 min read",
    updated: "Updated 2 August 2026",
    sections: [
      {
        id: "why-use-web2wireframe",
        title: "Why use Web2Wireframe",
        paras: [
          "Web2Wireframe removes friction from the early stages of design and product work. Instead of rebuilding layouts from scratch, it gives you a structured starting point based on a real website. By combining multi-method import with reusable wireframe libraries, it helps you move faster, stay consistent, and spend your attention on UX decisions rather than repetitive setup.",
        ],
      },
      {
        id: "key-benefits",
        title: "Key benefits",
        paras: [
          "The first benefit is speed. Web2Wireframe eliminates repetitive setup work, so you move from idea to iteration much faster — which matters most during redesigns, audits and early exploration.",
          "The second is consistency. Built-in wireframe libraries and reusable components keep structure consistent across pages and projects, which makes collaboration easier and gives teams a shared structural language.",
          "The third is control. Because every generated wireframe is fully editable in Figma, you can refine layouts, adjust spacing, replace content or apply your own design system without limits. The plugin supports your workflow; it does not lock you into its results.",
        ],
      },
      {
        id: "when-it-s-the-right-tool",
        title: "When it's the right tool",
        paras: [
          "Web2Wireframe is most useful when you need to understand or reuse the structure of an existing website quickly. It works best in the early stages of a project, when clarity and speed matter more than visual detail.",
        ],
        list: [
          "Website redesigns and UX improvements",
          "Competitor or inspiration analysis",
          "Rapid prototyping and concept validation",
          "Client projects with tight deadlines",
          "Team collaboration where structure needs to be clear",
        ],
        note: "It is not meant to replace creative design work — it shortens the path to the decisions that are worth your time.",
      },
      {
        id: "who-it-s-built-for",
        title: "Who it's built for",
        paras: [
          "For UI and UX designers, it is a fast way to move from an existing website to editable wireframes, making it easier to explore layouts and test ideas without rebuilding everything by hand.",
          "For product designers and product teams, it offers a shared structural foundation that aligns decisions early. Generated wireframes make discussions clearer and reduce ambiguity during planning.",
          "For frontend developers, it is a way to understand layout structure and content hierarchy before implementation, especially when working closely with design.",
          "For freelancers and agencies, it speeds up early project phases, so you can respond to client requests faster and present structured concepts without spending the day on setup.",
        ],
      },
    ],
  },

  "start/how-to-install": {
    lead: "Install the plugin from the Figma Community and run it from any file — no setup, no configuration.",
    readingTime: "3 min read",
    updated: "Updated 2 August 2026",
    sections: [
      {
        id: "installation-overview",
        title: "Installation overview",
        paras: [
          "Installing Web2Wireframe takes a few clicks. The plugin is distributed through the Figma Community and is added to your Figma account from there.",
          "Once installed, it is available inside Figma itself: launch it from the Plugins menu and start working. No additional setup, configuration or technical steps are required before your first import.",
        ],
      },
      {
        id: "install-from-figma-community",
        title: "Install from Figma Community",
        paras: [
          "Installing from the Community means you always run the official version of the plugin and receive updates automatically.",
          "Open the Web2Wireframe page in the Figma Community and press Install. The plugin is added to your Figma account and becomes available immediately — there is nothing else to configure.",
        ],
      },
      {
        id: "where-to-find-the-plugin",
        title: "Where to find the plugin",
        paras: [
          "After installing, the plugin is available in any Figma file, whether you are starting a new project or working on an existing one.",
          "Open Resources → Plugins in Figma and search for Web2Wireframe. From there you can run it straight away or save it for quick access later. If it does not appear immediately, refreshing Figma or reopening the file resolves it.",
        ],
      },
      {
        id: "running-web2wireframe",
        title: "Running Web2Wireframe",
        paras: [
          "From the Plugins list, click Run to open the plugin. It opens in its own panel, where you choose an import method and adjust the settings before importing.",
          "You can run Web2Wireframe as many times as you need within the same file or across different projects. If it does not open immediately, re-running it — or restarting Figma — resolves it.",
        ],
      },
    ],
  },

  "start/getting-started": {
    lead: "What the plugin window shows when it opens, and the shape of the workflow that follows.",
    readingTime: "3 min read",
    updated: "Updated 2 August 2026",
    sections: [
      {
        id: "what-happens-when-you-open-the-plugin",
        title: "What happens when you open the plugin",
        paras: [
          "When you open Web2Wireframe, the plugin launches into its main workspace inside Figma. This is where every import and library action begins.",
          "Nothing is generated automatically at this stage. The plugin waits for you to decide how to start — by choosing an import method: URL, screenshot, HTML, area capture or the browser extension. You stay in control from the beginning.",
        ],
      },
      {
        id: "main-interface-overview",
        title: "Main interface overview",
        paras: [
          "The main interface is deliberately minimal: it surfaces the important actions without burying you in options.",
        ],
        list: [
          "Choose an import method",
          "Open your library",
          "Adjust the settings before starting",
        ],
      },
      {
        id: "basic-workflow",
        title: "Basic workflow",
        paras: [
          "The workflow follows a clear, repeatable pattern, and it is designed for iteration — repeat it as often as you like, re-import, or switch methods as your ideas develop.",
        ],
        list: [
          "Open the plugin inside your Figma file",
          "Choose an import method",
          "Adjust the settings if needed",
          "Run the import",
          "Edit and reuse the result",
        ],
        note: "Step three is the one people skip and the one that changes the result most — see Set your settings.",
      },
    ],
  },

  "import-methods/web-import": {
    lead: "Generate a wireframe from a live website by handing the plugin its URL. The fastest route when the page is public.",
    readingTime: "5 min read",
    updated: "Updated 2 August 2026",
    sections: [
      {
        id: "what-is-web-import",
        title: "What is web import",
        paras: [
          "Web import generates a wireframe from a live website: you provide the URL, and the plugin analyses the page's structure and hierarchy, then converts it into an editable wireframe directly in Figma.",
          "It is the right method when you want to work from real, up-to-date layouts without recreating sections by hand. Web import concentrates on structure and layout, giving you a clean base to refine, redesign and iterate on.",
        ],
        figure: {
          src: urlImport1,
          caption: "The plugin window with a URL in the source field.",
        },
      },
      {
        id: "when-to-use-it",
        title: "When to use it",
        paras: [
          "Use web import when your source is a real website reachable at a URL and you want a fast structural starting point. If you only need one part of a page, area capture is the better fit.",
        ],
        list: [
          "Redesigns and UX improvements based on an existing site",
          "Competitor or inspiration analysis",
          "Quickly mapping layout structure across several pages",
          "Preparing wireframes for product discussions and team alignment",
        ],
      },
      {
        id: "what-gets-imported",
        title: "What gets imported",
        paras: [
          "Web import produces a wireframe representation of the page's layout and content blocks. The output is structured and editable rather than pixel-perfect: page sections and hierarchy, layout structure and spacing, and elements grouped logically in Figma layers.",
          "Once it lands you can rearrange sections, adjust spacing, replace text and placeholders, or apply your own design system styles. For more control over the output, see Set your settings.",
        ],
        figure: {
          src: urlImport2,
          caption: "The import running, with the chosen options applied.",
        },
      },
      {
        id: "common-use-cases",
        title: "Common use cases",
        paras: [
          "Redesign planning: generate a structural wireframe to understand what exists today, then iterate into a new layout.",
          "UX audit: use the generated structure to identify layout issues, content hierarchy problems and missing sections.",
          "Competitor breakdown: import competitor pages to analyse patterns and build better page architecture for your own product.",
          "Team collaboration: start from a shared structural baseline in Figma so product, design and development align faster.",
        ],
      },
      {
        id: "best-practices",
        title: "Best practices",
        paras: [
          "A few habits produce noticeably cleaner results.",
        ],
        list: [
          "Start with a page that is publicly accessible, with no login required",
          "Use the most stable URL version — avoid pages whose content changes on every load",
          "Import one page first, then refine the settings before importing several",
          "If the page is very long, import the key pages first and expand later",
        ],
      },
      {
        id: "notes-and-limitations",
        title: "Notes and limitations",
        paras: [
          "Web import depends on the structure it can read from the website, so some pages produce less clean results — when content is highly dynamic or loads after the initial render, when critical sections require a login, or when layouts are heavily script-driven and change per session.",
          "If web import is not giving you the structure you expect, screenshot import, HTML import and area capture each approach the same page differently.",
        ],
      },
      {
        id: "next-step",
        title: "Next step",
        paras: [
          "Continue to screenshot import to learn how to generate wireframes from a static image.",
        ],
      },
    ],
  },

  "import-methods/html-import": {
    lead: "Generate a wireframe from raw markup when you already have the HTML and want structure without a rendered page.",
    readingTime: "4 min read",
    updated: "Updated 2 August 2026",
    sections: [
      {
        id: "what-is-html-import",
        title: "What is HTML import",
        paras: [
          "HTML import generates wireframes directly from markup instead of a live website or a screenshot. It is designed for the case where you already have the HTML and want to convert its structure without relying on a rendered page.",
          "Because it reads the document itself, the plugin concentrates purely on structure, layout hierarchy and content organisation — which makes it a good fit for technical workflows where clean structure matters more than visual appearance.",
        ],
        figure: {
          src: htmlImport1,
          caption: "The HTML tab, ready for pasted markup.",
        },
      },
      {
        id: "supported-html-content",
        title: "Supported HTML content",
        paras: [
          "A wide range of HTML works, as long as the structure is clear and well-formed.",
        ],
        list: [
          "Static HTML files",
          "HTML copied from an existing project",
          "Simplified markup without heavy runtime dependencies",
          "Semantic HTML with clear sectioning",
        ],
        note: "Markup that represents the layout structure produces better wireframes than fully styled presentational output.",
      },
      {
        id: "how-structure-is-detected",
        title: "How structure is detected",
        paras: [
          "With HTML import the plugin analyses the document rather than rendered visuals. It looks for semantic elements, container hierarchy and content grouping to build the layout — page sections and containers, the nesting of elements, and logical content blocks.",
          "Those elements are then organised into readable, editable wireframe sections inside Figma. The goal is to preserve layout intent while keeping the result flexible.",
        ],
      },
      {
        id: "limitations",
        title: "Limitations",
        paras: [
          "HTML import works best with clean, predictable markup. Limitations show up when the structure is complex or depends on runtime behaviour.",
        ],
        list: [
          "HTML that relies on JavaScript to lay itself out",
          "Heavily component-based frameworks with no static output",
          "Inline styles or scripts that alter structure dynamically",
          "Incomplete or malformed markup",
        ],
      },
      {
        id: "best-practices",
        title: "Best practices",
        paras: [
          "A little preparation goes a long way with pasted markup.",
        ],
        list: [
          "Use semantic tags where possible — header, section, article, footer",
          "Remove unnecessary scripts and inline styling before importing",
          "Focus on the containers that define layout rather than visual detail",
          "Import one page or section at a time",
        ],
      },
      {
        id: "next-step",
        title: "Next step",
        paras: [
          "Continue to area capture to learn how to generate a wireframe from a selected part of a page.",
        ],
      },
    ],
  },

  "import-methods/area-capture": {
    lead: "Import one section of a page instead of the whole document — the precise option for modular work.",
    readingTime: "4 min read",
    updated: "Updated 2 August 2026",
    sections: [
      {
        id: "what-is-area-capture",
        title: "What is area capture",
        paras: [
          "Area capture generates a wireframe from a specific part of a webpage rather than the entire page. It is built for focused work on individual sections — heroes, feature blocks, pricing tables, dashboards.",
          "Because the plugin analyses only the selected region, you get precision and control when the whole page is more than you need.",
        ],
        figure: {
          src: areaSelection1,
          caption: "Area capture, taking a single region from a live page.",
        },
      },
      {
        id: "selecting-an-area",
        title: "Selecting an area",
        paras: [
          "You define the part of the page you want to convert by marking the region before starting the import. The more focused the selection, the cleaner and more accurate the resulting wireframe.",
        ],
        list: [
          "Focus on a single logical section",
          "Avoid overlapping unrelated blocks",
          "Make sure the selected area has clear layout boundaries",
        ],
      },
      {
        id: "what-gets-generated",
        title: "What gets generated",
        paras: [
          "The result is a wireframe of the selected area alone — structured and fully editable, exactly like the other import methods: clear section structure, grouped and organised Figma layers, and editable blocks you can rearrange or reuse.",
          "That makes area capture especially useful for building modular layouts and reusable components without importing content you do not need.",
        ],
      },
      {
        id: "when-area-capture-works-best",
        title: "When area capture works best",
        paras: [
          "It is most effective when you want a specific part of a page rather than the full layout. If you need the complete page structure instead, web import or screenshot import are the better choice.",
        ],
        list: [
          "Importing hero sections or landing page blocks",
          "Reusing design patterns from existing websites",
          "Extracting components for wireframe libraries",
          "Iterating on a single section during a redesign",
          "Working with long or complex pages where a full import is unnecessary",
        ],
      },
      {
        id: "best-practices",
        title: "Best practices",
        paras: [
          "Area capture is most powerful as part of a modular workflow.",
        ],
        list: [
          "Select one section at a time",
          "Avoid areas with heavy animation or overlays",
          "Use it early to build reusable blocks",
          "Combine it with wireframe libraries for consistency",
        ],
      },
      {
        id: "next-step",
        title: "Next step",
        paras: [
          "You have now seen all four import methods. Continue to the browser extension to learn how to capture content directly from your browser.",
        ],
      },
    ],
  },

  "browser-extension/extension-overview": {
    lead: "Capture content straight from your browser and send it to the plugin, without copying URLs or saving screenshots.",
    readingTime: "3 min read",
    updated: "Updated 2 August 2026",
    sections: [
      {
        id: "what-the-extension-does",
        title: "What the extension does",
        paras: [
          "The browser extension captures website content directly from your browser and sends it to Web2Wireframe in Figma. Instead of copying URLs or saving screenshots by hand, you select content on a live page and start the import from there.",
          "It is built to work with the plugin rather than beside it, so you move from browsing the web to a structured wireframe without breaking your workflow.",
        ],
      },
      {
        id: "when-to-use-the-extension",
        title: "When to use the extension",
        paras: [
          "The extension earns its place when you are working quickly on live websites — it removes the friction between finding something and turning it into a wireframe.",
        ],
        list: [
          "You want to capture content directly from a live page",
          "You need a specific section without importing the full page",
          "You are researching competitors or gathering inspiration",
          "You would rather not download screenshots or copy URLs by hand",
        ],
        note: "If you already have a URL or an image, web import and screenshot import cover the same ground from inside the plugin.",
      },
      {
        id: "how-it-works-with-web2wireframe",
        title: "How it works with Web2Wireframe",
        paras: [
          "The extension is a bridge between the web and Figma. Once activated it captures the selected content and hands it to the plugin, where the import itself happens.",
        ],
        list: [
          "Open the extension on a webpage",
          "Select or capture the content you want",
          "Send the data to Web2Wireframe",
          "Run the import inside Figma",
        ],
      },
      {
        id: "notes-and-recommendations",
        title: "Notes and recommendations",
        paras: [
          "The extension works best on pages with clear structure and visible layout boundaries. Highly dynamic pages or heavy animation may need refinement after the import.",
        ],
        list: [
          "Capture one section at a time",
          "Avoid selecting overlapping elements",
          "Combine extension imports with wireframe libraries for consistency",
        ],
      },
      {
        id: "next-step",
        title: "Next step",
        paras: [
          "Continue to importing with the extension to see how to start a capture in the browser and pick up the result in Figma.",
        ],
      },
    ],
  },

  "browser-extension/import-with-extension": {
    lead: "The full flow: open the extension on a page, select a region, and collect the wireframe in Figma.",
    readingTime: "3 min read",
    updated: "Updated 2 August 2026",
    sections: [
      {
        id: "starting-an-import-from-the-extension",
        title: "Starting an import from the extension",
        paras: [
          "Open any website in your browser and activate the Web2Wireframe extension. From there you can begin capturing content directly from the page you are viewing.",
          "You then decide whether to capture a full section or focus on a specific area. This step is deliberately fast, so you can move from browsing to importing without interrupting your work.",
        ],
      },
      {
        id: "capturing-content",
        title: "Capturing content",
        paras: [
          "Once the capture starts, select the content you want. The extension highlights selectable areas on the page so you can focus on meaningful layout sections. The goal here is to define what should become a wireframe, not to capture visual styling.",
        ],
        list: [
          "Select one clear section at a time",
          "Avoid overlapping unrelated elements",
          "Focus on visible layout boundaries",
        ],
      },
      {
        id: "sending-data-to-figma",
        title: "Sending data to Figma",
        paras: [
          "With the content selected, send it to Web2Wireframe in Figma. The extension transfers the captured data and hands the import to the plugin.",
          "There is no file handling to do — the data flows from the browser to Figma on its own. If Figma is not already open, you may be prompted to switch to it to finish the import.",
        ],
      },
      {
        id: "result-in-figma",
        title: "Result in Figma",
        paras: [
          "Once the data arrives, the plugin builds a wireframe on your Figma canvas: a structured, editable layout representing the captured content.",
          "From there you can rearrange sections, adjust spacing and structure, combine the result with existing wireframes, or reuse the generated blocks in other projects. What the extension produces follows the same principles as every other import method — clean structure, full editability, room to iterate.",
        ],
      },
      {
        id: "next-step",
        title: "Next step",
        paras: [
          "That completes the extension workflow. Return to Getting started, or try one of the other import methods.",
        ],
      },
    ],
  },

  "pricing/overview": {
    lead: "Ten imports a month on the free plan, every option unlocked. Pro removes the count.",
    readingTime: "3 min read",
    updated: "Updated 2 August 2026",
    sections: [
      {
        id: "what-is-included-in-pro",
        title: "What is included in Pro",
        paras: [
          "Web2Wireframe has free and paid functionality. Pro is for people who use the product regularly and need scale rather than a different feature set.",
        ],
        list: [
          "Unlimited URL, screenshot, HTML and browser-extension imports",
          "Full styling — colours, fonts and all viewports",
          "Real copy, hover state capture and real assets",
          "Font binary download, as a ZIP with auto-install",
          "Priority email support",
        ],
        note: "Pro is about productivity and scale, not about withholding core functionality — the settings panel works fully on the free plan.",
      },
      {
        id: "available-plan-types",
        title: "Available plan types",
        paras: [
          "The plan structure is deliberately simple: two tiers, both running the same engine with the same settings.",
        ],
        list: [
          "Free — 10 imports per month, for exploration and occasional use",
          "Pro — $16 for 30 days of unlimited imports and full features, as a one-time payment with no auto-renewal",
        ],
      },
      {
        id: "why-the-paid-plan-exists",
        title: "Why the paid plan exists",
        paras: [
          "Pro funds the ongoing development and maintenance of the plugin. Multi-viewport capture, hover state extraction and font handling all need infrastructure and continuous work.",
          "That revenue is what allows performance and stability to improve, new capabilities to arrive, and the core features to stay accessible on the free plan.",
        ],
      },
      {
        id: "comparison-between-free-and-pro",
        title: "Comparison between free and Pro",
        paras: [
          "The free plan is enough to understand how Web2Wireframe works and to run its core workflows end to end. Pro extends the same capabilities for people who import frequently.",
          "In general: free suits learning and light usage; Pro suits production workflows and repeated use.",
        ],
      },
      {
        id: "which-plan-fits-different-needs",
        title: "Which plan fits different needs",
        paras: [
          "The right plan depends on how often you import, not on which features you need.",
        ],
        list: [
          "Choose Free if you are exploring the product or running fewer than ten imports a month",
          "Choose Pro if you import frequently and want the monthly count out of the way",
          "Upgrade when Web2Wireframe becomes part of your regular workflow",
        ],
      },
      {
        id: "next-step",
        title: "Next step",
        paras: [
          "Continue to Purchase & access to see how buying and renewing Pro works.",
        ],
      },
    ],
  },

  "pricing/purchase": {
    lead: "Pro is a one-time purchase: $16 for 30 days, no subscription and nothing to cancel.",
    readingTime: "3 min read",
    updated: "Updated 2 August 2026",
    sections: [
      {
        id: "how-the-one-time-purchase-model-works",
        title: "How the one-time purchase model works",
        paras: [
          "Web2Wireframe Pro is a one-time purchase. A single $16 payment unlocks 30 days of Pro access — there is no recurring subscription and you are never charged automatically.",
          "For those 30 days you can use every Pro feature without interruption. When the period ends, your account returns to the free tier unless you choose to buy again.",
          "The result is predictable: you always know exactly when and how much you will be charged, because nothing happens unless you start a purchase yourself.",
        ],
      },
      {
        id: "step-by-step-purchase-process",
        title: "Step-by-step purchase process",
        paras: [
          "Buying Pro is designed to take as few steps as possible, and access is updated the moment the payment completes.",
        ],
        list: [
          "Open the Plan modal in the plugin and choose Pro",
          "Start the purchase",
          "Complete the checkout steps on the payment page",
          "Return to the plugin — Pro features are available immediately",
        ],
      },
      {
        id: "renewing-your-access",
        title: "Renewing your access",
        paras: [
          "Because Pro does not auto-renew, there is nothing to cancel — access simply ends when the 30 days are up. To keep Pro, you make another one-time purchase.",
          "You stay in control of your usage and your costs: you are only ever charged when you choose to buy.",
        ],
        list: [
          "Renew at any time from the Plan modal in the plugin, or from the link in your expiry reminder email",
          "Renewing early stacks the new days onto your remaining time — no days are lost",
          "We email a reminder a few days before your access is due to expire",
        ],
      },
      {
        id: "next-step",
        title: "Next step",
        paras: [
          "Continue to Additional information for general pricing details, future payment options and related topics.",
        ],
      },
    ],
  },

  "pricing/additional": {
    lead: "General pricing notes: how plans may change, what happens at expiry, and where to check your status.",
    readingTime: "2 min read",
    updated: "Updated 2 August 2026",
    sections: [
      {
        id: "general-information-about-pricing-and-plans",
        title: "General information about pricing and plans",
        paras: [
          "Pricing is meant to be clear and predictable: what is included in each plan, and how access to features works.",
          "As the product develops, pricing information may be updated to reflect new functionality. Anything material is documented here rather than announced only in the plugin.",
        ],
      },
      {
        id: "future-payment-options",
        title: "Future payment options",
        paras: [
          "Additional payment options may be introduced to better support different regions and needs — new billing periods, alternative payment methods, or expanded plan types.",
          "Any new option will be communicated clearly before it becomes active, and this documentation will be updated with it.",
        ],
      },
      {
        id: "changes-to-plans-and-conditions",
        title: "Changes to plans and conditions",
        paras: [
          "Plans, features and conditions may change as Web2Wireframe develops. When they do, the intent is to improve the experience and keep pricing aligned with the value of the features.",
          "Significant changes are announced in advance wherever possible, and the updated information always appears here.",
        ],
      },
      {
        id: "renewal-and-account-related-topics",
        title: "Renewal and account-related topics",
        paras: [
          "Pro is a one-time purchase, so there is no recurring subscription to cancel and no automatic charge. Access lasts 30 days from the date of purchase, and you can check your current plan and expiry date at any time in the plugin's Plan modal.",
          "To keep Pro past the 30 days you make another one-time purchase. If the period ends without one, the account simply returns to the free tier — and we email a reminder beforehand so it is never a surprise.",
        ],
      },
      {
        id: "final-note",
        title: "Final note",
        paras: [
          "This page is general guidance rather than a billing policy. For the binding terms, see the Terms page; for anything specific to your account, email billing@web2wireframe.design.",
        ],
      },
    ],
  },
};
