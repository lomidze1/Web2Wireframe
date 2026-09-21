/** @jsx h */
import { h } from "preact";
import styles from "./ContrastCard.css";

/** Mirrors ContrastAuditResult in rendering/contrastAudit.ts (sandbox side). */
export interface ContrastInfo {
  issues: number;
  styles: number;
  colors: number;
  capped: boolean;
}

/**
 * Fake door: the fix doesn't exist yet. The page says so and offers an email
 * sign-up; each visit is counted by the site's /go analytics.
 */
export const A11Y_FIX_URL = "https://web2wireframe.design/go/a11y-fix";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function contrastSummary({
  issues,
  styles: styleCount,
  colors,
  capped,
}: ContrastInfo): string {
  const count = `${capped ? "at least " : ""}${plural(issues, "contrast issue")}`;
  const groups = [
    styleCount > 0 ? plural(styleCount, "style") : "",
    colors > 0 ? plural(colors, "color") : "",
  ].filter(Boolean);
  const where = groups.length > 0 ? ` in ${groups.join(" and ")}` : "";
  return `Found ${count}${where}`;
}

interface ContrastCardProps {
  result: ContrastInfo;
  onDismiss: () => void;
}

/**
 * Shown after an import whose text fails WCAG AA against its background.
 * Docked above the footer (like the substituted-fonts strip) so it appears on
 * every import tab.
 */
export default function ContrastCard({ result, onDismiss }: ContrastCardProps) {
  if (result.issues <= 0) return null;

  return (
    <div class={styles.card} role="region" aria-label="Contrast check">
      <div class={styles.body}>
        <span class={styles.title}>{contrastSummary(result)}</span>
        <span class={styles.hint}>Text that fails WCAG AA against its background.</span>
      </div>
      <button
        type="button"
        class={styles.fix}
        onClick={() => window.open(A11Y_FIX_URL, "_blank")}
      >
        Fix all via styles — Pro
      </button>
      <button
        type="button"
        class={styles.close}
        aria-label="Dismiss contrast notice"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
