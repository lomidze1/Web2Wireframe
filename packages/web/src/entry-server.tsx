import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import Header from "./components/Header";
import Footer from "./components/Footer";
import AppRoutes, { staticRoutes } from "./AppRoutes";

export function render(url: string): string {
  return renderToString(
    <StaticRouter location={url}>
      <div className="appShell">
        <Header />
        <main className="main">
          <AppRoutes />
        </main>
        <Footer />
      </div>
    </StaticRouter>
  );
}

export { staticRoutes };
