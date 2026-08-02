import { useEffect, useState, type ReactElement } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { installLinks } from "../data/links";
import { getChipLabel, getInitials } from "../pages/Account/accountLogic";
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
  const { user } = useAuth();
  // S-H6: mobile nav state. Hamburger toggles the panel at <768px; the
  // existing inline `<nav>` is hidden on narrow viewports via CSS so it
  // no longer wraps/overflows the brand row.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isDocsPage = location.pathname.startsWith("/docs");
  const isTermsPage = location.pathname.startsWith("/terms");
  const isPrivacyPage = location.pathname.startsWith("/privacy");
  const isStaticHeader = isDocsPage || isTermsPage || isPrivacyPage;
  // The loudest button on a payment screen must not point away from the
  // purchase — the primary Install CTA is suppressed on Checkout/Success.
  const isPaymentPage = location.pathname.startsWith("/checkout");
  const isAccountPage = location.pathname.startsWith("/account");

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
          {!user && (
            <Link to="/signin" className={styles.signInLink}>
              Sign in
            </Link>
          )}
          {!isPaymentPage && (
            <a
              className={`btn btn-primary ${styles.installBtn}`}
              href={installLinks.figmaCommunity}
              target="_blank"
              rel="noreferrer"
            >
              Install free
            </a>
          )}
          {user && (
            <Link
              to="/account"
              className={`${styles.accountChip} ${
                isAccountPage ? styles.accountChipActive : ""
              }`}
              aria-label={
                user.email ? `Account — ${user.email}` : "Account"
              }
              title={user.email ?? user.figmaUserId}
            >
              <span className={styles.chipInitials}>
                {getInitials(user.email)}
              </span>
              <span className={styles.chipLabel}>
                {getChipLabel(user.plan, user.usage)}
              </span>
            </Link>
          )}
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
