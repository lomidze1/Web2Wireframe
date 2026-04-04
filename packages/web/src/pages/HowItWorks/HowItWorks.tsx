import type { ReactElement } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./HowItWorks.module.scss";

// Card Covers Icons
// 1. Configuration Icons
import iconTextOption from "../../assets/how-it-work/card-icons/icon-text-option.png";
import iconColorOption from "../../assets/how-it-work/card-icons/color-option-icon.png";
import iconFontOption from "../../assets/how-it-work/card-icons/font-option-icon.png";
// 2. Input Method Icons
import iconWebsiteUrl from "../../assets/how-it-work/card-icons/website-url-icon.png";
import iconScreenshot from "../../assets/how-it-work/card-icons/screenshot-icon.png";
import iconHTML from "../../assets/how-it-work/card-icons/html-icon.png";
import iconAreaSelection from "../../assets/how-it-work/card-icons/area-selection-icon.png";
// 3. AI Generated Feature Icons
import aiGeneratingPageIcon from "../../assets/how-it-work/card-icons/ai-generating-page-icon.png";
import aiGeneratingBlockIcon from "../../assets/how-it-work/card-icons/ai-generating-block-icon.png";

// Card Cover images
// 1. Cover images for Configuration Cards
import textCardCover from "../../assets/how-it-work/card-cover/text-card-cover.png";
import colorCardCover from "../../assets/how-it-work/card-cover/color-card-cover.png";
import fontCardCover from "../../assets/how-it-work/card-cover/font-card-cover.png";
// 2. Cover images for Input Method Cards
import urlCardCover from "../../assets/how-it-work/card-cover/url-card-cover.png";
import screenshotCardCover from "../../assets/how-it-work/card-cover/screenshot-card-cover.png";
import htmlCardCover from "../../assets/how-it-work/card-cover/html-card-cover.png";
import areaCardCover from "../../assets/how-it-work/card-cover/area-card-cover.png";
// 3. Cover images for AI Features
import aiPageGenerateCover from "../../assets/how-it-work/card-cover/ai-page-generate-cover.png";
import aiBlockGenerateCover from "../../assets/how-it-work/card-cover/ai-block-generate-cover.png";

// Card Details images :
// 1. Configuration details
import textSettings1 from "../../assets/how-it-work/card-details/text-settings-1.png";
import textSettings2 from "../../assets/how-it-work/card-details/text-settings-2.png";
import colorSettings1 from "../../assets/how-it-work/card-details/color-settings-1.png";
import colorSettings2 from "../../assets/how-it-work/card-details/color-settings-2.png";
import fontSettings1 from "../../assets/how-it-work/card-details/font-settings-1.png";
import fontSettings2 from "../../assets/how-it-work/card-details/font-settings-2.png";
// 2. Input Method details
import urlImport1 from "../../assets/how-it-work/card-details/url-import-1.png";
import urlImport2 from "../../assets/how-it-work/card-details/url-import-2.png";
import screenshotImport1 from "../../assets/how-it-work/card-details/screenshot-import-1.png";
import screenshotImport2 from "../../assets/how-it-work/card-details/screenshot-import-2.png";
import htmlCodeImport1 from "../../assets/how-it-work/card-details/html-import-1.png";
import htmlCodeImport2 from "../../assets/how-it-work/card-details/html-import-2.png";
import areaSelectionImport1 from "../../assets/how-it-work/card-details/area-selection-import-1.png";
import areaSelectionImport2 from "../../assets/how-it-work/card-details/area-selection-import-2.png";

// 3. AI generated details
import aiPageGenerating1 from "../../assets/how-it-work/card-details/ai-page-generating-1.png";
import aiPageGenerating2 from "../../assets/how-it-work/card-details/ai-page-generating-2.png";
import aiBlockGenerating1 from "../../assets/how-it-work/card-details/ai-block-generating-1.png";
import aiBlockGenerating2 from "../../assets/how-it-work/card-details/ai-block-generating-2.png";

