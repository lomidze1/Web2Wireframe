/** @jsx h */
import { h } from "preact";
import { useState, useCallback } from "preact/hooks";
import styles from "./AIGenerationPage.css";
import PageGeneration from "./pageGeneration/PageGeneration";
import BlockGeneration from "./blockGeneration/BlockGeneration";

// SVG Icons
const PageGenIcon = () => (
  <svg width="64" height="64" viewBox="0 0 80 80" fill="none">
    <rect
      x="10"
      y="10"
      width="60"
      height="60"
      rx="4"
      fill="#f4a261"
      opacity="0.1"
      stroke="#f4a261"
      stroke-width="2"
    />
    <rect x="15" y="15" width="50" height="8" rx="2" fill="#f4a261" />
    <rect
      x="15"
      y="28"
      width="50"
      height="5"
      rx="1.5"
      fill="#f4a261"
      opacity="0.7"
    />
    <rect
      x="15"
      y="36"
      width="50"
      height="5"
      rx="1.5"
      fill="#f4a261"
      opacity="0.7"
    />
    <rect
      x="15"
      y="44"
      width="50"
      height="5"
      rx="1.5"
      fill="#f4a261"
      opacity="0.7"
    />
    <rect
      x="15"
      y="52"
      width="35"
      height="5"
      rx="1.5"
      fill="#f4a261"
      opacity="0.5"
    />
  </svg>
);

const BlockGenIcon = () => (
  <svg width="64" height="64" viewBox="0 0 80 80" fill="none">
    <rect
      x="10"
      y="10"
      width="60"
      height="25"
      rx="4"
      fill="#2a9d8f"
      opacity="0.1"
      stroke="#2a9d8f"
      stroke-width="2"
    />
    <rect x="15" y="15" width="50" height="6" rx="1.5" fill="#2a9d8f" />
    <rect
      x="15"
      y="24"
      width="50"
      height="3"
      rx="1"
      fill="#2a9d8f"
      opacity="0.6"
    />
    <rect
      x="10"
      y="42"
      width="60"
      height="25"
      rx="4"
      fill="#f4a261"
      opacity="0.1"
      stroke="#f4a261"
      stroke-width="2"
    />
    <rect x="15" y="47" width="20" height="6" rx="1.5" fill="#f4a261" />
    <rect
      x="40"
      y="47"
      width="25"
      height="6"
      rx="1.5"
      fill="#f4a261"
      opacity="0.7"
    />
    <rect
      x="15"
      y="56"
      width="50"
      height="3"
      rx="1"
      fill="#f4a261"
      opacity="0.6"
    />
  </svg>
);

// Types
type ViewMode = "landing" | "page" | "block";

// Card Component
interface CardProps {
  icon: preact.ComponentChildren;
  title: string;
  description: string;
  buttonLabel: string;
  onClick: () => void;
}

const Card = ({
  icon,
  title,
  description,
  buttonLabel,
  onClick,
}: CardProps) => (
  <button class={styles.card} onClick={onClick} type="button">
    <div class={styles.cardIcon}>{icon}</div>
    <h3 class={styles.cardTitle}>{title}</h3>
    <p class={styles.cardDescription}>{description}</p>
    <div class={styles.cardButton}>{buttonLabel}</div>
  </button>
);

export default function AIGenerationPage() {
  const [mode, setMode] = useState<ViewMode>("landing");

  const handleBackToLanding = useCallback(() => {
    setMode("landing");
  }, []);

  const handleGeneratePage = useCallback(() => {
    setMode("page");
  }, []);

  const handleGenerateBlock = useCallback(() => {
    setMode("block");
  }, []);

  // Page Generation View
  if (mode === "page") {
    return <PageGeneration onBack={handleBackToLanding} />;
  }

  // Block Generation View
  if (mode === "block") {
    return <BlockGeneration onBack={handleBackToLanding} />;
  }

  // Landing View
  return (
    <div class={styles.container}>
      <div class={styles.backgroundGradient} />
      <div class={styles.content}>
        <header class={styles.header}>
          <h1 class={styles.title}>AI Generations</h1>
          <p class={styles.subtitle}>
            Generate page and block wireframes using AI-assisted structure
            detection and reusable templates.
          </p>
        </header>

        <div class={styles.cardsGrid}>
          <Card
            icon={<PageGenIcon />}
            title="Generate Full Page"
            description="Create a structured wireframe for entire pages like landing, home, or pricing."
            buttonLabel="Generate Page"
            onClick={handleGeneratePage}
          />
          <Card
            icon={<BlockGenIcon />}
            title="Generate Block"
            description="Generate individual UI blocks like headers, testimonials, or pricing sections."
            buttonLabel="Generate Block"
            onClick={handleGenerateBlock}
          />
        </div>
      </div>
    </div>
  );
}
