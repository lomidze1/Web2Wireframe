/** @jsx h */
import { h, Fragment } from "preact";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useLicense } from "../shared/LicenseContext";

/** Longest the plugin waits for the license before opening anyway. */
export const LICENSE_WAIT_MS = 3000;

interface LicenseReadyGateProps {
  children: ComponentChildren;
  fallback: ComponentChildren;
}

/**
 * Keeps the loading screen up until the user's license has loaded. Without it
 * the UI first renders as if the user had never imported (first-run steps, no
 * allowance) and visibly rearranges a moment later. A failed request or the
 * wait limit also opens the app, so a slow API never locks the plugin — and
 * once open it stays open, even if a later retry clears the error.
 */
export default function LicenseReadyGate({ children, fallback }: LicenseReadyGateProps) {
  const { license, error } = useLicense();
  const [timedOut, setTimedOut] = useState(false);
  const openedRef = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), LICENSE_WAIT_MS);
    return () => clearTimeout(id);
  }, []);

  if (license !== null || error !== null || timedOut) openedRef.current = true;

  return <Fragment>{openedRef.current ? children : fallback}</Fragment>;
}
