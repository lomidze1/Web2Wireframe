import { render } from "preact";
import { useState, useEffect } from "preact/hooks";
import { gateConsoleInProduction } from "@/shared/consoleGating";
import type { ExtensionSettings } from "@/shared/types";
import { DEFAULT_SETTINGS, VIEWPORTS } from "@/shared/constants";

gateConsoleInProduction();

function Options() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Load settings
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
      if (response) {
        setSettings(response);
      }
    });
  }, []);

  const handleSave = async () => {
    await chrome.runtime.sendMessage({
      type: "UPDATE_SETTINGS",
      settings,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
        {/* Backend URL */}
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
              The URL of your Web2Wireframe backend server
            </span>
          </div>

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
              It scopes your captures so they reach your plugin only.
            </span>
          </div>
        </section>

        {/* Capture Options */}
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
                  parseInt((e.target as HTMLSelectElement).value)
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
                    (e.target as HTMLInputElement).checked
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
                    (e.target as HTMLInputElement).checked
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
                    (e.target as HTMLInputElement).checked
                  )
                }
              />
              Compress captured data
            </label>
          </div>
        </section>

        {/* Save Button */}
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
