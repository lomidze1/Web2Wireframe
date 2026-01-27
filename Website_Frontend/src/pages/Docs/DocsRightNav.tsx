import type { ReactElement } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./Docs.module.scss";
import { buildHeadingIds } from "./utils/docsSearchUtils";

interface Heading {
  id: string;
  text: string;
  level: number;
}

const DocsRightNav = (): ReactElement => {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeHeading, setActiveHeading] = useState<string>("");

  const mutationObserverRef = useRef<MutationObserver | null>(null);

  const activeHeadingRef = useRef<string>("");
  const rafRef = useRef<number | null>(null);

  const extractHeadings = () => {
    const mainContent = document.querySelector(`.${styles.mainContent}`);
    if (!mainContent) return;

    const headingElements = mainContent.querySelectorAll("h2, h3");
    const extractedHeadings: Heading[] = [];
    const headingTexts = Array.from(headingElements).map(
      (el) => el.textContent || ""
    );
    const headingIds = buildHeadingIds(headingTexts);

    headingElements.forEach((el, index) => {
      const id = headingIds[index];
      el.id = id;
      if (el.tagName.toLowerCase() === "h3") {
        extractedHeadings.push({
          id,
          text: el.textContent || "",
          level: Number(el.tagName[1]),
        });
      }
    });

    // ✅ schedule state update (NOT synchronously inside effect body)
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setHeadings((prev) => {
        const hasChanged =
          prev.length !== extractedHeadings.length ||
          prev.some((h, i) => h.id !== extractedHeadings[i]?.id);
        return hasChanged ? extractedHeadings : prev;
      });
    });
  };

  useLayoutEffect(() => {
    // ✅ schedule extraction on next frame (avoids sync setState in effect)
    extractHeadings();

    const mainContent = document.querySelector(`.${styles.mainContent}`);
    if (!mainContent) return;

    const mutationObserver = new MutationObserver(() => {
      extractHeadings();
    });

    mutationObserver.observe(mainContent, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    mutationObserverRef.current = mutationObserver;

    return () => {
      mutationObserver.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    const mainContent = document.querySelector(`.${styles.mainContent}`);
    if (!mainContent) return;

    const headingElements = Array.from(
      mainContent.querySelectorAll("h3")
    ) as HTMLElement[];
    if (headingElements.length === 0) return;

    const updateActiveHeading = () => {
      const triggerOffset = 100;
      let currentId = headingElements[0]?.id || "";

      for (const heading of headingElements) {
        if (heading.getBoundingClientRect().top <= triggerOffset) {
          currentId = heading.id;
        } else {
          break;
        }
      }

      if (activeHeadingRef.current !== currentId) {
        activeHeadingRef.current = currentId;
        setActiveHeading(currentId);
      }
    };

    const handleScroll = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateActiveHeading);
    };

    updateActiveHeading();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [headings]);

  const handleHeadingClick = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  if (headings.length === 0) {
    return <div className={styles.rightNav}>No headings</div>;
  }

  return (
    <nav className={styles.rightNav}>
      <h4>On this page</h4>
      <ul className={styles.tocList}>
        {headings.map((heading) => (
          <li key={heading.id} className={`level-${heading.level}`}>
            <button
              className={`${styles.tocLink} ${
                activeHeading === heading.id ? styles.active : ""
              }`}
              onClick={() => handleHeadingClick(heading.id)}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default DocsRightNav;
