/** @jsx h */
import { h } from "preact";
import styles from "./BrowserExtension.css";

export default function BrowserExtension() {
  const handleInstall = () => {
    // Open Chrome Web Store or extension URL
    window.open("https://chrome.google.com/webstore", "_blank");
  };

  return (
    <div class={styles.extensionContainer}>
      <div class={styles.extensionTitle}>
        Connect the Plugin with your Browser
      </div>

      <div class={styles.extensionDescription}>
        Capture webpages directly from your browser and they will appear here.
        Import them into Figma when you want.
      </div>

      <div class={styles.extensionBenefits}>
        <ul>
          <li>Perfect for private or local webpages</li>
          <li>Pages behind a log-in session</li>
          <li>Removing banners and more...</li>
        </ul>
      </div>

      <div class={styles.extensionSubtext}>
        Works on Chrome, Edge, Brave, Arc, Opera, Vivaldi, and Yandex browsers.
      </div>

      <button class={styles.extensionBtn} onClick={handleInstall}>
        Install browser extension
      </button>
    </div>
  );
}
