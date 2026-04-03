import type { ReactElement } from "react";
import { useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import Header from "./components/Header";
import Footer from "./components/Footer";
import AppRoutes from "./AppRoutes";
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
    <BrowserRouter>
      <ScrollToTop />
      <div className={styles.appShell}>
        <Header />
        <main className={styles.main}>
          <AppRoutes />
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
