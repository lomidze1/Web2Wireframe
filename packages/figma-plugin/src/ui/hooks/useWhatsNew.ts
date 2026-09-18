import { useEffect, useRef, useState } from "preact/hooks";
import type { License } from "../shared/licenseClient";
import { NEWS_ID, shouldShowNews } from "../shared/whatsNew";

/** `undefined` = the sandbox has not answered yet. */
type SeenId = string | null | undefined;

/**
 * Drives the one-time "What's new" modal: asks the sandbox what this user has
 * already seen, decides ONCE (the license re-fetch after every import must not
 * pop the modal on top of the import's next-step card), and records the news as
 * seen the moment it is shown.
 */
export function useWhatsNew(
  license: License | null,
  blocked: boolean
): { isOpen: boolean; close: () => void } {
  const [seenId, setSeenId] = useState<SeenId>(undefined);
  const [isOpen, setIsOpen] = useState(false);
  const decidedRef = useRef(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === "news-seen-loaded") setSeenId(msg.data?.id ?? null);
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "load-news-seen" } }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (decidedRef.current) return;
    // Wait for both inputs: the stored id and the first license.
    if (seenId === undefined || !license) return;
    decidedRef.current = true;
    if (!shouldShowNews({ seenId, license, blocked })) return;
    setIsOpen(true);
    parent.postMessage(
      { pluginMessage: { type: "save-news-seen", data: { id: NEWS_ID } } },
      "*"
    );
  }, [seenId, license, blocked]);

  return { isOpen, close: () => setIsOpen(false) };
}
