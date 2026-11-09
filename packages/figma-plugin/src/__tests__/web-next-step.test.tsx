/** @jsx h */
import { h } from "preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor, act } from "@testing-library/preact";
import Web from "../ui/pages/import/web/Web";

/**
 * The Web tab's "what next?" card. After a successful import the loader closes
 * and the URL field is cleared, so the card must remember the import itself —
 * and its one-click re-imports must use one-off settings without touching the
 * user's own (visible or saved) options.
 */

vi.mock("../ui/shared/ConfigContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/ConfigContext")>();
  return {
    ...actual,
    useConfig: () => ({
      config: {
        figmaUserId: "user-1",
        pluginColors: {
          accent: "#E76F51",
          surface: "#FFFFFF",
          text: "#1C2F3A",
          background: "#FAFAFA",
          secondary: "#2A9D8F",
        },
        pluginFont: "Montserrat",
      },
      setConfig: vi.fn(),
    }),
  };
});

const settingsMock = {
  isExpanded: false,
  toggleExpanded: vi.fn(),
  localViewports: ["1440"],
  localColorMode: "website" as const,
  localFontMode: "website" as const,
  localTextMode: "website" as const,
  localCssVariablesMode: "direct" as const,
  localLayoutMode: "autoLayout" as const,
  localAssetMode: "realAssets" as const,
  localInteractionMode: "none" as const,
  localOriginLinks: true,
  toggleViewport: vi.fn(),
  setColorMode: vi.fn(),
  setFontMode: vi.fn(),
  setTextMode: vi.fn(),
  setCssVariablesMode: vi.fn(),
  setLayoutMode: vi.fn(),
  setAssetMode: vi.fn(),
  setInteractionMode: vi.fn(),
  setOriginLinks: vi.fn(),
  handleReset: vi.fn(),
  handleSaveAsDefault: vi.fn(),
  hasOverrides: false,
  openSettings: vi.fn(),
  collapseSettings: vi.fn(),
};

vi.mock("../ui/hooks/useTabSettings", () => ({
  useTabSettings: () => settingsMock,
}));

const licenseState: { current: any } = { current: null };
vi.mock("../ui/shared/LicenseContext", () => ({
  useLicense: () => licenseState.current,
}));

vi.mock("../ui/shared/licenseClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/licenseClient")>();
  return { ...actual, authHeader: () => "Bearer test-token" };
});

const panelProps: { current: any } = { current: null };
vi.mock("../ui/components/settingsPanel", () => ({
  default: (props: any) => {
    panelProps.current = props;
    return null;
  },
}));

const loaderProps: { current: any } = { current: null };
vi.mock("../ui/components/renderingLoader/RenderingLoader", () => ({
  default: (props: any) => {
    loaderProps.current = props;
    return null;
  },
}));

const TARGET_URL = "https://stripe.com/pricing";
const CARD_TITLE = /Imported! What next\?/;

function successResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      wireframeData: {
        frames: [
          {
            viewportWidth: 1440,
            tree: { type: "FRAME", children: [{ type: "TEXT", value: "Payments" }] },
          },
        ],
      },
      fonts: [],
    }),
  } as unknown as Response;
}

function freeLicense(used: number) {
  return {
    plan: "free",
    usage: { imports: used, periodStartedAt: "" },
    limits: { imports: 10 },
  };
}

const urlInput = (container: Element) =>
  container.querySelector("#w2w-url-input") as HTMLInputElement;

const button = (container: Element, re: RegExp) =>
  Array.from(container.querySelectorAll("button")).find((b) =>
    re.test(b.textContent ?? "")
  ) as HTMLButtonElement | undefined;

const renderCalls = (spy: any) =>
  spy.mock.calls.filter((c: any) => c[0]?.pluginMessage?.type === "render-wireframe");

function sendPluginMessage(type: string, data: unknown) {
  window.dispatchEvent(new MessageEvent("message", { data: { pluginMessage: { type, data } } }));
}

/** Runs one import all the way to "user closed the loader". */
async function completeImport(container: Element, postSpy: any, renders = 1) {
  if (renders === 1) {
    fireEvent.input(urlInput(container), { target: { value: TARGET_URL } });
    fireEvent.click(button(container, /^Import$/)!);
  }
  await waitFor(() => expect(renderCalls(postSpy)).toHaveLength(renders));
  await act(async () => {
    sendPluginMessage("render-progress", { step: "Done", percent: 100, isComplete: true });
  });
  await act(async () => {
    loaderProps.current.onClose();
  });
}

