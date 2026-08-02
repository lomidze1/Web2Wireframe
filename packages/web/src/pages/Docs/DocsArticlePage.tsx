import { useEffect, type ReactElement } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import DocsLayout from "./DocsLayout";
import { getAllDocPages } from "./data/docsStructure";
import { getArticle } from "./data/docsArticles";
import styles from "./Docs.module.scss";

const HUB = { title: "Documentation home", route: "/docs" };

const DocsArticlePage = (): ReactElement => {
  const { topicId, pagePath } = useParams();
  const location = useLocation();
  const pages = getAllDocPages();
  const index = pages.findIndex(
    (p) => p.topicId === topicId && p.path === pagePath,
  );

  // Anchor links arriving with the page (from search) need one manual scroll —
  // the browser resolves the hash before React has rendered the section.
  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView();
  }, [location.hash, location.pathname]);

  if (index === -1) return <Navigate to="/docs" replace />;

  const page = pages[index];
  const { article, isDraft } = getArticle(page.key);
  const prev = index > 0 ? pages[index - 1] : HUB;
  const next = index < pages.length - 1 ? pages[index + 1] : HUB;

  return (
    <DocsLayout sections={article.sections}>
      <div className={styles.breadcrumb}>
        <Link to="/docs">Docs</Link>
        <span aria-hidden="true">/</span>
        <span>{page.topicTitle}</span>
        <span aria-hidden="true">/</span>
        <span className={styles.breadcrumbCurrent}>{page.title}</span>
      </div>

      <div className={styles.articleKicker}>{page.topicTitle}</div>
      <h1 className={styles.articleTitle}>{page.title}</h1>
      <p className={styles.articleLead}>{article.lead}</p>
      <div className={styles.articleMeta}>
        <span>{article.readingTime}</span>
        <span>{article.updated}</span>
        {isDraft && <span>Draft</span>}
      </div>

      {article.sections.map((section) => (
        <section key={section.id} className={styles.section}>
          <h2 id={section.id} className={styles.sectionTitle}>
            {section.title}
          </h2>
          {section.paras.map((para, i) => (
            <p key={i} className={styles.para}>
              {para}
            </p>
          ))}
          {section.list && (
            <ul className={styles.ruledList}>
              {section.list.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          )}
          {section.note && <p className={styles.note}>{section.note}</p>}
          {section.figure && (
            <figure className={styles.figure}>
              <div className="plate">
                <img
                  src={section.figure.src}
                  alt={section.figure.caption}
                  loading="lazy"
                  className={styles.figureImg}
                />
              </div>
              <figcaption className={styles.figureCaption}>
                {section.figure.caption}
              </figcaption>
            </figure>
          )}
        </section>
      ))}

      <div className={styles.prevNext}>
        <Link
          to={"route" in prev ? prev.route : HUB.route}
          className={styles.prevNextCard}
        >
          <div className={styles.prevNextKicker}>Previous</div>
          <div className={styles.prevNextTitle}>{prev.title}</div>
        </Link>
        <Link
          to={"route" in next ? next.route : HUB.route}
          className={`${styles.prevNextCard} ${styles.prevNextCardRight}`}
        >
          <div
            className={`${styles.prevNextKicker} ${styles.prevNextKickerAccent}`}
          >
            Next
          </div>
          <div className={styles.prevNextTitle}>{next.title}</div>
        </Link>
      </div>
    </DocsLayout>
  );
};

export default DocsArticlePage;
