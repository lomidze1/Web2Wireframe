import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { RenderingProgress } from "../components/renderingLoader/RenderingLoader";
import {
  DEFAULT_CAPTURE_MS,
  medianEstimate,
  renderPhase,
} from "../../utils/importProgress";

/**
 * Which tab's clock we are keeping. Estimates are stored per kind: a `.w2w`
 * file decodes in a second or two while a URL capture takes tens of seconds,
 * and one shared history would have each poisoning the other's estimate.
 */
export type ImportKind = "url" | "html" | "screenshot" | "file";

/**
 * One import's worth of loader state, shared by all four import tabs.
 *
 * The tabs used to raise the loader only once the sandbox started rendering,
 * which left the capture — the long half — behind a 12px inline spinner. Here
 * the loader owns the whole run: it opens on click, animates an estimate while
 * the request is in flight, hands over to the sandbox's real milestones, and
 * remembers how long the capture took so the next estimate is better.
 */
export interface ImportProgressController {
  isVisible: boolean;
  progress: RenderingProgress | undefined;
  /** Raise the loader and start the capture clock. Returns the abort controller. */
  beginCapture: (step: string) => AbortController;
  /** Update the message without disturbing the estimate (local decode steps). */
  setCaptureStep: (step: string) => void;
  /** A USABLE response landed — bank the duration for the next estimate.
   *  Call it after the auth/quota/ok guards: a 200ms rejection is not a
   *  capture time, and a median of those freezes the next import's ring. */
  finishCapture: () => void;
  /** Feed a `render-progress` message from the sandbox. */
  applyRender: (data: {
    step: string;
    percent: number;
    isComplete?: boolean;
  }) => void;
  /** Abort the in-flight capture and close. */
  cancel: () => void;
  /** Close without aborting (success, error, reset). */
  hide: () => void;
}

export function useImportProgress(kind: ImportKind): ImportProgressController {
  const [isVisible, setIsVisible] = useState(false);
  const [progress, setProgress] = useState<RenderingProgress | undefined>();

  /** Median of this user's recent captures OF THIS KIND — see main.ts
   *  `w2w_import_timing`. */
  const estimateRef = useRef(DEFAULT_CAPTURE_MS);
  const startedRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    parent.postMessage({ pluginMessage: { type: "load-timing" } }, "*");
    const onMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type !== "timing-loaded") return;
      estimateRef.current = medianEstimate(msg.data?.[kind] ?? []);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [kind]);

  const beginCapture = useCallback((step: string) => {
    const controller = new AbortController();
    abortRef.current = controller;
    startedRef.current = Date.now();
    setIsVisible(true);
    setProgress({
      step,
      percent: 0,
      phase: "capture",
      startedAt: startedRef.current,
      estimateMs: estimateRef.current,
    });
    return controller;
  }, []);

  const setCaptureStep = useCallback((step: string) => {
    setProgress((prev) => (prev ? { ...prev, step } : prev));
  }, []);

  const finishCapture = useCallback(() => {
    if (!startedRef.current) return;
    const captureMs = Date.now() - startedRef.current;
    startedRef.current = 0;
    // The controller deliberately stays live. The loader is still in `capture`
    // phase here — and so still offering Cancel — while the tab reads the body,
    // decodes SFNT names and cuts assets. Dropping the controller made that
    // Cancel a no-op: the overlay closed, the tab said "Import canceled", and
    // the wireframe rendered anyway. `hide()`/`cancel()` clear it.
    parent.postMessage(
      { pluginMessage: { type: "save-timing", data: { kind, captureMs } } },
      "*"
    );
  }, [kind]);

  const applyRender = useCallback(
    (data: { step: string; percent: number; isComplete?: boolean }) => {
      setIsVisible(true);
      setProgress({
        step: data.step,
        percent: data.percent,
        isComplete: data.isComplete,
        phase: renderPhase(data.percent),
      });
    },
    []
  );

  const hide = useCallback(() => {
    abortRef.current = null;
    startedRef.current = 0;
    setIsVisible(false);
    setProgress(undefined);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    startedRef.current = 0;
    setIsVisible(false);
    setProgress(undefined);
  }, []);

  return {
    isVisible,
    progress,
    beginCapture,
    setCaptureStep,
    finishCapture,
    applyRender,
    cancel,
    hide,
  };
}
