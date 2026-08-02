import { useEffect, useRef, useState, type ReactElement } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { docsNavigation } from "./data/docsStructure";
import { docsArticles } from "./data/docsArticles";
import {
  getSearchItemRoute,
  searchDocs,
  type DocsSearchItem,
} from "./data/docsSearchIndex";
import styles from "./Docs.module.scss";

const DESKTOP_QUERY = "(min-width: 1001px)";

const DocsSidebar = (): ReactElement => {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocsSearchItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Below 1000px the topic list collapses behind a summary so the article
  // isn't pushed a full screen down; on desktop it is always open and the
  // summary is hidden.
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const sync = (): void => setIsDesktop(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  // Debounce so a fast typist doesn't re-filter on every keystroke.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setResults(searchDocs(query));
      setActiveIndex(0);
    }, 160);
    return () => window.clearTimeout(handle);
  }, [query]);

  // Clear the search when a route change happens (a result was picked).
  useEffect(() => {
    setQuery("");
    setResults([]);
  }, [location.pathname]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      navigate(getSearchItemRoute(results[activeIndex]));
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      setQuery("");
      setResults([]);
    }
  };

  return (
    <nav className={styles.sidebar} aria-label="Documentation">
      <div className={styles.searchField}>
        <label className={styles.searchLabel} htmlFor="docs-search">
          Search the docs
        </label>
        <input
          ref={inputRef}
          id="docs-search"
          className={styles.searchInput}
          type="search"
          placeholder="Try “screenshot”"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {results.length > 0 && (
          <ul className={styles.searchResults}>
            {results.map((item, i) => (
              <li key={item.id}>
                <Link
                  to={getSearchItemRoute(item)}
                  className={`${styles.searchResult} ${
                    i === activeIndex ? styles.searchResultActive : ""
                  }`}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <span className={styles.searchResultTitle}>
                    {item.sectionTitle ?? item.pageTitle}
                  </span>
                  <span className={styles.searchResultMeta}>
                    {item.sectionTitle ? item.pageTitle : item.topicTitle}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className={styles.topicList} open={isDesktop}>
        <summary className={styles.topicSummary}>All topics</summary>
        {docsNavigation.map((topic) => (
          <div key={topic.id} className={styles.sidebarTopic}>
            <div className={styles.sidebarTopicLabel}>{topic.title}</div>
            {topic.pages.map((page) => {
              const route = `/docs/${topic.id}/${page.path}`;
              const isActive = location.pathname === route;
              const isDraft = !docsArticles[`${topic.id}/${page.path}`];
              return (
                <Link
                  key={page.id}
                  to={route}
                  className={`${styles.sidebarLink} ${
                    isActive ? styles.sidebarLinkActive : ""
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {page.title}
                  {isDraft && <span className={styles.draftMark}>draft</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </details>
    </nav>
  );
};

export default DocsSidebar;
