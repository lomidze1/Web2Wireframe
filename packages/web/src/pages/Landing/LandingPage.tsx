import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { installLinks } from "../../data/links";
import type { LandingContent } from "./landingData";
import styles from "./LandingPage.module.scss";

/**
 * Shared shell for the four keyword landing pages. The copy differs per page
 * (see landingData.ts) — the layout does not, so it lives here once.
 */
const LandingPage = ({ content }: { content: LandingContent }): ReactElement => {
  const leadsWithChrome = content.ctaPrimary === "chrome";
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <div className={styles.kicker}>{content.kicker}</div>
        <h1 className={styles.title}>{content.h1}</h1>
        <p className={styles.lead}>{content.lead}</p>
        <div className={styles.actions}>
          {leadsWithChrome ? (
            <>
              <a
                className="btn btn-primary"
                href={installLinks.chrome}
                target="_blank"
                rel="noreferrer"
              >
                Add to Chrome — free
              </a>
              {/* The extension captures; the plugin builds the frames. Both
                  are needed, so the second CTA is the plugin, not the guide. */}
              <a
                className="btn btn-secondary"
                href={installLinks.figmaCommunity}
                target="_blank"
                rel="noreferrer"
              >
                Get the Figma plugin
              </a>
            </>
          ) : (
            <>
              <a
                className="btn btn-primary"
                href={installLinks.figmaCommunity}
                target="_blank"
                rel="noreferrer"
              >
                Install free on Figma Community
              </a>
              <Link className="btn btn-secondary" to="/how-it-works">
                See every option
              </Link>
            </>
          )}
        </div>
      </header>

      <section className={styles.intro}>
        <h2 className={styles.introTitle}>{content.intro.title}</h2>
        <div className={styles.introBody}>
          {content.intro.body.map((para) => (
            <p key={para.slice(0, 40)}>{para}</p>
          ))}
        </div>
      </section>

      <section className={styles.points}>
        {content.points.map((point) => (
          <div key={point.title} className="card">
            <div className="card-title">{point.title}</div>
            <p className="card-body">{point.body}</p>
          </div>
        ))}
      </section>

      <section className={styles.steps}>
        <h2 className={styles.sectionTitle}>{content.stepsTitle}</h2>
        <div className={styles.stepList}>
          {content.steps.map((step) => (
            <div key={step.n} className={styles.step}>
              <div className={styles.stepNumeral}>{step.n}</div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.limits}>
        <div className={styles.limitsPanel}>
          <h2 className={styles.limitsTitle}>{content.limits.title}</h2>
          <p className={styles.limitsBody}>{content.limits.body}</p>
          <ul className={styles.limitsList}>
            {content.limits.list.map((item) => (
              <li key={item.slice(0, 40)}>{item}</li>
            ))}
          </ul>
          <p className={styles.limitsNote}>{content.limits.note}</p>
        </div>
      </section>

      <section className={styles.faq}>
        <h2 className={styles.sectionTitle}>Questions people ask first.</h2>
        <div className={styles.faqList}>
          {content.faq.map((entry) => (
            <div key={entry.question} className={styles.faqItem}>
              <h3 className={styles.faqQuestion}>{entry.question}</h3>
              <p className={styles.faqAnswer}>{entry.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.related}>
        <h2 className={styles.sectionTitle}>The other ways in.</h2>
        <div className={styles.relatedGrid}>
          {content.related.map((item) => (
            <Link key={item.to} className={styles.relatedCard} to={item.to}>
              <span className={styles.relatedLabel}>{item.label}</span>
              <span className={styles.relatedNote}>{item.note}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.closing}>
        <div className={styles.closingPanel}>
          <p className={styles.closingLine}>
            Ten imports a month, free, with every setting unlocked from the
            first one.
          </p>
          <a
            className="btn btn-primary"
            href={installLinks.figmaCommunity}
            target="_blank"
            rel="noreferrer"
          >
            Install free
          </a>
          <Link className="btn btn-secondary" to="/pricing">
            Compare plans
          </Link>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
