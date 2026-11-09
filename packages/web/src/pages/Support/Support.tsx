import type { FormEvent, ReactElement, ChangeEvent } from "react";
import { useEffect, useState } from "react";
import styles from "./Support.module.scss";

interface FormData {
  name: string;
  email: string;
  topic: string;
  message: string;
}

interface SubmissionState {
  status: "idle" | "loading" | "success" | "error";
  message: string;
  title?: string;
  ticketId?: string;
  fieldErrors?: Record<string, string>;
}

const Support = (): ReactElement => {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    topic: "",
    message: "",
  });

  const [submission, setSubmission] = useState<SubmissionState>({
    status: "idle",
    message: "",
  });

  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  const dismissSuccess = (): void => {
    setSubmission({ status: "idle", message: "" });
    setCopyState("idle");
  };

  const focusFirstInvalidField = (
    fieldErrors: Record<string, string>
  ): void => {
    const order = ["name", "email", "topic", "message"];
    const firstInvalid = order.find((field) => field in fieldErrors);
    if (!firstInvalid) {
      return;
    }

    const element = document.getElementById(firstInvalid);
    if (element instanceof HTMLElement) {
      element.focus();
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  useEffect(() => {
    if (submission.status === "error" && submission.fieldErrors) {
      focusFirstInvalidField(submission.fieldErrors);
    }
  }, [submission.status, submission.fieldErrors]);

  useEffect(() => {
    if (copyState === "idle") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopyState("idle");
    }, 1600);

    return () => window.clearTimeout(timeout);
  }, [copyState]);

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ): void => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ): Promise<void> => {
    event.preventDefault();

    setSubmission({ status: "loading", message: "" });
    setCopyState("idle");

    try {
      // Relative path — nginx proxies /web/* to the backend in production;
      // Vite proxies it to :3002 in dev. An absolute URL would violate the
      // page's CSP (`connect-src 'self'`).
      const response = await fetch(`/web/support`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          topic: formData.topic,
          message: formData.message,
          figmaUserId: undefined, // Could be fetched from Figma plugin context
        }),
      });

      let data: {
        success?: boolean;
        message?: string;
        error?: string;
        errors?: Array<{ field: string; message: string }>;
        fields?: Record<string, string>;
        data?: { ticketId: string };
      } | null = null;

      try {
        data = (await response.json()) as typeof data;
      } catch {
        data = null;
      }

      if (!response.ok || !data?.success) {
        const fieldErrors =
          data?.fields ||
          (data?.errors || []).reduce<Record<string, string>>(
            (acc, current) => {
              if (current.field) {
                acc[current.field] = current.message;
              }
              return acc;
            },
            {}
          );

        setSubmission({
          status: "error",
          title: data?.error || "Something went wrong",
          message:
            data?.message ||
            "We couldn’t submit your request. Please try again.",
          fieldErrors,
        });
        return;
      }

      const ticketId = data.data?.ticketId ?? "";
      setSubmission({
        status: "success",
        title: "Request received",
        message:
          "Ticket ID: This is your reference number. Share it if you follow up so we can find your request fast.",
        ticketId,
      });

      // Reset form
      setFormData({
        name: "",
        email: "",
        topic: "",
        message: "",
      });
    } catch (error) {
      console.error("Support form error:", error);
      setSubmission({
        status: "error",
        title: "Something went wrong",
        message:
          error instanceof Error
            ? error.message
            : "We couldn’t submit your request. Please try again.",
      });
    }
  };

  const handleCopyTicketId = async (): Promise<void> => {
    if (!submission.ticketId) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(submission.ticketId);
      setCopyState("copied");
    } catch (error) {
      console.error("Copy ticket ID failed:", error);
      setCopyState("failed");
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroCard}>
            <div className={`${styles.sectionLabel} section-label`}>
              Support
            </div>
            <h1>How can we help?</h1>
            <p>
              Tell us what you need and we&apos;ll respond as soon as possible.
            </p>
            <p>
              <strong>We usually reply within 1-2 business day.</strong>
            </p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <div className={styles.formCard}>
            <h2>Contact support</h2>
            <p>
              Share a link and describe the issue.
            </p>

            {submission.status === "success" && (
              <div className={styles.successMessage}>
                <span className={styles.icon}>✓</span>
                <div>
                  <button
                    type="button"
                    className={styles.closeButton}
                    onClick={dismissSuccess}
                    aria-label="Dismiss success message"
                  >
                    ×
                  </button>
                  <p className={styles.title}>{submission.title}</p>
                  <p className={styles.detail}>{submission.message}</p>
                  <div className={styles.ticketRow}>
                    <span className={styles.ticketId}>
                      {submission.ticketId}
                    </span>
                    <div className={styles.bannerActions}>
                      <button
                        type="button"
                        className={styles.bannerButton}
                        onClick={handleCopyTicketId}
                        disabled={copyState === "copied"}
                      >
                        {copyState === "copied"
                          ? "Copied"
                          : copyState === "failed"
                          ? "Copy failed"
                          : "Copy"}
                      </button>
                      <button
                        type="button"
                        className={styles.bannerButton}
                        onClick={dismissSuccess}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {submission.status === "error" && (
              <div className={styles.errorMessage}>
                <span className={styles.icon}>⚠</span>
                <div>
                  <p className={styles.title}>
                    {submission.title || "Something went wrong"}
                  </p>
                  <p className={styles.detail}>{submission.message}</p>
                  {submission.fieldErrors &&
                    Object.keys(submission.fieldErrors).length > 0 && (
                      <ul className={styles.detail}>
                        {Object.entries(submission.fieldErrors).map(
                          ([field, message]) => {
                            const labelMap: Record<string, string> = {
                              name: "Name",
                              email: "Email",
                              topic: "Topic",
                              message: "Details",
                            };
                            const label = labelMap[field] || field;
                            return (
                              <li key={field}>
                                {label}: {message}
                              </li>
                            );
                          }
                        )}
                      </ul>
                    )}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formRow}>
                <label htmlFor="name">Name *</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Your name"
                  required
                  disabled={submission.status === "loading"}
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="email">Email *</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="your@email.com"
                  required
                  disabled={submission.status === "loading"}
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="topic">Topic *</label>
                <input
                  id="topic"
                  name="topic"
                  type="text"
                  value={formData.topic}
                  onChange={handleInputChange}
                  placeholder="Installation, import issue, feedback..."
                  required
                  disabled={submission.status === "loading"}
                />
              </div>
              <div className={styles.formRow}>
                <label htmlFor="message">Details *</label>
                <textarea
                  id="message"
                  name="message"
                  rows={5}
                  value={formData.message}
                  onChange={handleInputChange}
                  placeholder="Describe the issue or request. Include a URL if relevant. 
If you’re following up on a previous request, paste your Ticket ID (e.g. SUPPORT-ABCD1234)."
                  required
                  disabled={submission.status === "loading"}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submission.status === "loading"}
              >
                {submission.status === "loading"
                  ? "Submitting..."
                  : "Submit request"}
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Support;
