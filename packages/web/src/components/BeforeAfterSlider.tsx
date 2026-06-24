import type { ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./BeforeAfterSlider.module.scss";

type BeforeAfterSliderProps = {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt: string;
  afterAlt: string;
  beforeLabel?: string;
  afterLabel?: string;
};

const clamp = (value: number): number => Math.min(100, Math.max(0, value));

const BeforeAfterSlider = ({
  beforeSrc,
  afterSrc,
  beforeAlt,
  afterAlt,
  beforeLabel = "Website",
  afterLabel = "Figma wireframe",
}: BeforeAfterSliderProps): ReactElement => {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updateFromClientX = useCallback((clientX: number): void => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0) return;
    setPosition(clamp(((clientX - rect.left) / rect.width) * 100));
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent): void => {
      if (!draggingRef.current) return;
      updateFromClientX(event.clientX);
    };
    const stopDragging = (): void => {
      draggingRef.current = false;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopDragging);
    };
  }, [updateFromClientX]);

  const handlePointerDown = (event: React.PointerEvent): void => {
    draggingRef.current = true;
    updateFromClientX(event.clientX);
  };

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setPosition((prev) => clamp(prev - 4));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setPosition((prev) => clamp(prev + 4));
    }
  };

  return (
    <div
      ref={containerRef}
      className={styles.slider}
      onPointerDown={handlePointerDown}
    >
      {/* Base layer: the "after" wireframe (revealed on the right). */}
      <img
        src={afterSrc}
        alt={afterAlt}
        className={styles.image}
        draggable={false}
      />
      {/* Top layer: the "before" website, clipped to the left of the handle. */}
      <img
        src={beforeSrc}
        alt={beforeAlt}
        className={`${styles.image} ${styles.imageBefore}`}
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        draggable={false}
      />

      <span className={`${styles.label} ${styles.labelBefore}`}>
        {beforeLabel}
      </span>
      <span className={`${styles.label} ${styles.labelAfter}`}>
        {afterLabel}
      </span>

      <div
        className={styles.handle}
        style={{ left: `${position}%` }}
        role="slider"
        tabIndex={0}
        aria-label="Reveal more of the website or the Figma wireframe"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        onKeyDown={handleKeyDown}
      >
        <span className={styles.grip} aria-hidden="true">
          <img src="/logo.svg" alt="" className={styles.gripLogo} />
        </span>
      </div>
    </div>
  );
};

export default BeforeAfterSlider;
