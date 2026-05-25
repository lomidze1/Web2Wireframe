import { useState } from "preact/hooks";
import { CloseIcon, DocsIcon, ContactIcon, PluginIcon, PricingIcon, MailIcon } from "./Icons";
import { API_URL, STORAGE_KEYS } from "../../shared/constants";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const [email, setEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const openLink = (url: string) => (e: Event) => {
    e.preventDefault();
    chrome.tabs.create({ url, active: false });
  };

  if (!isOpen) return null;

  const handleSubscribe = async (e: Event) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    setSubscribeStatus("loading");

    // User may have overridden the backend in Options — honor that, fall
    // back to the prod default constant if no override is stored.
    let backendUrl = API_URL;
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const settings = stored[STORAGE_KEYS.SETTINGS] as { backendUrl?: string } | undefined;
      if (settings?.backendUrl) backendUrl = settings.backendUrl;
    } catch {
      // Use default
    }

    try {
      const response = await fetch(`${backendUrl}/api/newsletter/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setSubscribeStatus("success");
        setEmail("");
        setTimeout(() => setSubscribeStatus("idle"), 3000);
      } else {
        setSubscribeStatus("error");
        setTimeout(() => setSubscribeStatus("idle"), 3000);
      }
    } catch {
      setSubscribeStatus("error");
      setTimeout(() => setSubscribeStatus("idle"), 3000);
    }
  };

  const handleOverlayClick = (e: Event) => {
    if ((e.target as HTMLElement).classList.contains("modal-overlay")) {
      onClose();
    }
  };

  return (
    <div class="modal-overlay" onClick={handleOverlayClick}>
      <div class="modal">
        <div class="modal-header">
          <h2>Help & Resources</h2>
          <button class="modal-close" onClick={onClose} type="button" aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div class="modal-content">
          {/* Links */}
          <div class="help-links">
            <a
              href="https://web2wireframe.design/docs"
              onClick={openLink("https://web2wireframe.design/docs")}
              class="help-link"
            >
              <span class="help-link-icon"><DocsIcon /></span>
              <span>See our Docs</span>
            </a>

            <a
              href="https://www.web2wireframe.design/support"
              onClick={openLink("https://www.web2wireframe.design/support")}
              class="help-link"
            >
              <span class="help-link-icon"><ContactIcon /></span>
              <span>Contact us</span>
            </a>

            <a
              href="https://www.figma.com/community/plugin/web2wireframe"
              onClick={openLink("https://www.figma.com/community/plugin/web2wireframe")}
              class="help-link"
            >
              <span class="help-link-icon"><PluginIcon /></span>
              <span>Open Figma Plugin</span>
            </a>

            <a
              href="https://web2wireframe.design/pricing"
              onClick={openLink("https://web2wireframe.design/pricing")}
              class="help-link"
            >
              <span class="help-link-icon"><PricingIcon /></span>
              <span>Pricing</span>
            </a>
          </div>

          {/* Newsletter */}
          <div class="newsletter-section">
            <h3>Subscribe to news</h3>
            <form class="newsletter-form" onSubmit={handleSubscribe}>
              <div class="newsletter-input-wrapper">
                <span class="newsletter-icon"><MailIcon /></span>
                <input
                  type="email"
                  class="newsletter-input"
                  placeholder="Enter your email"
                  value={email}
                  onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
                  disabled={subscribeStatus === "loading"}
                />
              </div>
              <button
                type="submit"
                class="btn btn-primary newsletter-btn"
                disabled={subscribeStatus === "loading" || !email}
              >
                {subscribeStatus === "loading" ? "..." : "Subscribe"}
              </button>
            </form>
            {subscribeStatus === "success" && (
              <p class="newsletter-success">Thanks for subscribing!</p>
            )}
            {subscribeStatus === "error" && (
              <p class="newsletter-error">Subscription failed. Please try again.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
