import { useEffect, useState, type ReactElement } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import MyUserModal from "./MyUserModal";
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
  const { user } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
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

  // Logged-out: text label "My User". Logged-in: render an avatar circle
  // with a generic person icon. Universal symbol — no language dependency,
  // no truncation issues regardless of email length. Full email + ID live
  // one click away inside MyUserModal.

  return (
    <>
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
                className={({ isActive }) =>
                  `${styles.link} ${isActive ? styles.active : ""}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className={styles.actions}>
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
            {user ? (
              <button
                type="button"
                className={styles.avatarButton}
                onClick={() => setModalOpen(true)}
                aria-label={
                  user.email
                    ? `Account — ${user.email}`
                    : `Account — ${user.figmaUserId}`
                }
                title={user.email ?? user.figmaUserId}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalOpen(true)}
              >
                My User
              </button>
            )}
          </div>
        </div>
      </header>
      <MyUserModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
};

export default Header;