beforeEach(() => {
  loaderProps.current = null;
  panelProps.current = null;
  settingsMock.isExpanded = false;
  licenseState.current = { refresh: vi.fn(), license: null, isLoading: false, error: null };
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Web tab — next-step card lifecycle", () => {
  it("waits for the loader to close before showing the card", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);

    fireEvent.input(urlInput(container), { target: { value: TARGET_URL } });
    fireEvent.click(button(container, /^Import$/)!);
    await waitFor(() => expect(renderCalls(postSpy)).toHaveLength(1));
    await act(async () => {
      sendPluginMessage("render-progress", { step: "Done", percent: 100, isComplete: true });
    });
    expect(container.textContent).not.toMatch(CARD_TITLE);

    await act(async () => {
      loaderProps.current.onClose();
    });
    expect(container.textContent).toMatch(CARD_TITLE);
    // The field is cleared as before — the card remembers the import itself.
    expect(urlInput(container).value).toBe("");
  });

  it("shows no card when the render failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);

    fireEvent.input(urlInput(container), { target: { value: TARGET_URL } });
    fireEvent.click(button(container, /^Import$/)!);
    await waitFor(() => expect(renderCalls(postSpy)).toHaveLength(1));
    await act(async () => {
      sendPluginMessage("wireframe-error", { error: "boom" });
    });

    expect(container.textContent).not.toMatch(CARD_TITLE);
  });

  it("hides the card as soon as the user types a new URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);

    fireEvent.input(urlInput(container), { target: { value: "https://linear.app" } });
    expect(container.textContent).not.toMatch(CARD_TITLE);
  });

  it("hides the card when the next import starts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(successResponse())
      .mockReturnValueOnce(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);

    fireEvent.click(button(container, /mobile version/i)!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(container.textContent).not.toMatch(CARD_TITLE);
  });
});

describe("Web tab — next-step actions", () => {
  it("re-imports the same page at 375 without touching the viewport setting", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);

    fireEvent.click(button(container, /mobile version/i)!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.sourceUrl).toBe(TARGET_URL);
    expect(body.viewports).toEqual([375]);
    expect(body.colorMode).toBe("website");
    expect(body.typographyMode).toBe("website");
    expect(body.assetMode).toBe("realAssets");
    expect(settingsMock.toggleViewport).not.toHaveBeenCalled();
  });

  it("re-imports the same page wireframe-styled without touching the user's settings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);

    fireEvent.click(button(container, /wireframe style/i)!);
    await waitFor(() => expect(renderCalls(postSpy)).toHaveLength(2));

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.sourceUrl).toBe(TARGET_URL);
    expect(body.viewports).toEqual([1440]);
    expect(body.colorMode).toBe("plugin");
    expect(body.typographyMode).toBe("plugin");
    expect(body.assetMode).toBe("placeholders");

    const payload = renderCalls(postSpy)[1][0].pluginMessage.data;
    expect(payload.colorMode).toBe("plugin");
    expect(payload.fontMode).toBe("plugin");
    expect(payload.assetMode).toBe("placeholders");

    expect(settingsMock.setColorMode).not.toHaveBeenCalled();
    expect(settingsMock.setFontMode).not.toHaveBeenCalled();
    expect(settingsMock.setTextMode).not.toHaveBeenCalled();
    expect(settingsMock.setAssetMode).not.toHaveBeenCalled();
  });

  it("imports the mobile version in the user's own style after a wireframe re-import", async () => {
    // Owner-reported: import → Try wireframe style → Import mobile version
    // came out wireframe-styled. Mobile means "the same import, narrower" —
    // the one-off wireframe style must not carry over.
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);

    fireEvent.click(button(container, /wireframe style/i)!);
    await completeImport(container, postSpy, 2);

    fireEvent.click(button(container, /mobile version/i)!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const body = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(body.sourceUrl).toBe(TARGET_URL);
    expect(body.viewports).toEqual([375]);
    expect(body.colorMode).toBe("website");
    expect(body.typographyMode).toBe("website");
    expect(body.assetMode).toBe("realAssets");
  });

  it("prefills the site's home page for another page, without importing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);

    fireEvent.click(button(container, /another page/i)!);

    expect(urlInput(container).value).toBe("https://stripe.com/");
    expect(document.activeElement).toBe(urlInput(container));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the prefilled URL past the old 10-second reset", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);

    fireEvent.click(button(container, /another page/i)!);
    await act(async () => {
      vi.advanceTimersByTime(11_000);
    });

    expect(urlInput(container).value).toBe("https://stripe.com/");
  });
});

const STYLE_BUTTON = /wireframe style|low-fi sketch|smart placeholder text/i;

