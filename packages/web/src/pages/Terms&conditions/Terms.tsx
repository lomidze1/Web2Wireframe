import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./Terms.module.scss";

type TermsSection = {
  id: string;
  title: string;
  content: ReactElement;
};

const Terms = (): ReactElement => {
  const sections = useMemo<TermsSection[]>(
    () => [
      {
        id: "purpose-scope",
        title: "1. Purpose & Scope",
        content: (
          <>
            <p>
              These Terms & Conditions (the "Terms") govern access to and use of
              Web2Wireframe (W2W), including the website, plugin, and any related
              services (collectively, the "Service"). By using the Service, you
              agree to these Terms.
            </p>
          </>
        ),
      },
      {
        id: "company-operator",
        title: "2. Company / Operator & Contact",
        content: (
          <>
            <p>
              The Service is operated by Glinc ("Glinc", "we", "us", "our"), a
              company based in Georgia. You can contact us at{" "}
              <a href="mailto:hey@web2wireframe.design">
                hey@web2wireframe.design
              </a>
              .
            </p>
          </>
        ),
      },
      {
        id: "definitions",
        title: "3. Definitions",
        content: (
          <ol>
            <li>
              "User" or "you" means any person or entity using the Service.
            </li>
            <li>
              "Content" means materials you submit or import, including URLs,
              HTML, screenshots, or files.
            </li>
            <li>
              "Output" means wireframes, layouts, or assets produced by the
              Service.
            </li>
            <li>
              "Plan" means a Free, Plus, or Pro subscription tier.
            </li>
          </ol>
        ),
      },
      {
        id: "eligibility-accounts",
        title: "4. Eligibility & Accounts",
        content: (
          <>
            <p>
              You must be able to form a binding agreement under applicable law
              to use the Service. If you use the Service on behalf of an
              organization, you represent that you are authorized to accept
              these Terms on its behalf.
            </p>
            <p>
              You are responsible for your account activity and for keeping your
              credentials secure.
            </p>
          </>
        ),
      },
      {
        id: "acceptable-use",
        title: "5. Acceptable Use",
        content: (
          <ol>
            <li>
              Use the Service only for lawful purposes and in line with these
              Terms.
            </li>
            <li>
              Only import or submit content you own or have permission to use.
            </li>
            <li>
              Use Outputs in a way that respects third-party rights and
              applicable laws.
            </li>
          </ol>
        ),
      },
      {
        id: "prohibited-use",
        title: "6. Prohibited Use",
        content: (
          <ol>
            <li>
              No building or operating a competing product or service using
              W2W, its Outputs, or its documentation.
            </li>
            <li>
              No reselling, sublicensing, or monetizing collections of generated
              wireframes or Outputs as a standalone product.
            </li>
            <li>
              No bots, mass-import, bulk processing, or automated scraping of
              websites without our prior written permission.
            </li>
            <li>
              No reverse engineering, decompiling, or attempting to discover
              source code or models used by the Service, except where permitted
              by law.
            </li>
            <li>
              No using Outputs or Service data to train AI models without
              Glinc’s prior written consent.
            </li>
          </ol>
        ),
      },
      {
        id: "free-tier",
        title: "7. Free Tier (Freemium) Limits",
        content: (
          <>
            <p>
              The Free plan is limited as follows: Colors and Fonts are
              plugin-only; Viewports are limited to 1920 and 1440; Text Content
              uses placeholders only; Styles & Assets are not included; AI
              Generation is not available; and
              Support is provided through community channels.
            </p>
            <p>
              Free limits and features may change over time. For the current
              plan matrix, visit <a href="/pricing">/pricing</a>.
            </p>
          </>
        ),
      },
      {
        id: "subscription-billing",
        title: "8. Subscription, Billing & Renewal",
        content: (
          <>
            <p>
              Paid plans include Plus ($12/month) and Pro ($20/month). Your
              subscription auto-renews unless canceled before the end of your
              billing period.
            </p>
            <p>
              Payments are processed through an external checkout or payment
              provider. Taxes may apply based on your location.
            </p>
          </>
        ),
      },
      {
        id: "cancellations-refunds",
        title: "9. Cancellations & Refunds",
        content: (
          <>
            <p>
              You may cancel at any time. Cancellation takes effect at the end
              of the current billing period, and access continues until then.
            </p>
            <p>
              Fees are generally non-refundable except where required by law or
              expressly stated in a written refund policy. For billing
              questions, contact <a href="/support">/support</a>.
            </p>
          </>
        ),
      },
      {
        id: "intellectual-property",
        title: "10. Intellectual Property",
        content: (
          <>
            <p>
              The Service, including software, UI, branding, and documentation,
              is owned by Glinc and protected by intellectual property laws.
              These Terms do not grant you any ownership rights in the Service.
            </p>
          </>
        ),
      },
      {
        id: "user-content-ownership",
        title: "11. User Content & Ownership of Imported Materials",
        content: (
          <>
            <p>
              You retain ownership of content you import or submit. You
              represent that you have the rights needed to use that content with
              the Service. You grant Glinc a limited license to process your
              content solely to provide the Service.
            </p>
          </>
        ),
      },
      {
        id: "third-party-services",
        title: "12. Third-Party Services & Figma Platform Terms",
        content: (
          <>
            <p>
              The Service integrates with third-party platforms, including
              Figma. Your use of those platforms is governed by their terms and
              policies. Glinc is not responsible for third-party services or
              changes they make.
            </p>
          </>
        ),
      },
      {
        id: "ai-output-disclaimer",
        title: "13. AI & Output Disclaimer (Accuracy / Limitations)",
        content: (
          <>
            <p>
              AI-based features (available in Pro) can produce incomplete or
              incorrect results. You are responsible for reviewing, validating,
              and editing Outputs before use.
            </p>
          </>
        ),
      },
      {
        id: "security-availability",
        title: "14. Security & Availability",
        content: (
          <>
            <p>
              We take reasonable measures to secure the Service, but no system
              is fully secure. The Service may be unavailable or change at times
              due to maintenance, updates, or events beyond our control.
            </p>
          </>
        ),
      },
      {
        id: "termination-suspension",
        title: "15. Termination & Suspension",
        content: (
          <>
            <p>
              We may suspend or terminate access if you violate these Terms or
              if required to comply with law. You may stop using the Service at
              any time.
            </p>
          </>
        ),
      },
      {
        id: "disclaimer-warranties",
        title: "16. Disclaimer of Warranties",
        content: (
          <>
            <p>
              The Service is provided "as is" and "as available" without
              warranties of any kind, whether express or implied, including
              implied warranties of merchantability, fitness for a particular
              purpose, and non-infringement.
            </p>
          </>
        ),
      },
      {
        id: "limitation-liability",
        title: "17. Limitation of Liability",
        content: (
          <>
            <p>
              To the maximum extent permitted by law, Glinc will not be liable
              for indirect, incidental, special, consequential, or punitive
              damages, or for loss of profits, data, or goodwill, arising from
              or related to the Service.
            </p>
          </>
        ),
      },
      {
        id: "indemnification",
        title: "18. Indemnification",
        content: (
          <>
            <p>
              You agree to indemnify and hold harmless Glinc from claims,
              damages, liabilities, and expenses arising from your use of the
              Service, your Content, or your violation of these Terms.
            </p>
          </>
        ),
      },
      {
        id: "privacy-data",
        title: "19. Privacy & Data Processing",
        content: (
          <>
            <p>
              We aim to collect only the minimum data necessary to operate the
              Service. For details on our data practices, see{" "}
              <a href="/privacy">/privacy</a>.
            </p>
          </>
        ),
      },
      {
        id: "changes-terms",
        title: "20. Changes to These Terms",
        content: (
          <>
            <p>
              We may update these Terms from time to time. If changes are
              material, we will provide reasonable notice. Continued use of the
              Service after changes take effect means you accept the updated
              Terms.
            </p>
          </>
        ),
      },
      {
        id: "governing-law",
        title: "21. Governing Law & Disputes (Georgia)",
        content: (
          <>
            <p>
              These Terms are governed by the laws of Georgia. Any disputes will
              be resolved in the courts of Georgia, unless otherwise required by
              applicable law.
            </p>
          </>
        ),
      },
      {
        id: "contact",
        title: "22. Contact",
        content: (
          <>
            <p>
              Questions about these Terms? Contact{" "}
              <a href="mailto:hey@web2wireframe.design">
                hey@web2wireframe.design
              </a>{" "}
              or visit <a href="/support">/support</a>.
            </p>
          </>
        ),
      },
    ],
    []
  );

  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const headingElements = sections
      .map((section) => document.getElementById(section.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (headingElements.length === 0) return;

    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              a.boundingClientRect.top - b.boundingClientRect.top
          );
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "0px 0px -70% 0px", threshold: [0, 0.1] }
    );

    headingElements.forEach((heading) =>
      observerRef.current?.observe(heading)
    );

    return () => observerRef.current?.disconnect();
  }, [sections]);

  const handleNavClick = (id: string) => {
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className={styles.page}>
      <div className={`container ${styles.layout}`}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2>Terms & Conditions</h2>
            <span>Effective date: 2026-01-17</span>
          </div>
          <nav>
            <ul className={styles.sidebarList}>
              {sections.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    className={`${styles.sidebarLink} ${
                      activeId === section.id ? styles.active : ""
                    }`}
                    onClick={() => handleNavClick(section.id)}
                    aria-current={activeId === section.id ? "true" : undefined}
                  >
                    {section.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <main className={styles.content}>
          <header className={styles.header}>
            <h1>Terms & Conditions</h1>
            <p>
              These Terms describe how Web2Wireframe works, how plans are billed,
              and how you may use Outputs. Please read them carefully.
            </p>
          </header>

          {sections.map((section) => (
            <section key={section.id} className={styles.section}>
              <h2 id={section.id} data-terms-section>
                {section.title}
              </h2>
              {section.content}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
};

export default Terms;