type Card = {
  id: string;
  icon?: string;
  cardImage?: string;
  title: string;
  description: string | string[];
  details: {
    howToUse: string | string[];
    screenshots: (string | typeof import("*.png"))[]; // Support both string paths and imported modules
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
      "Configure colors, fonts, and text rules once, and reuse them across all imports for consistent results.",
    cards: [
      {
        id: "text-settings",
        icon: iconTextOption,
        cardImage: textCardCover,
        title: "Text Settings",
        description:
          "Control how text content is generated and represented during import.",
        details: {
          howToUse:
            "Define how text is handled when converting websites into wireframes. Choose between semantic placeholders, original website copy, or length-matched Lorem Ipsum. This allows you to focus on structure, hierarchy, and layout without being distracted by real content — or keep original text when fidelity matters.",
          screenshots: [textSettings1, textSettings2],
        },
      },
      {
        id: "color-settings",
        icon: iconColorOption,
        cardImage: colorCardCover,
        title: "Color Settings",
        description: "Control color extraction and palette creation rules.",
        details: {
          howToUse:
            "Define how colors are extracted from your source designs. Set color naming conventions, palette organization, and automatic color simplification. Create reusable color tokens.",
          screenshots: [colorSettings1, colorSettings2],
        },
      },
      {
        id: "font-settings",
        icon: iconFontOption,
        cardImage: fontCardCover,
        title: "Font Settings",
        description:
          "Map web fonts to Figma-available typefaces automatically.",
        details: {
          howToUse:
            "Set up font mappings so non-standard web fonts are converted to Figma-compatible alternatives. Define fallback chains and keep your designs consistent across projects.",
          screenshots: [fontSettings1, fontSettings2],
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
        cardImage: urlCardCover,
        title: "URL Import",
        description:
          "Paste any public URL. W2W fetches, segments, and cleans the layout.",
        details: {
          howToUse: [
            "Enter the URL of the website you want to import.",
            "Adjust import settings (colors, fonts, text, viewport).",
            "Click Import to generate your Figma wireframe.",
          ],
          screenshots: [urlImport1, urlImport2],
        },
      },
      {
        id: "screenshot",
        icon: iconScreenshot,
        cardImage: screenshotCardCover,
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
          screenshots: [screenshotImport1, screenshotImport2],
        },
      },
      {
        id: "html-code",
        icon: iconHTML,
        cardImage: htmlCardCover,
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
          screenshots: [htmlCodeImport1, htmlCodeImport2],
        },
      },
      {
        id: "area-selection",
        icon: iconAreaSelection,
        cardImage: areaCardCover,
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
          screenshots: [areaSelectionImport1, areaSelectionImport2],
        },
      },
    ],
  },
  {
    id: "ai-generation",
    number: "03",
    title: "AI Generation",
    subtitle:
      "Generate page and block wireframes using AI-assisted structure detection and reusable templates.",
    cards: [
      {
        id: "generate-full-page",
        icon: aiGeneratingPageIcon,
        cardImage: aiPageGenerateCover,
        title: "Generate Full Page",
        description:
          "Create structured wireframes for complete pages like landing, home, or pricing.",
        details: {
          howToUse:
            "Create a complete page wireframe by selecting density, viewport, and page type. The AI builds a full layout with logical section flow and responsive structure, ready for editing in Figma.",
          screenshots: [aiPageGenerating1, aiPageGenerating2],
        },
      },
      {
        id: "generate-block",
        icon: aiGeneratingBlockIcon,
        cardImage: aiBlockGenerateCover,
        title: "Generate Block",
        description:
          "Generate individual UI blocks such as headers, testimonials, or pricing sections.",
        details: {
          howToUse:
            "Create a focused wireframe block by selecting density, viewport, and block type.The AI generates a clean, reusable section designed to seamlessly fit into full page layouts.",
          screenshots: [aiBlockGenerating1, aiBlockGenerating2],
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
                      />
                    )}{" "}
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
                    <div className={styles.cardPreview}>
                      {card.cardImage && (
                        <img
                          src={card.cardImage}
                          alt={`${card.title} preview`}
                          className={styles.cardPreviewImg}
                        />
                      )}
                    </div>
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
                            src={String(
                              typeof src === "string" ? src : src.default || src
                            )}
                            alt={`${getActiveCard()?.card.title} example ${
                              idx + 1
                            }`}
                            width="300"
                            height="200"
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
