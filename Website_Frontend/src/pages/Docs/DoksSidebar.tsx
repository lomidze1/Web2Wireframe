import type { ReactElement, KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { docsNavigation } from "./data/docsStructure";
import { getDocsSearchIndex } from "./data/docsSearchIndex";
import { normalizeSearchText } from "./utils/docsSearchUtils";
import styles from "./Docs.module.scss";

const DoksSidebar = (): ReactElement => {
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  const toggleTopic = (topicId: string) => {
    const newExpanded = new Set(expandedTopics);
    if (newExpanded.has(topicId)) {
      newExpanded.delete(topicId);
    } else {
      newExpanded.add(topicId);
    }
    setExpandedTopics(newExpanded);
  };

  const handlePageClick = (path: string, headingId?: string) => {
    navigate(path);
    setSearchQuery("");
    setActiveIndex(0);
    if (headingId) {
      window.setTimeout(() => {
        document.getElementById(headingId)?.scrollIntoView({ behavior: "smooth" });
      }, 120);
    }
  };

  const isTopicActive = (topicPath: string): boolean => {
    return location.pathname.startsWith(topicPath);
  };

  const isPageActive = (topicPath: string, pagePath: string): boolean => {
    return location.pathname === `${topicPath}/${pagePath}`;
  };

  // Auto-expand the topic containing the active page
  useEffect(() => {
    const activeTopic = docsNavigation.find((topic) =>
      location.pathname.startsWith(topic.path)
    );
    if (activeTopic && !expandedTopics.has(activeTopic.id)) {
      setExpandedTopics(new Set([...expandedTopics, activeTopic.id]));
    }
  }, [location.pathname]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  const normalizedQuery = normalizeSearchText(debouncedQuery);
  const searchIndex = useMemo(() => getDocsSearchIndex(), []);
  const filteredResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return searchIndex
      .filter((item) => item.searchText.includes(normalizedQuery))
      .slice(0, 8);
  }, [searchIndex, normalizedQuery]);

  useEffect(() => {
    if (filteredResults.length > 0) {
      setActiveIndex(0);
    }
  }, [normalizedQuery, filteredResults.length]);

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const lowerText = text.toLowerCase();
    const index = lowerText.indexOf(query);
    if (index === -1) return text;
    const before = text.slice(0, index);
    const match = text.slice(index, index + query.length);
    const after = text.slice(index + query.length);
    return (
      <>
        {before}
        <mark className={styles.resultHighlight}>{match}</mark>
        {after}
      </>
    );
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!normalizedQuery) return;
    if (filteredResults.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) =>
        Math.min(prev + 1, filteredResults.length - 1)
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = filteredResults[activeIndex];
      if (selected) {
        const targetPath = selected.headingId
          ? `${selected.pagePath}#${selected.headingId}`
          : selected.pagePath;
        handlePageClick(targetPath, selected.headingId);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setSearchQuery("");
    }
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarHeader}>
        <h3>Documentation</h3>
      </div>

      <div className={styles.searchContainer}>
        <input
          type="text"
          placeholder="Search docs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          className={styles.searchInput}
        />
      </div>

      {normalizedQuery && (
        <div className={styles.searchResults}>
          {filteredResults.length > 0 ? (
            <div className={styles.resultsList}>
              {filteredResults.map((result, index) => (
                <button
                  key={result.id}
                  className={`${styles.resultItem} ${
                    index === activeIndex ? styles.resultItemActive : ""
                  }`}
                  onClick={() =>
                    handlePageClick(
                      result.headingId
                        ? `${result.pagePath}#${result.headingId}`
                        : result.pagePath,
                      result.headingId
                    )
                  }
                >
                  <div className={styles.resultTitle}>
                    {highlightMatch(result.pageTitle, normalizedQuery)}
                  </div>
                  {result.sectionTitle && (
                    <div className={styles.resultSection}>
                      {highlightMatch(result.sectionTitle, normalizedQuery)}
                    </div>
                  )}
                  <div className={styles.resultTopic}>{result.topicTitle}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.noResults}>No results found</div>
          )}
        </div>
      )}

      {!normalizedQuery && (
        <nav className={styles.sidebarNav}>
          {docsNavigation.map((topic) => {
            const isExpanded = expandedTopics.has(topic.id);
            const isActive = isTopicActive(topic.path);

            return (
              <div key={topic.id} className={styles.navItem}>
                <button
                  className={`${styles.navTopic} ${
                    isActive ? styles.active : ""
                  }`}
                  onClick={() => {
                    toggleTopic(topic.id);
                  }}
                >
                  <span className={styles.topicIcon}>{topic.icon}</span>
                  <span className={styles.topicTitle}>{topic.title}</span>
                  <span
                    className={`${styles.topicArrow} ${
                      isExpanded ? styles.expanded : ""
                    }`}
                  >
                    ▼
                  </span>
                </button>

                {isExpanded && topic.pages.length > 0 && (
                  <div className={styles.subPages}>
                    {topic.pages.map((page) => {
                      const isPageActiveNow = isPageActive(
                        topic.path,
                        page.path
                      );
                      return (
                        <button
                          key={page.id}
                          className={`${styles.navPage} ${
                            isPageActiveNow ? styles.active : ""
                          }`}
                          onClick={() =>
                            handlePageClick(`/docs/${topic.id}/${page.path}`)
                          }
                        >
                          {page.title}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      )}
    </aside>
  );
};

export default DoksSidebar;
