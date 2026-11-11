import { useState, useEffect } from "preact/hooks";
import type { ExtensionMessage, CaptureOptions, PersistedCaptureState } from "@/shared/types";
import type { CaptureStats } from "@w2w/shared";
import type { SessionState } from "@/shared/types";
import { STORAGE_KEYS } from "@/shared/constants";
import { getSession } from "@/shared/session";
import { fetchMyLicense } from "@/shared/licenseClient";
import {
  VisualFlow,
  ViewportsSection,
  CaptureButtons,
  Footer,
  HelpModal,
  IdentityModal,
  CaptureStatsWarning,
  ReportIssue,
} from "./components";
import { buildCaptureWarningText } from "./components/CaptureStatsWarning";

type CaptureStatus = "idle" | "capturing" | "success" | "error";

interface CaptureState {
  status: CaptureStatus;
  progress: number;
  message: string;
  error?: string;
  stats?: CaptureStats;
}

/**
 * Default viewport set on first open. The user can toggle other viewports
 * via the ViewportsSection above the Capture button; SaveOptions is no
 * longer surfaced — captures always produce a local .w2w file.
 */
const DEFAULT_VIEWPORTS = [1440];

/**
 * One-line summary of skipped-image stats, attached to a problem report so we
 * can see what the capture dropped without the full payload.
 */
function summarizeStats(stats: CaptureStats): string | undefined {
  if (stats.skippedImageCount <= 0) return undefined;
  return `${stats.skippedImageCount} image(s) skipped`;
}

/**
 * True when a persisted capture screen has already had its moment and should
 * not be restored again.
 *
 * The lifecycle is persisted because the debugger infobar force-closes the
 * popup mid-capture — without it, reopening would lose live progress. But a
 * *finished* capture has no such claim: once a popup has rendered it (and
 * stamped `seen`), any later open should start on the capture form rather than
 * the old "Page captured successfully" screen, which hides the Capture button
 * entirely. An in-flight `capturing` state is never stale.
 */
export function isStaleCapture(
  persisted: PersistedCaptureState | undefined,
): boolean {
  if (!persisted) return false;
  return persisted.status !== "capturing" && persisted.seen === true;
}

/**
 * Read the active tab's live viewport width for the "Browser (Npx)" row.
 * `window.innerWidth` in the side panel is the panel's width, so we run it in
 * the tab via scripting. Returns null on restricted pages (chrome://, store).
 */
async function fetchBrowserWidth(tabId: number): Promise<number | null> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.innerWidth,
    });
    const w = results[0]?.result;
    return typeof w === "number" && w > 0 ? Math.round(w) : null;
  } catch {
    return null;
  }
}

