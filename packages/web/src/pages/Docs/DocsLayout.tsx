import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router-dom";
import DocsSidebar from "./DocsSidebar";
import type { DocsSection } from "./data/docsTypes";
import styles from "./Docs.module.scss";

interface DocsLayoutProps {
  children: ReactNode;
  /** Present on articles only — drives the "On this page" list. */
  sections?: DocsSection[];
}

const DocsLayout = ({ children, sections }: DocsLayoutProps): ReactElement => {
  return (
    <div className={`container ${styles.docsGrid}`}>
      <DocsSidebar />

      <article className={styles.article}>{children}</article>

      <aside className={styles.aside}>
        {sections && sections.length > 0 && (
          <nav className={styles.toc} aria-label="On this page">
            <div className={styles.asideLabel}>On this page</div>
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className={styles.tocLink}
              >
                {section.title}
              </a>
            ))}
          </nav>
        )}
        <div className={styles.tryCard}>
          <div className={styles.asideLabel}>Try it first</div>
          <p className={styles.tryCardBody}>
            The settings panel runs live on the overview page.
          </p>
          <Link className={`btn btn-secondary btn-block ${styles.tryCardBtn}`} to="/">
            Open the console
          </Link>
        </div>
      </aside>
    </div>
  );
};

export default DocsLayout;
