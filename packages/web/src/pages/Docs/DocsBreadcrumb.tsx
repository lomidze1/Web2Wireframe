import type { ReactElement } from "react";
import { Link, useLocation } from "react-router-dom";
import { docsNavigation } from "./data/docsStructure";
import styles from "./Docs.module.scss";

const DocsBreadcrumb = (): ReactElement => {
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter(Boolean);

  let currentTopic: (typeof docsNavigation)[0] | null = null;
  let currentPage: (typeof docsNavigation)[0]["pages"][0] | null = null;

  if (pathSegments.length >= 2) {
    const topicId = pathSegments[1];
    const pageId = pathSegments[2];

    currentTopic = docsNavigation.find((t) => t.id === topicId) || null;
    if (currentTopic && pageId) {
      currentPage = currentTopic.pages.find((p) => p.path === pageId) || null;
    }
  }

  return (
    <div className={styles.breadcrumb}>
      <Link to="/docs">Docs</Link>
      {currentTopic && (
        <>
          <span className={styles.separator}>/</span>
          <Link to={currentTopic.path}>{currentTopic.title}</Link>
        </>
      )}
      {currentPage && (
        <>
          <span className={styles.separator}>/</span>
          <span className={styles.current}>{currentPage.title}</span>
        </>
      )}
    </div>
  );
};

export default DocsBreadcrumb;