export function App() {
  const [state, setState] = useState<CaptureState>({
    status: "idle",
    progress: 0,
    message: "",
  });
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [viewports, setViewports] = useState<number[]>(DEFAULT_VIEWPORTS);
  // "Browser (Npx)" row — the active tab's live viewport width. null hides the
  // row (restricted page); browserSelected is off by default like the others.
  const [browserWidth, setBrowserWidth] = useState<number | null>(null);
  const [browserSelected, setBrowserSelected] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  // Full session — drives the leftmost identity icon (sign-in vs sign-out).
  const [session, setSession] = useState<SessionState | null>(null);

  useEffect(() => {
    // Active tab + its viewport width; refreshed on tab switch so "Browser"
    // and the capture target always reflect the tab the user is looking at.
    const loadActiveTab = () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab) return;
        setCurrentTab(tab);
        if (tab.id != null) {
          void fetchBrowserWidth(tab.id).then(setBrowserWidth);
        } else {
          setBrowserWidth(null);
        }
      });
    };
    loadActiveTab();
    chrome.tabs.onActivated.addListener(loadActiveTab);
    // Live-update the "Browser" width when the user resizes the window.
    chrome.windows.onBoundsChanged.addListener(loadActiveTab);

    // Initial session read, then refresh the cached license in the
    // background. fetchMyLicense writes through `updateCachedLicense`, which
    // trips the storage listener below. Failures stay silent: the cached
    // value simply stands.
    void getSession().then((s) => {
      setSession(s);
      if (s) void fetchMyLicense().catch(() => undefined);
    });

    // Restore the capture lifecycle: Chrome closes the action popup once the
    // debugger infobar takes focus, so on reopen we paint the persisted
    // progress/success/error instead of resetting to idle. A finished screen
    // an earlier popup already showed is dropped here instead — see
    // `isStaleCapture`.
    void chrome.storage.session
      .get(STORAGE_KEYS.LAST_CAPTURE)
      .then((res) => {
        const persisted = res[STORAGE_KEYS.LAST_CAPTURE] as
          | PersistedCaptureState
          | undefined;
        if (isStaleCapture(persisted)) {
          void chrome.storage.session.remove(STORAGE_KEYS.LAST_CAPTURE);
          return;
        }
        if (persisted) setState(persisted);
      });

    // Refresh whenever shared/session.ts writes a new SessionState
    // (redeem, refresh, fetchMyLicense, revoke, etc.) in local storage, and
    // mirror the background-owned capture lifecycle from session storage so a
    // reopened popup goes live (progress → success) on its own.
    const onStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: chrome.storage.AreaName,
    ) => {
      if (
        area === "local" &&
        Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.SESSION)
      ) {
        const next = changes[STORAGE_KEYS.SESSION].newValue as
          | SessionState
          | undefined;
        setSession(next ?? null);
      }
      if (
        area === "session" &&
        Object.prototype.hasOwnProperty.call(changes, STORAGE_KEYS.LAST_CAPTURE)
      ) {
        const next = changes[STORAGE_KEYS.LAST_CAPTURE].newValue as
          | PersistedCaptureState
          | undefined;
        setState(next ?? { status: "idle", progress: 0, message: "" });
      }
    };
    chrome.storage.onChanged.addListener(onStorageChange);

    const handleMessage = (message: ExtensionMessage) => {
      if (message.type === "CAPTURE_PROGRESS") {
        setState((prev) => ({
          ...prev,
          progress: message.progress,
          message: message.status,
        }));
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.storage.onChanged.removeListener(onStorageChange);
      chrome.tabs.onActivated.removeListener(loadActiveTab);
      chrome.windows.onBoundsChanged.removeListener(loadActiveTab);
    };
  }, []);

  // Stamp a finished screen as seen the moment it goes on screen, so the next
  // open retires it (see `isStaleCapture`). This has to happen here rather
  // than on popup close: the popup's teardown is abrupt — Chrome gives it no
  // chance to finish an async storage write — whereas a render is a moment we
  // are guaranteed to be alive for. Covers both paths into a terminal state:
  // this popup ran the capture, or it picked the result up from storage.
  useEffect(() => {
    const { status } = state;
    if (status !== "success" && status !== "error") return;
    const persisted: PersistedCaptureState = {
      status,
      progress: state.progress,
      message: state.message,
      error: state.error,
      stats: state.stats,
      seen: true,
    };
    void chrome.storage.session.set({ [STORAGE_KEYS.LAST_CAPTURE]: persisted });
    // Only on the transition — the field values are read fresh each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  // Final widths sent to capture: selected presets + the browser width (when
  // its row is on), de-duplicated so a width is never captured twice.
  const captureViewports = Array.from(
    new Set([
      ...viewports,
      ...(browserSelected && browserWidth != null ? [browserWidth] : []),
    ]),
  ).sort((a, b) => b - a);

  // Selecting a preset that equals the browser width drops the browser row
  // (mutual exclusivity — one row per width).
  const handleViewportsChange = (next: number[]) => {
    setViewports(next);
    if (browserSelected && browserWidth != null && next.includes(browserWidth)) {
      setBrowserSelected(false);
    }
  };

  // Toggle the browser row; selecting it drops a preset of the same width.
  const handleBrowserToggle = () => {
    if (browserWidth == null) return;
    if (browserSelected) {
      if (viewports.length === 0) return; // keep at least one selected
      setBrowserSelected(false);
    } else {
      setBrowserSelected(true);
      if (viewports.includes(browserWidth)) {
        setViewports(viewports.filter((v) => v !== browserWidth));
      }
    }
  };

  const handleCapture = async () => {
    if (!currentTab?.id) return;

    setState({
      status: "capturing",
      progress: 0,
      message: "Starting capture...",
    });

    try {
      const options: CaptureOptions = { viewports: captureViewports };
      const response = await chrome.runtime.sendMessage({
        type: "CAPTURE_PAGE_W2W",
        tabId: currentTab.id,
        options,
      } as ExtensionMessage);

      if (response.success) {
        // captureStats only present when assets were extracted; absent for
        // captureAssets=false runs, in which case the warning UI stays hidden.
        const stats: CaptureStats | undefined = response.data?.captureStats;
        setState({
          status: "success",
          progress: 100,
          message: "Capture complete!",
          stats,
        });
      } else {
        throw new Error(response.error || "Capture failed");
      }
    } catch (error) {
      setState({
        status: "error",
        progress: 0,
        message: "",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleSelectArea = async () => {
    if (!currentTab?.id) return;

    try {
      // The popup no longer exposes a save-target toggle; capture always
      // writes a local .w2w file. Background script reads this key and
      // skips the upload pipeline.
      await chrome.storage.session.set({
        pendingSaveOption: "local",
      });

      const response = await chrome.runtime.sendMessage({
        type: "START_SELECTION",
        tabId: currentTab.id,
        options: { viewports: captureViewports },
      });

      if (!response?.success) {
        throw new Error(response?.error || "Failed to start selection");
      }

      // Close the popup so the user can interact with the page's inspect-mode
      // overlay (the popup would lose focus and close anyway).
      window.close();
    } catch (error) {
      setState({
        status: "error",
        progress: 0,
        message: "",
        error: error instanceof Error ? error.message : "Could not start selection. Please try again.",
      });
    }
  };

  // Identity icon now opens the IdentityModal instead of running OAuth
  // inline. Inline OAuth was killed by Chrome closing the popup the
  // moment the OAuth tab took focus; IdentityModal dispatches a message
  // to the background service worker, which runs the 3-min poll on its
  // own and persists the session via chrome.storage.local.
  const handleIdentityClick = () => setShowIdentityModal(true);

  const canCapture =
    currentTab?.url &&
    !currentTab.url.startsWith("chrome://") &&
    !currentTab.url.startsWith("chrome-extension://");

  const isCapturing = state.status === "capturing";

  return (
    <div class="popup">
      <header class="popup-header">
        <img src="/icons/icon128.png" alt="W2W" class="logo" />
        <h1>Web2Wireframe</h1>
      </header>

      <main class="popup-content">
        <VisualFlow />

        {state.status !== "success" && (
          <>
            <ViewportsSection
              viewports={viewports}
              onChange={handleViewportsChange}
              disabled={isCapturing}
              browserWidth={browserWidth}
              browserSelected={browserSelected}
              onBrowserToggle={handleBrowserToggle}
            />

            <CaptureButtons
              isCapturing={isCapturing}
              canCapture={!!canCapture}
              onCapture={handleCapture}
              onSelectArea={handleSelectArea}
            />
          </>
        )}

        {state.status === "capturing" && (
          <div class="progress-section">
            <div class="progress-bar">
              <div class="progress-fill" style={{ width: `${state.progress}%` }} />
            </div>
            <span class="progress-text">{state.message}</span>
          </div>
        )}

        {state.status === "error" && (
          <div class="error-message">
            <span>{state.error}</span>
          </div>
        )}

        {state.status === "success" && (
          <div class="success-section">
            <div class="success-message">Page captured successfully!</div>
            {state.stats && state.stats.skippedImageCount > 0 && (
              <CaptureStatsWarning stats={state.stats} />
            )}
            <ReportIssue
              url={currentTab?.url ?? ""}
              email={session?.email ?? null}
              figmaUserId={session?.figmaUserId}
              statsSummary={state.stats ? summarizeStats(state.stats) : undefined}
              prefill={
                state.stats && state.stats.skippedImageCount > 0
                  ? buildCaptureWarningText(state.stats)
                  : undefined
              }
            />
            <div class="thanks-message">
              Thanks for using Web2Wireframe!
            </div>
            <button
              class="btn btn-secondary"
              onClick={() => {
                setState({ status: "idle", progress: 0, message: "" });
                void chrome.storage.session.remove(STORAGE_KEYS.LAST_CAPTURE);
              }}
            >
              Back to Main
            </button>
          </div>
        )}

        {!canCapture && state.status === "idle" && (
          <div class="warning-message">
            Cannot capture this page. Try a regular website.
          </div>
        )}
      </main>

      <Footer
        onHelpClick={() => setShowHelpModal(true)}
        session={session}
        onIdentityClick={handleIdentityClick}
      />

      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
      <IdentityModal
        isOpen={showIdentityModal}
        onClose={() => setShowIdentityModal(false)}
        session={session}
      />
    </div>
  );
}
