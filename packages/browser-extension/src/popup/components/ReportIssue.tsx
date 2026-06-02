import { useState } from "preact/hooks";
import type { ExtensionMessage } from "@/shared/types";

interface Props {
  url: string;
  email: string | null;
  figmaUserId?: string;
  statsSummary?: string;
  /** Pre-filled description text (e.g. the capture warning) so the user can
   *  send a report without retyping what went wrong. */
  prefill?: string;
}

type Status = "idle" | "sending" | "sent" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Post-capture "Report a problem" affordance shown on the success screen.
 * Collapsed: a single text link. Expanded: a short form (description + email
 * if we don't already have one). Submission is delegated to the background
 * service worker (REPORT_ISSUE), which POSTs to /web/support — the popup
 * itself can't reach that route because website CORS rejects extension origins.
 */
export function ReportIssue({
  url,
  email,
  figmaUserId,
  statsSummary,
  prefill,
}: Props): preact.JSX.Element {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(prefill ?? "");
  const [emailInput, setEmailInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const needsEmail = !email;
  const effectiveEmail = (email ?? emailInput).trim();
  const canSubmit =
    description.trim().length >= 10 &&
    (!needsEmail || EMAIL_RE.test(effectiveEmail)) &&
    status !== "sending";

  const submit = async () => {
    setStatus("sending");
    setError("");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "REPORT_ISSUE",
        payload: {
          url,
          email: effectiveEmail,
          description: description.trim(),
          figmaUserId,
          statsSummary,
        },
      } as ExtensionMessage);

      if (response?.success) {
        setStatus("sent");
      } else {
        throw new Error(response?.error || "Failed to send report");
      }
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Failed to send report");
    }
  };

  if (status === "sent") {
    return (
      <div class="report-issue report-issue--thanks">
        Thanks for reporting this issue. We'll do our best to fix it as soon as
        possible.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        class="report-issue__toggle"
        onClick={() => setOpen(true)}
      >
        Something wrong? Report a problem
      </button>
    );
  }

  return (
    <div class="report-issue">
      <div class="report-issue__title">Report a problem</div>
      <div class="report-issue__url" title={url}>
        Reporting: {url || "this page"}
      </div>
      <textarea
        class="report-issue__textarea"
        placeholder="Describe what went wrong (e.g. layout broken, images missing, wrong fonts)…"
        value={description}
        onInput={(e) =>
          setDescription((e.target as HTMLTextAreaElement).value)
        }
        rows={4}
      />
      {needsEmail && (
        <input
          class="report-issue__email"
          type="email"
          placeholder="Your email (so we can follow up)"
          value={emailInput}
          onInput={(e) => setEmailInput((e.target as HTMLInputElement).value)}
        />
      )}
      {status === "error" && (
        <div class="report-issue__error">{error}</div>
      )}
      <div class="report-issue__actions">
        <button
          class="btn btn-secondary"
          onClick={() => {
            setOpen(false);
            setStatus("idle");
            setError("");
          }}
          disabled={status === "sending"}
        >
          Cancel
        </button>
        <button class="btn btn-primary" onClick={submit} disabled={!canSubmit}>
          {status === "sending" ? "Sending…" : "Send report"}
        </button>
      </div>
    </div>
  );
}
