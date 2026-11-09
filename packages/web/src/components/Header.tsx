import { useEffect, useState, type ReactElement } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { installLinks } from "../data/links";
import styles from "./Header.module.scss";

type NavItem = {
  path: string;
  label: string;
};

const navItems: NavItem[] = [
  { path: "/", label: "Overview" },
  { path: "/how-it-works", label: "How it works" },
  { path: "/pricing", label: "Pricing" },
  { path: "/docs", label: "Docs" },
];

const Header = (): ReactElement => {
  const location = useLocation();
  // S-H6: mobile nav state. Hamburger toggles the panel at <768px; the
  // existing inline `<nav>` is hidden on narrow viewports via CSS so it
  // no longer wraps/overflows the brand row.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isDocsPage = location.pathname.startsWith("/docs");
  const isTermsPage = location.pathname.startsWith("/terms");
  const isPrivacyPage = location.pathname.startsWith("/privacy");
  const isStaticHeader = isDocsPage || isTermsPage || isPrivacyPage;

  // Close the mobile menu on route change so a NavLink click doesn't leave
  // it hovering over the new page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <header
      className={`${styles.header} ${isStaticHeader ? styles.headerStatic : ""}`}
    >
      <div className={`container ${styles.inner}`}>
        <Link to="/" className={styles.brand}>
          <span className={styles.brandName}>Web2Wireframe</span>
          <span className={styles.brandTag}>Figma plugin</span>
        </Link>
        <nav
          id="primary-mobile-nav"
          className={`${styles.nav} ${
            mobileNavOpen ? styles.navOpen : ""
          }`}
          aria-label="Primary"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `${styles.link} ${isActive ? styles.active : ""}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.actions}>
          <a
            className={`btn btn-primary ${styles.installBtn}`}
            href={installLinks.figmaCommunity}
            target="_blank"
            rel="noreferrer"
          >
            Install free
          </a>
          {/* S-H6: hamburger button visible only at <768px (CSS handles
              the breakpoint). Toggles the mobile nav panel. */}
          <button
            type="button"
            className={styles.hamburger}
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-expanded={mobileNavOpen}
            aria-controls="primary-mobile-nav"
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
          >
            <span aria-hidden="true">{mobileNavOpen ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
