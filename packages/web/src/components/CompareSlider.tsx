import type { CSSProperties, ReactElement } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./CompareSlider.module.scss";

export type ComparePanel = {
  src: string;
  alt: string;
  label: string;
};

type CompareSliderProps = {
  /** Left-to-right, so the last entry is what the right edge reveals. */
  panels: ComparePanel[];
};

/** Closest two handles may sit, in percent. At zero they land on the same pixel
 *  and neither can be grabbed again. */
export const MIN_GAP = 3;

/** Narrowest band, in percent, that still has room for its label. */
const LABEL_MIN_BAND = 14;

const KEYBOARD_STEP = 4;

const clamp = (value: number): number => Math.min(100, Math.max(0, value));

export const nearestHandleIndex = (
  positions: number[],
  percent: number,
): number => {
  let nearest = 0;
  let shortest = Infinity;
  positions.forEach((position, index) => {
    const distance = Math.abs(position - percent);
    if (distance < shortest) {
      shortest = distance;
      nearest = index;
    }
  });
  return nearest;
};

export const clampHandle = (
  positions: number[],
  index: number,
  next: number,
): number => {
  const lower = index > 0 ? positions[index - 1] + MIN_GAP : 0;
  const upper =
    index < positions.length - 1 ? positions[index + 1] - MIN_GAP : 100;
  return Math.min(Math.max(next, lower), upper);
};

const CompareSlider = ({ panels }: CompareSliderProps): ReactElement => {
  const [positions, setPositions] = useState<number[]>(() =>
    Array.from(
      { length: panels.length - 1 },
      (_, index) => ((index + 1) * 100) / panels.length,
    ),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<number | null>(null);

  const percentFromClientX = useCallback((clientX: number): number | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0) return null;
    return clamp(((clientX - rect.left) / rect.width) * 100);
  }, []);

  const moveHandle = useCallback((index: number, next: number): void => {
    setPositions((prev) => {
      const clamped = clampHandle(prev, index, next);
      if (clamped === prev[index]) return prev;
      const updated = [...prev];
      updated[index] = clamped;
      return updated;
    });
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent): void => {
      const index = draggingRef.current;
      if (index === null) return;
      const percent = percentFromClientX(event.clientX);
      if (percent === null) return;
      moveHandle(index, percent);
    };
    const stopDragging = (): void => {
      draggingRef.current = null;
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopDragging);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopDragging);
    };
  }, [moveHandle, percentFromClientX]);

  const handlePointerDown = (event: React.PointerEvent): void => {
    const percent = percentFromClientX(event.clientX);
    if (percent === null) return;
    const index = nearestHandleIndex(positions, percent);
    draggingRef.current = index;
    moveHandle(index, percent);
  };

  const handleKeyDown =
    (index: number) =>
    (event: React.KeyboardEvent): void => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveHandle(index, positions[index] - KEYBOARD_STEP);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveHandle(index, positions[index] + KEYBOARD_STEP);
      }
    };

  const lastIndex = panels.length - 1;
  const bandStart = (index: number): number =>
    index === 0 ? 0 : positions[index - 1];
  const bandEnd = (index: number): number =>
    index === lastIndex ? 100 : positions[index];

  const labelPlacement = (index: number): CSSProperties | undefined => {
    if (index === 0 || index === lastIndex) return undefined;
    return { left: `${(bandStart(index) + bandEnd(index)) / 2}%` };
  };

  return (
    <div
      ref={containerRef}
      className={styles.slider}
      onPointerDown={handlePointerDown}
    >
      {/* Stacked so panel 0 is on top; every panel but the last is clipped back
          to its handle, letting the ones below show through on the right. */}
      {panels.map((panel, index) => (
        <img
          key={panel.src}
          src={panel.src}
          alt={panel.alt}
          className={`${styles.image} ${
            index < positions.length ? styles.imageClipped : ""
          }`}
          draggable={false}
          style={{
            zIndex: panels.length - index,
            ...(index < positions.length
              ? { clipPath: `inset(0 ${100 - positions[index]}% 0 0)` }
              : null),
          }}
        />
      ))}

      {panels.map((panel, index) => (
        <span
          key={`${panel.src}-label`}
          className={`${styles.label} ${
            index === 0
              ? styles.labelStart
              : index === lastIndex
                ? styles.labelEnd
                : styles.labelMiddle
          } ${
            bandEnd(index) - bandStart(index) < LABEL_MIN_BAND
              ? styles.labelHidden
              : ""
          }`}
          style={labelPlacement(index)}
        >
          {panel.label}
        </span>
      ))}

      {positions.map((position, index) => (
        <div
          key={`${panels[index].src}-handle`}
          className={styles.handle}
          style={{ left: `${position}%` }}
          role="slider"
          tabIndex={0}
          aria-label={`Reveal more of ${panels[index].label} or ${
            panels[index + 1].label
          }`}
          aria-valuemin={
            index > 0 ? Math.round(positions[index - 1] + MIN_GAP) : 0
          }
          aria-valuemax={
            index < positions.length - 1
              ? Math.round(positions[index + 1] - MIN_GAP)
              : 100
          }
          aria-valuenow={Math.round(position)}
          onKeyDown={handleKeyDown(index)}
        >
          <span className={styles.grip} aria-hidden="true">
            <img src="/logo.svg" alt="" className={styles.gripLogo} />
          </span>
        </div>
      ))}
    </div>
  );
};

export default CompareSlider;
