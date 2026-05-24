import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { checkoutLinks } from "../data/links";
import styles from "./Footer.module.scss";

const Footer = (): ReactElement => (
  <footer className={styles.footer}>
    <div className={`container ${styles.inner}`}>
      <Link to="/" className={styles.brandBlock}>
        <div className={styles.logoBlock}>
          <img
            src="/logo.svg"
            alt="Web2Wireframe logo"
            className={styles.logoImage}
          />
          <strong>Web2Wireframe</strong>
        </div>
      </Link>
      <p>
        Turn any live website into clean, editable Figma wireframes in seconds.
      </p>
      <div className={styles.columns}>
        <div>
          <h4>Product</h4>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/docs">Docs</Link>
          <Link to="/support">Support</Link>
        </div>
        <div>
          <h4>Legal</h4>
          <Link to="/terms">Terms & Conditions</Link>
          <Link to="/privacy">Privacy Policy</Link>
        </div>
        <div>
          <h4>Get W2W</h4>
          <a href="https://www.figma.com/community" target="_blank" rel="noreferrer">
            Start Free
          </a>
          <Link to="/docs/browser-extension/extension-overview">
            Browser Extension
          </Link>
          <a href={checkoutLinks.pro} target="_blank" rel="noreferrer">
            Get Pro
          </a>
        </div>
      </div>
    </div>
    <div className={styles.bottom}>
      <div className="container">
        <span>
          © {new Date().getFullYear()} Web2Wireframe. All rights reserved.
        </span>
        <a
          className={styles.email}
          href="mailto:hey@web2wireframe.design"
          aria-label="Email hey@web2wireframe.design"
        >
          hey@web2wireframe.design
        </a>
      </div>
    </div>
  </footer>
);

export default Footer;
