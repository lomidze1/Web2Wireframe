/** @jsx h */
import { h } from "preact";
import { useState } from "preact/hooks";
import { connectFigma } from "../shared/licenseClient";
import styles from "./ConnectFigma.css";

/**
 * Connection gate shown when no valid plugin token is held. Runs the Figma
 * OAuth flow so the backend can verify the user's identity before issuing a
 * token — the plugin no longer self-asserts a figmaUserId.
 */
export default function ConnectFigma({
  onConnected,
}: {
  onConnected: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [error, setError] = useState("");

  const handleConnect = async () => {
    setStatus("connecting");
    setError("");
    try {
      await connectFigma();
      onConnected();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Connection failed");
    }
  };

  return (
    <div class={styles.connectScreen}>
      <h2 class={styles.connectHeading}>Connect your Figma account</h2>
      <p class={styles.connectText}>
        Web2Wireframe verifies your Figma identity before managing imports and
        your plan. This opens a Figma sign-in page in your browser.
      </p>

      {status === "connecting" ? (
        <p class={styles.connectText}>
          Waiting for authorization in your browser…
        </p>
      ) : (
        <button
          type="button"
          class={styles.connectButton}
          onClick={handleConnect}
        >
          {status === "error" ? "Try again" : "Connect Figma"}
        </button>
      )}

      {status === "error" && <p class={styles.connectError}>{error}</p>}
    </div>
  );
}
