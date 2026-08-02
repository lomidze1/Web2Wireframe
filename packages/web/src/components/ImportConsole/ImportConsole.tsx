import { useState, type CSSProperties, type ReactElement } from "react";
import plate from "../../assets/plate.jpg";
import {
  DEFAULT_CONSOLE_STATE,
  FRAMES,
  SOURCE_HINTS,
  deriveLayerNote,
  deriveLayers,
  deriveSummary,
  getCopy,
  getFontStack,
  getPalette,
  getPaletteLabel,
  type ConsoleState,
} from "./consoleLogic";
import styles from "./ImportConsole.module.scss";

type OptionValue<K extends keyof ConsoleState> = ConsoleState[K];

interface OptionSpec<K extends keyof ConsoleState> {
  value: OptionValue<K>;
  label: string;
}

const SOURCE_OPTIONS: OptionSpec<"source">[] = [
  { value: "url", label: "Web URL" },
  { value: "screenshot", label: "Screenshot" },
  { value: "html", label: "HTML / CSS" },
  { value: "area", label: "Area select" },
];

const VIEWPORT_OPTIONS: OptionSpec<"viewport">[] = [
  { value: "1440", label: "1440" },
  { value: "768", label: "768" },
  { value: "375", label: "375" },
];

const LAYOUT_OPTIONS: OptionSpec<"layout">[] = [
  { value: "auto", label: "Auto layout" },
  { value: "absolute", label: "Absolute" },
];

const TEXT_OPTIONS: OptionSpec<"text">[] = [
  { value: "semantic", label: "Semantic" },
  { value: "lorem", label: "Lorem" },
  { value: "website", label: "Real copy" },
];

const ASSETS_OPTIONS: OptionSpec<"assets">[] = [
  { value: "placeholder", label: "Placeholders" },
  { value: "real", label: "Real assets" },
];

const COLORS_OPTIONS: OptionSpec<"colors">[] = [
  { value: "plugin", label: "Plugin palette" },
  { value: "website", label: "Site palette" },
];

const FONTS_OPTIONS: OptionSpec<"fonts">[] = [
  { value: "plugin", label: "Plugin font" },
  { value: "website", label: "Site font" },
];

const VARS_OPTIONS: OptionSpec<"vars">[] = [
  { value: "direct", label: "Direct values" },
  { value: "figma", label: "Figma variables" },
];

