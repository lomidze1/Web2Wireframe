import type { ReactElement } from "react";
import { useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import AppRoutes from "./AppRoutes";
import { AuthProvider } from "./contexts/AuthContext";
import styles from "./App.module.scss";

const ScrollToTop = (): null => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [pathname]);

  return null;
};

function App(): ReactElement {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ScrollToTop />
        {/* S-H6: Skip-to-content link. Visually hidden until focused via
            Tab on page load (see `.skipLink` in global.scss). Keyboard
            and screen-reader users bypass the header nav in one keystroke
            — Lighthouse a11y check + WCAG 2.4.1. */}
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <div className={styles.appShell}>
          <Header />
          <main id="main" className={styles.main}>
            <AppRoutes />
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
