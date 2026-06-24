import type { ReactElement } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./HowItWorks.module.scss";

// Card Covers Icons
// 1. Configuration Icons
import iconTextOption from "../../assets/how-it-work/card-icons/icon-text-option.png";
import iconColorOption from "../../assets/how-it-work/card-icons/color-option-icon.png";
import iconFontOption from "../../assets/how-it-work/card-icons/font-option-icon.png";
import iconLayout from "../../assets/how-it-work/card-icons/layout-detection-icon.png";
// 2. Input Method Icons
import iconWebsiteUrl from "../../assets/how-it-work/card-icons/website-url-icon.png";
import iconScreenshot from "../../assets/how-it-work/card-icons/screenshot-icon.png";
import iconHTML from "../../assets/how-it-work/card-icons/html-icon.png";
import iconAreaSelection from "../../assets/how-it-work/card-icons/area-selection-icon.png";

// Detail screenshots are served from `public/how-it-works/` (absolute
// `/how-it-works/...` paths) so new images can be dropped in without touching
// code: detail screenshots in `public/how-it-works/details/`, plus a few
// reused covers in `public/how-it-works/covers/`.

// Inline SVG icons for the three cards that have no PNG icon asset
// (Viewports, Assets, CSS Variables). Sized to match the 40x40 PNG icons.
const iconViewports = (
  <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <rect
      x="4"
      y="8"
      width="23"
      height="17"
      rx="2"
      stroke="currentColor"
      strokeWidth="2"
    />
    <line
      x1="11"
      y1="29"
      x2="20"
      y2="29"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <rect
      x="25"
      y="16"
      width="11"
      height="18"
      rx="2"
      fill="var(--surface, #fff)"
      stroke="currentColor"
      strokeWidth="2"
    />
    <line
      x1="28"
      y1="31"
      x2="33"
      y2="31"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const iconAssets = (
  <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <rect
      x="6"
      y="8"
      width="28"
      height="24"
      rx="3"
      stroke="currentColor"
      strokeWidth="2"
    />
    <circle cx="15" cy="16" r="2.5" stroke="currentColor" strokeWidth="2" />
    <path
      d="M9 30 L18 21 L24 27 L29 23 L33 27"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const iconCssVariables = (
  <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path
      d="M16 8 C12 8 13 16 9 20 C13 24 12 32 16 32"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M24 8 C28 8 27 16 31 20 C27 24 28 32 24 32"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

type Card = {
  id: string;
  icon?: string;
  iconSvg?: ReactElement;
  title: string;
  description: string | string[];
  details: {
    howToUse: string | string[];
    screenshots: string[];
  };
};

type Section = {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  cards: Card[];
};

const sections: Section[] = [
  {
    id: "configuration",
    number: "01",
    title: "Configuration Settings",
    subtitle:
      "Set up viewports, colors, fonts, text, assets, variables, and layout once, then reuse them across all imports for consistent results.",
    cards: [
      {
        id: "viewport-settings",
        iconSvg: iconViewports,
        title: "Viewports",
        description:
          "Choose which screen widths are captured for each import.",
        details: {
          howToUse:
            "Pick one or more capture widths (1920, 1440, 1024, 768, 375) so a single import produces every breakpoint you need. Each selected viewport is rendered and converted into its own Figma frame — ideal for comparing desktop, tablet, and mobile layouts side by side. Use More Options for finer control.",
          screenshots: [
            "/how-it-works/details/viewport-settings-1.png",
            "/how-it-works/details/viewport-settings-2.png",
          ],
        },
      },
      {
        id: "color-settings",
        icon: iconColorOption,
        title: "Colors",
        description: "Control color extraction and palette creation rules.",
        details: {
          howToUse:
            "Define how colors are extracted from your source designs. Set color naming conventions, palette organization, and automatic color simplification. Create reusable color tokens.",
          screenshots: [
            "/how-it-works/details/color-settings-1.png",
            "/how-it-works/details/color-settings-2.png",
          ],
        },
      },
      {
        id: "font-settings",
        icon: iconFontOption,
        title: "Fonts",
        description:
          "Map web fonts to Figma-available typefaces automatically.",
        details: {
          howToUse:
            "Set up font mappings so non-standard web fonts are converted to Figma-compatible alternatives. Define fallback chains and keep your designs consistent across projects.",
          screenshots: [
            "/how-it-works/details/font-settings-1.png",
            "/how-it-works/details/font-settings-2.png",
          ],
        },
      },
      {
        id: "text-settings",
        icon: iconTextOption,
        title: "Text",
        description:
          "Control how text content is generated and represented during import.",
        details: {
          howToUse:
            "Define how text is handled when converting websites into wireframes. Choose between semantic placeholders, original website copy, or length-matched Lorem Ipsum. This allows you to focus on structure, hierarchy, and layout without being distracted by real content — or keep original text when fidelity matters.",
          screenshots: [
            "/how-it-works/details/text-settings-1.png",
            "/how-it-works/details/text-settings-2.png",
          ],
        },
      },
      {
        id: "asset-settings",
        iconSvg: iconAssets,
        title: "Assets",
        description:
          "Decide whether images render as placeholders or real assets.",
        details: {
          howToUse:
            "Switch between Plugin Placeholders — neutral boxes that keep the wireframe clean and lightweight — and Real Assets, which import the website's actual images, icons, and SVGs for a high-fidelity result. Choose placeholders for early structure work, real assets when visual accuracy matters.",
          screenshots: [
            "/how-it-works/details/asset-settings-1.png",
            "/how-it-works/details/asset-settings-2.png",
          ],
        },
      },
      {
        id: "variable-settings",
        iconSvg: iconCssVariables,
        title: "CSS Variables",
        description:
          "Control how CSS custom properties become Figma values.",
        details: {
          howToUse:
            "Choose Direct Value to bake each CSS variable into its resolved color or size, or Create Figma Styles to turn variables into reusable Figma styles. Styles keep your design tokens linked and editable across the whole file, mirroring the source design system.",
          screenshots: [
            "/how-it-works/details/variable-settings-1.png",
            "/how-it-works/details/variable-settings-2.png",
          ],
        },
      },
      {
        id: "layout-settings",
        icon: iconLayout,
        title: "Layout Mode",
        description:
          "Pick how the captured structure is laid out in Figma.",
        details: {
          howToUse:
            "Use Auto Layout to rebuild the page with responsive Figma auto-layout frames — easy to resize and restructure. Use Absolute (Pixel-perfect) to position every element exactly as on the source page when you need an exact visual match over flexibility.",
          screenshots: [
            "/how-it-works/details/layout-settings-1.png",
            "/how-it-works/details/layout-settings-2.png",
          ],
        },
      },
    ],
  },
  {
    id: "input-methods",
    number: "02",
    title: "Input Methods",
    subtitle: "Choose the fastest path to bring the web into Figma.",
    cards: [
      {
        id: "url-import",
        icon: iconWebsiteUrl,
        title: "URL Import",
        description:
          "Paste any public URL. W2W fetches, segments, and cleans the layout.",
        details: {
          howToUse: [
            "Enter the URL of the website you want to import.",
            "Adjust import settings (colors, fonts, text, viewport).",
            "Click Import to generate your Figma wireframe.",
          ],
          screenshots: ["/how-it-works/covers/url-import.png"],
        },
      },
      {
        id: "area-selection",
        icon: iconAreaSelection,
        title: "Area Selection",
        description:
          "Use the browser extension to highlight and capture specific regions.",
        details: {
          howToUse: [
            "Install the Web2Wireframe browser extension.",
            "Select a specific region on the website.",
            "Download the generated .w2w file and upload it.",
            "Adjust import settings (viewport, colors, fonts, text).",
            "Click Generate Wireframe to create an editable Figma layout.",
          ],
          screenshots: ["/how-it-works/covers/area-selection.png"],
        },
      },
      {
        id: "html-code",
        icon: iconHTML,
        title: "HTML Code",
        description:
          "Paste raw HTML and CSS for instant conversion to Figma components.",
        details: {
          howToUse: [
            "Paste your HTML markup into the HTML field.",
            "(Optional) Paste related CSS to preserve styling and layout.",
            "Select the desired viewport size.",
            "Choose color, font, and text handling options.",
            "Click Generate Wireframe to convert your code into editable Figma layers.",
          ],
          screenshots: ["/how-it-works/covers/html-code.png"],
        },
      },
      {
        id: "screenshot",
        icon: iconScreenshot,
        title: "Screenshot",
        description:
          "Upload a screenshot and extract structure directly from the image.",
        details: {
          howToUse: [
            "Upload a screenshot of the design (click or drag & drop).",
            "Select the desired viewport size.",
            "Choose color, font, and text handling options.",
            "Click Generate Wireframe to create an editable Figma layout.",
          ],
          screenshots: ["/how-it-works/covers/screenshot.png"],
        },
      },
    ],
  },
];

type ActiveKey = string | null;

const HowItWorks = (): ReactElement => {
  const [activeKey, setActiveKey] = useState<ActiveKey>(null);
  const navigate = useNavigate();

  const toggleCard = (sectionId: string, cardId: string): void => {
    const key = `${sectionId}:${cardId}`;
    setActiveKey(activeKey === key ? null : key);
  };

  const closePanel = (): void => {
    setActiveKey(null);
  };

  const getActiveCard = (): { section: Section; card: Card } | undefined => {
    if (!activeKey) return undefined;
    const [sectionId, cardId] = activeKey.split(":");
    for (const section of sections) {
      if (section.id === sectionId) {
        const card = section.cards.find((c) => c.id === cardId);
        if (card) return { section, card };
      }
    }
    return undefined;
  };

  return (
    <div className={styles.page} role="main">
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroCard}>
            <div className={`${styles.sectionLabel} section-label`}>
              How it works
            </div>
            <h1>Learn how Web2Wireframe works.</h1>
            <p>
              Explore inputs, settings, and AI features - with clear,
              step-by-step visuals.
            </p>
          </div>
        </div>
      </section>

      {sections.map((section) => (
        <section key={section.id} className={styles.section}>
          <div className="container">
            <div className={styles.sectionHead}>
              <div className={styles.sectionNumber}>{section.number}</div>
              <div>
                <h2>{section.title}</h2>
                <p>{section.subtitle}</p>
              </div>
            </div>

            <div className={styles.grid}>
              {section.cards.map((card) => {
                const cardKey = `${section.id}:${card.id}`;
                return (
                  <button
                    key={card.id}
                    type="button"
                    className={`${styles.card} ${
                      activeKey === cardKey ? styles.active : ""
                    }`}
                    onClick={() => toggleCard(section.id, card.id)}
                    aria-expanded={activeKey === cardKey}
                    aria-controls={`panel-${cardKey}`}
                  >
                    {card.icon && (
                      <img
                        src={card.icon}
                        alt=""
                        className={styles.cardIcon}
                        width="40"
                        height="40"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    {card.iconSvg && (
                      <span className={styles.cardIconSvg} aria-hidden="true">
                        {card.iconSvg}
                      </span>
                    )}
                    <h3>{card.title}</h3>
                    {Array.isArray(card.description) ? (
                      <ol className={styles.cardList}>
                        {card.description.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ol>
                    ) : (
                      <p>{card.description}</p>
                    )}
                  </button>
                );
              })}
            </div>

            {activeKey &&
              activeKey.startsWith(`${section.id}:`) &&
              getActiveCard() && (
                <div
                  id={`panel-${activeKey}`}
                  className={styles.expandPanel}
                  role="region"
                  aria-label="Card details"
                >
                  <div className={styles.panelHead}>
                    <h3>{getActiveCard()?.card.title}</h3>
                    <button
                      type="button"
                      className={styles.closeBtn}
                      onClick={closePanel}
                      aria-label="Close details"
                    >
                      ✕
                    </button>
                  </div>

                  {Array.isArray(getActiveCard()?.card.details.howToUse) ? (
                    <ol
                      className={`${styles.panelDescription} ${styles.panelList}`}
                    >
                      {(getActiveCard()?.card.details.howToUse as string[]).map(
                        (item) => (
                          <li key={item}>{item}</li>
                        )
                      )}
                    </ol>
                  ) : (
                    <p className={styles.panelDescription}>
                      {getActiveCard()?.card.details.howToUse}
                    </p>
                  )}

                  <div className={styles.panelScreenshots}>
                    {getActiveCard()?.card.details.screenshots.map(
                      (src, idx) => (
                        <div key={idx} className={styles.screenshotContainer}>
                          <img
                            src={src}
                            alt={`${getActiveCard()?.card.title} example ${
                              idx + 1
                            }`}
                            width="300"
                            height="200"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
          </div>
        </section>
      ))}

      <section className={styles.section}>
        <div className="container">
          <div className={styles.ctaBox}>
            <h2>Need help?</h2>
            <p>If something is unclear, contact our support team.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate("/support")}
            >
              Contact support
            </button>
            <p className={styles.ctaEmail}>
              Or email us:{" "}
              <a href="mailto:support@web2wireframe.design">
                support@web2wireframe.design
              </a>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default HowItWorks;
