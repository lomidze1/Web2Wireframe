import type { ReactElement } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { checkoutLinks } from "../data/links";
import styles from "./Header.module.scss";

type NavItem = {
  path: string;
  label: string;
};

const navItems: NavItem[] = [
  { path: "/how-it-works", label: "How It Works" },
  { path: "/pricing", label: "Pricing" },
  { path: "/docs", label: "Docs" },
];

const Header = (): ReactElement => {
  const location = useLocation();
  const isDocsPage = location.pathname.startsWith("/docs");
  const isTermsPage = location.pathname.startsWith("/terms");
  const isPrivacyPage = location.pathname.startsWith("/privacy");
  const isStaticHeader = isDocsPage || isTermsPage || isPrivacyPage;

  return (
    <header
      className={`${styles.header} ${isStaticHeader ? styles.headerStatic : ""}`}
    >
      <div className={`container ${styles.inner}`}>
        <Link to="/" className={styles.brand}>
          <img
            src="/logo.svg"
            alt="Web2Wireframe logo"
            className={styles.logoMark}
          />

          <span className={styles.brandText}>
            <strong>Web2Wireframe</strong>
          </span>
        </Link>
        <nav className={styles.nav}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
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
            className="btn btn-primary"
            href={checkoutLinks.proMonthly}
            target="_blank"
            rel="noreferrer"
          >
            Upgrade to Pro
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;