const ImportConsole = (): ReactElement => {
  const [state, setState] = useState<ConsoleState>(DEFAULT_CONSOLE_STATE);

  const pal = getPalette(state.colors);
  const copy = getCopy(state.text);
  const frame = FRAMES[state.viewport];
  const layers = deriveLayers(state);
  const summary = deriveSummary(state);

  const setOption = <K extends keyof ConsoleState>(
    key: K,
    value: ConsoleState[K],
  ): void => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const renderOptions = <K extends keyof ConsoleState>(
    key: K,
    options: OptionSpec<K>[],
    optionClass?: string,
  ): ReactElement[] =>
    options.map((option) => (
      <button
        key={option.value}
        type="button"
        aria-pressed={state[key] === option.value}
        className={`${styles.opt} ${optionClass ?? ""} ${
          state[key] === option.value ? styles.optActive : ""
        }`}
        onClick={() => setOption(key, option.value)}
      >
        {option.label}
      </button>
    ));

  /* Palette + frame metrics reach the CSS as custom properties so the mock
     frame stays fully style-driven while the values stay state-driven. */
  const frameVars = {
    "--mf-text": pal.text,
    "--mf-bg": pal.bg,
    "--mf-secondary": pal.secondary,
    "--mf-surface": pal.surface,
    "--mf-accent": pal.accent,
    "--mf-pad-sm": frame.padSm,
    "--mf-pad-lg": frame.padLg,
    "--mf-pad-x": frame.padX,
    "--mf-gap": frame.gap,
    "--mf-fs-h1": frame.fsH1,
    "--mf-fs-body": frame.fsBody,
    "--mf-fs-micro": frame.fsMicro,
    "--mf-btn-pad": frame.btnPad,
    "--mf-media-h": frame.mediaH,
    "--mf-card-cols": frame.cardCols,
    fontFamily: getFontStack(state.fonts),
  } as CSSProperties;

  return (
    <div className={styles.console}>
      <div className={styles.titleBar}>
        <div className={styles.titleDots}>
          <span />
          <span />
        </div>
        <span className={styles.titleLabel}>W2W · import settings</span>
        <span className={styles.titleSummary}>{summary}</span>
      </div>

      <div className={styles.body}>
        <div className={styles.settings}>
          <div className={styles.group}>
            <div className={styles.groupLabel}>Source</div>
            <div className={styles.optGrid}>
              {renderOptions("source", SOURCE_OPTIONS, styles.optLeft)}
            </div>
            <div className={styles.sourceHint}>{SOURCE_HINTS[state.source]}</div>
          </div>

          <div className={styles.rule} />

          <div className={styles.group}>
            <div className={styles.groupLabel}>Viewport</div>
            <div className={styles.optRow}>
              {renderOptions("viewport", VIEWPORT_OPTIONS, styles.optTnum)}
            </div>
          </div>

          <div className={styles.group}>
            <div className={styles.groupLabel}>Layout mode</div>
            <div className={styles.optRow}>{renderOptions("layout", LAYOUT_OPTIONS)}</div>
          </div>

          <div className={styles.group}>
            <div className={styles.groupLabel}>Text</div>
            <div className={styles.optRow}>{renderOptions("text", TEXT_OPTIONS)}</div>
          </div>

          <div className={styles.group}>
            <div className={styles.groupLabel}>Assets</div>
            <div className={styles.optRow}>{renderOptions("assets", ASSETS_OPTIONS)}</div>
          </div>

          <div className={styles.group}>
            <div className={styles.groupLabel}>Colours &amp; fonts</div>
            <div className={styles.optRow}>{renderOptions("colors", COLORS_OPTIONS)}</div>
            <div className={styles.optRow}>{renderOptions("fonts", FONTS_OPTIONS)}</div>
            <div className={styles.swatchRow}>
              <span className={styles.swatch} style={{ background: pal.text }} />
              <span className={styles.swatch} style={{ background: pal.bg }} />
              <span className={styles.swatch} style={{ background: pal.secondary }} />
              <span className={styles.swatch} style={{ background: pal.surface }} />
              <span className={styles.swatch} style={{ background: pal.accent }} />
              <span className={styles.swatchLabel}>{getPaletteLabel(state.colors)}</span>
            </div>
          </div>

          <div className={styles.group}>
            <div className={styles.groupLabel}>CSS variables</div>
            <div className={styles.optRow}>{renderOptions("vars", VARS_OPTIONS)}</div>
          </div>

          <p className={styles.settingsFootnote}>
            Eight decisions. Each one is a task you don't do by hand afterwards.
          </p>
        </div>

        <div className={styles.output}>
          <div className={styles.canvas}>
            <div className={styles.frameHolder} style={{ maxWidth: frame.w }}>
              <div className={styles.frameCaption}>{frame.label}</div>
              <div className={styles.frame} style={frameVars}>
                <div className={styles.mfNav}>
                  <div className={styles.mfLogo} />
                  <div className={styles.mfNavLinks}>
                    <span>{copy.nav1}</span>
                    <span>{copy.nav2}</span>
                    <span>{copy.nav3}</span>
                  </div>
                  <div className={styles.mfNavCta} />
                </div>

                <div className={styles.mfHero}>
                  <div className={styles.mfH1}>{copy.h1}</div>
                  <div className={styles.mfP}>{copy.p}</div>
                  <div className={styles.mfCta}>{copy.cta}</div>
                </div>

                <div className={styles.mfMedia}>
                  {state.assets === "real" ? (
                    <div className={`plate ${styles.mfPlate}`}>
                      <img
                        src={plate}
                        alt="Imported hero photograph"
                        className={styles.mfPlateImg}
                      />
                    </div>
                  ) : (
                    <div className={styles.mfMediaPlaceholder}>image</div>
                  )}
                </div>

                <div className={styles.mfCards}>
                  {copy.cards.map((card, index) => (
                    <div key={index} className={styles.mfCard}>
                      <div className={styles.mfCardIcon} />
                      <div className={styles.mfCardTitle}>{card.title}</div>
                      <div className={styles.mfCardBody}>{card.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.layers}>
            <div className={styles.layersHeader}>Layers in Figma</div>
            {layers.map((layer) => (
              <div
                key={layer.name}
                className={styles.layerRow}
                style={{ paddingLeft: layer.pad }}
              >
                <span className={styles.layerName}>{layer.name}</span>
                <span className={styles.layerTag}>{layer.tag}</span>
              </div>
            ))}
            <div className={styles.layerNote}>{deriveLayerNote(state.layout)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportConsole;
