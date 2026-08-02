import type { ReactElement } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import DocsLayout from "./DocsLayout";
import DocsArticlePage from "./DocsArticlePage";
import { docsNavigation } from "./data/docsStructure";
import styles from "./Docs.module.scss";

const DocsHub = (): ReactElement => (
  <DocsLayout>
    {/* S-H1: the hub opens with <h1> so search engines treat /docs as a
        proper top-level document; topic titles are <h2>. */}
    <h1 className={styles.hubTitle}>
      Everything the plugin can do, in the order you'll need it.
    </h1>
    <p className={styles.hubLead}>
      Fifteen pages. If you read one, read{" "}
      <Link to="/docs/start/set-settings">Set your settings</Link> — it is the
      difference between an import you keep and an import you redo.
    </p>

    <div className={styles.startHere}>
      <div className={styles.startHereText}>
        <div className={styles.startHereKicker}>Start here</div>
        <p className={styles.startHereTitle}>
          Your first import, in about four minutes.
        </p>
        <p className={styles.startHereBody}>
          Install, point it at a page, set four options, import.
        </p>
      </div>
      <Link className="btn btn-primary" to="/docs/start/fast-first-import">
        Read the walkthrough
      </Link>
    </div>

    {docsNavigation.map((topic) => (
      <div key={topic.id} className={styles.hubTopic}>
        <div>
          <h2 className={styles.hubTopicTitle}>{topic.title}</h2>
          <p className={styles.hubTopicBlurb}>{topic.blurb}</p>
        </div>
        <div className={styles.hubPages}>
          {topic.pages.map((page) => (
            <Link
              key={page.id}
              to={`/docs/${topic.id}/${page.path}`}
              className={styles.hubPageRow}
            >
              <span className={styles.hubPageTitle}>{page.title}</span>
              <span className={styles.hubPageBlurb}>{page.blurb}</span>
            </Link>
          ))}
        </div>
      </div>
    ))}
  </DocsLayout>
);

const Docs = (): ReactElement => (
  <Routes>
    <Route index element={<DocsHub />} />
    {/* Topic-only URLs redirect to the topic's first page. */}
    {docsNavigation.map((topic) => (
      <Route
        key={topic.id}
        path={topic.id}
        element={<Navigate to={topic.path} replace />}
      />
    ))}
    <Route path=":topicId/:pagePath" element={<DocsArticlePage />} />
    <Route path="*" element={<Navigate to="/docs" replace />} />
  </Routes>
);

export default Docs;
