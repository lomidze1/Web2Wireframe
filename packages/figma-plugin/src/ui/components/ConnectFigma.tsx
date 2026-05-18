/** @jsx h */
import { h } from "preact";
import { useState } from "preact/hooks";
import { connectFigma } from "../shared/licenseClient";

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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        height: "100%",
        padding: "32px",
        textAlign: "center",
        boxSizing: "border-box",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "15px" }}>Connect your Figma account</h2>
      <p style={{ margin: 0, fontSize: "12px", opacity: 0.7, lineHeight: 1.5 }}>
        Web2Wireframe verifies your Figma identity before managing imports and
        your plan. This opens a Figma sign-in page in your browser.
      </p>

      {status === "connecting" ? (
        <p style={{ margin: "8px 0 0", fontSize: "12px", opacity: 0.7 }}>
          Waiting for authorization in your browser…
        </p>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          style={{
            marginTop: "8px",
            padding: "8px 20px",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            border: "none",
            borderRadius: "6px",
            background: "var(--accent, #0d99ff)",
            color: "#fff",
          }}
        >
          {status === "error" ? "Try again" : "Connect Figma"}
        </button>
      )}

      {status === "error" && (
        <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#d33" }}>
          {error}
        </p>
      )}
    </div>
  );
}
