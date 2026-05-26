import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { gateConsoleInProduction } from "@/shared/consoleGating";
import type { ExtensionSettings, SessionState } from "@/shared/types";
import { DEFAULT_SETTINGS, VIEWPORTS } from "@/shared/constants";
import {
  AuthExpiredError,
  redeemPairingCode,
  revokeSession,
} from "@/shared/licenseClient";
import { getSession } from "@/shared/session";
import { inDaysPhrase, planLabel } from "@/popup/components/planHelpers";

gateConsoleInProduction();

/**
 * Status of the most recent `redeemPairingCode` call. `idle` is the resting
 * state; the success / error variants are surfaced under the pairing input
 * so users see what happened without scrolling.
 */
type RedeemStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; email: string | null }
  | { kind: "error"; message: string };

function Options() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [session, setSession] = useState<SessionState | null>(null);
  const [redeemStatus, setRedeemStatus] = useState<RedeemStatus>({ kind: "idle" });

  // Load settings + any existing session on mount.
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
      if (response) setSettings(response);
    });
    void getSession().then(setSession);
  }, []);

  const handleSave = async () => {
    const incomingPairingCode = settings.pairingCode.trim();
    const previousPairingCode = DEFAULT_SETTINGS.pairingCode; // unused after first save; informational only

    // 1. Persist settings unconditionally. Capture-side keeps working
    //    regardless of whether the pairing redemption succeeds.
    await chrome.runtime.sendMessage({
      type: "UPDATE_SETTINGS",
      settings,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    // 2. Redeem only when we're unpaired AND a non-empty code is present.
    //    Re-redeeming the same code on a repeat Save is a backend 401
    //    (codes are one-time-use); we avoid that here so the success
    //    banner doesn't immediately flip to an error.
    if (session) return;
    if (incomingPairingCode.length === 0) return;
    void previousPairingCode; // silence "unused" if linter complains

    setRedeemStatus({ kind: "loading" });
    try {
      const result = await redeemPairingCode(incomingPairingCode);
      setRedeemStatus({ kind: "success", email: result.email });
      // Pull the fresh session into local state so the UI flips to the
      // paired card without a page reload.
      setSession({
        sessionToken: result.sessionToken,
        expiresAt: new Date(result.expiresAt).getTime(),
        figmaUserId: result.figmaUserId,
        email: result.email,
        cachedLicense: result.license,
      });
    } catch (err) {
      if (err instanceof AuthExpiredError) {
        setRedeemStatus({
          kind: "error",
          message:
            "Pairing code is invalid or expired. Request a fresh one from the Figma plugin.",
        });
        return;
      }
      setRedeemStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Couldn't reach the pairing server. Try again in a moment.",
      });
    }
  };

  const handleSignOut = async () => {
    await revokeSession();
    setSession(null);
    setRedeemStatus({ kind: "idle" });
    // Clear the local pairingCode field too so the next pair attempt
    // starts from a blank input.
    setSettings((prev) => ({ ...prev, pairingCode: "" }));
    await chrome.runtime.sendMessage({
      type: "UPDATE_SETTINGS",
      settings: { ...settings, pairingCode: "" },
    });
  };

  const handleChange = (key: keyof ExtensionSettings, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div class="options-page">
      <header class="options-header">
        <h1>Web2Wireframe Settings</h1>
      </header>

      <main class="options-content">
        {/* Backend connection / pairing */}
        <section class="settings-section">
          <h2>Backend Connection</h2>
          <div class="form-group">
            <label htmlFor="backendUrl">Backend URL</label>
            <input
              type="text"
              id="backendUrl"
              value={settings.backendUrl}
              onChange={(e) =>
                handleChange("backendUrl", (e.target as HTMLInputElement).value)
              }
              placeholder="http://localhost:3002"
            />
            <span class="help-text">
              The URL of your Web2Wireframe backend server.
            </span>
          </div>

          {session ? (
            <div class="paired-card">
              <div class="paired-card-info">
                <strong>Signed in as {session.email ?? session.figmaUserId}</strong>
                {session.cachedLicense && (
                  <span class="paired-card-meta">
                    {planLabel(session.cachedLicense)} ·{" "}
                    {session.cachedLicense.plan === "pro"
                      ? `expires ${inDaysPhrase(session.cachedLicense.cycleEndsAt)}`
                      : `resets ${inDaysPhrase(session.cachedLicense.cycleEndsAt)}`}
                  </span>
                )}
              </div>
              <button
                class="btn btn-secondary"
                type="button"
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          ) : (
            <div class="form-group">
              <label htmlFor="pairingCode">Pairing Code</label>
              <input
                type="text"
                id="pairingCode"
                value={settings.pairingCode}
                onChange={(e) =>
                  handleChange(
                    "pairingCode",
                    (e.target as HTMLInputElement).value.trim().toUpperCase(),
                  )
                }
                placeholder="ABC123"
              />
              <span class="help-text">
                Open the Figma plugin's Browser Extension tab to get a code.
                Saving the code signs you in.
              </span>
              {redeemStatus.kind === "loading" && (
                <span class="redeem-status">Signing in…</span>
              )}
              {redeemStatus.kind === "success" && (
                <span class="redeem-status success">
                  ✓ Signed in{redeemStatus.email ? ` as ${redeemStatus.email}` : ""}.
                </span>
              )}
              {redeemStatus.kind === "error" && (
                <span class="redeem-status error">{redeemStatus.message}</span>
              )}
            </div>
          )}
        </section>

        {/* Capture options */}
        <section class="settings-section">
          <h2>Capture Options</h2>

          <div class="form-group">
            <label htmlFor="defaultViewport">Default Viewport</label>
            <select
              id="defaultViewport"
              value={settings.defaultViewport}
              onChange={(e) =>
                handleChange(
                  "defaultViewport",
                  parseInt((e.target as HTMLSelectElement).value),
                )
              }
            >
              {VIEWPORTS.map((vp) => (
                <option key={vp.width} value={vp.width}>
                  {vp.label} ({vp.width}px)
                </option>
              ))}
            </select>
          </div>

          <div class="form-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.captureAssets}
                onChange={(e) =>
                  handleChange(
                    "captureAssets",
                    (e.target as HTMLInputElement).checked,
                  )
                }
              />
              Capture images and SVGs
            </label>
          </div>

          <div class="form-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.captureFonts}
                onChange={(e) =>
                  handleChange(
                    "captureFonts",
                    (e.target as HTMLInputElement).checked,
                  )
                }
              />
              Extract font information
            </label>
          </div>

          <div class="form-group checkbox">
            <label>
              <input
                type="checkbox"
                checked={settings.compressData}
                onChange={(e) =>
                  handleChange(
                    "compressData",
                    (e.target as HTMLInputElement).checked,
                  )
                }
              />
              Compress captured data
            </label>
          </div>
        </section>

        {/* Save button */}
        <div class="actions">
          <button class="btn btn-primary" onClick={handleSave}>
            Save Settings
          </button>
          {saved && <span class="saved-indicator">Saved!</span>}
        </div>
      </main>

      <footer class="options-footer">
        <a
          href="https://web2wireframe.design"
          target="_blank"
          rel="noopener noreferrer"
        >
          web2wireframe.design
        </a>
      </footer>
    </div>
  );
}

render(<Options />, document.getElementById("app")!);