describe("Web tab — style ladder", () => {
  it("offers only the wireframe style right after the first import", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);

    expect(button(container, /wireframe style/i)).toBeTruthy();
    expect(button(container, /choose yourself/i)).toBeUndefined();
  });

  it("offers the low-fi sketch after the wireframe style", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);

    fireEvent.click(button(container, /wireframe style/i)!);
    await completeImport(container, postSpy, 2);

    expect(button(container, /wireframe style/i)).toBeUndefined();
    expect(button(container, /choose yourself/i)).toBeTruthy();
    fireEvent.click(button(container, /low-fi sketch/i)!);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const body = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(body.sourceUrl).toBe(TARGET_URL);
    expect(body.colorMode).toBe("plugin");
    expect(body.typographyMode).toBe("lines");
    expect(body.textMode).toBe("website");
    expect(body.assetMode).toBe("placeholders");
  });

  it("offers smart placeholder text after the sketch, then only Choose yourself", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);

    fireEvent.click(button(container, /wireframe style/i)!);
    await completeImport(container, postSpy, 2);
    fireEvent.click(button(container, /low-fi sketch/i)!);
    await completeImport(container, postSpy, 3);

    fireEvent.click(button(container, /smart placeholder text/i)!);
    await completeImport(container, postSpy, 4);

    const body = JSON.parse(fetchMock.mock.calls[3][1].body);
    expect(body.colorMode).toBe("plugin");
    expect(body.typographyMode).toBe("plugin");
    expect(body.textMode).toBe("semantic");
    expect(body.assetMode).toBe("placeholders");
    expect(renderCalls(postSpy)[3][0].pluginMessage.data.textMode).toBe("semantic");

    expect(button(container, STYLE_BUTTON)).toBeUndefined();
    expect(button(container, /pick your own settings/i)).toBeTruthy();
    expect(settingsMock.setTextMode).not.toHaveBeenCalled();
  });

  it("starts the ladder over for a new import from the form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);
    fireEvent.click(button(container, /wireframe style/i)!);
    await completeImport(container, postSpy, 2);
    expect(button(container, /low-fi sketch/i)).toBeTruthy();

    fireEvent.input(urlInput(container), { target: { value: "https://linear.app" } });
    fireEvent.click(button(container, /^Import$/)!);
    await completeImport(container, postSpy, 3);

    expect(button(container, /wireframe style/i)).toBeTruthy();
  });

  it("scrolls to the options again when they are already open", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);
    fireEvent.click(button(container, /wireframe style/i)!);
    await completeImport(container, postSpy, 2);

    settingsMock.isExpanded = true;
    const before = panelProps.current.scrollRequest ?? 0;
    fireEvent.click(button(container, /choose yourself/i)!);

    expect(settingsMock.toggleExpanded).not.toHaveBeenCalled();
    expect(panelProps.current.scrollRequest).toBe(before + 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("opens More Options from Choose yourself without importing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse());
    vi.stubGlobal("fetch", fetchMock);
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);
    fireEvent.click(button(container, /wireframe style/i)!);
    await completeImport(container, postSpy, 2);

    fireEvent.click(button(container, /choose yourself/i)!);

    expect(settingsMock.toggleExpanded).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("Web tab — first-run instructions", () => {
  const STEPS = /Paste a website URL/;

  it("shows the three steps to someone who has not imported yet", () => {
    vi.stubGlobal("fetch", vi.fn());
    const { container } = render(<Web />);
    expect(container.textContent).toMatch(STEPS);
    expect(container.textContent).toMatch(/Website URL/);
  });

  it("hides the steps after the first import, even once the card is dismissed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);
    expect(container.textContent).not.toMatch(STEPS);

    const dismiss = Array.from(container.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Dismiss suggestions"
    ) as HTMLButtonElement;
    fireEvent.click(dismiss);

    expect(container.textContent).not.toMatch(STEPS);
    // The field keeps its label — only the how-to steps go.
    expect(container.textContent).toMatch(/Website URL/);
  });

  it("hides the steps from a returning user who already imported this month", () => {
    licenseState.current = { refresh: vi.fn(), license: freeLicense(3), isLoading: false, error: null };
    vi.stubGlobal("fetch", vi.fn());
    const { container } = render(<Web />);
    expect(container.textContent).not.toMatch(STEPS);
  });
});

describe("Web tab — free mode on the card", () => {
  it("shows no import count or Pro link after an import", async () => {
    licenseState.current = { refresh: vi.fn(), license: freeLicense(8), isLoading: false, error: null };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(successResponse()));
    const postSpy = vi.spyOn(parent, "postMessage");
    const { container } = render(<Web />);
    await completeImport(container, postSpy);

    expect(container.textContent).toMatch(CARD_TITLE);
    expect(container.textContent).not.toMatch(/imports? left|remaining|See Pro|Pro is unlimited/i);
  });
});
