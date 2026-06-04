import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import EmailLink from "../../components/EmailLink";
import styles from "./Privacy.module.scss";

type PrivacySection = {
  id: string;
  title: string;
  content: ReactElement;
};

const Privacy = (): ReactElement => {
  const sections = useMemo<PrivacySection[]>(
    () => [
      {
        id: "purpose",
        title: "1. Purpose of this Privacy Policy",
        content: (
          <p>
            This Privacy Policy explains how Glinc collects, uses, and protects
            information when you use Web2Wireframe (W2W).
          </p>
        ),
      },
      {
        id: "who-we-are",
        title: "2. Who We Are",
        content: (
          <p>
            W2W is operated by Glinc, a project of Giorgi Lomidze, a registered
            Individual Entrepreneur in Georgia (the country, not the U.S. state).
            Glinc is the data controller for personal data processed through the
            Service. Registered address: Georgia, Shida Kartli, Khashuri,
            Borjomis st. N 106. If you have questions, contact us at{" "}
            <EmailLink email="hey@web2wireframe.design" />
          </p>
        ),
      },
      {
        id: "what-we-collect",
        title: "3. Information We Collect",
        content: (
          <>
            <p>
              We collect limited data needed to run the Service. This may
              include:
            </p>
            <ul>
              <li>
                <strong>Figma user ID.</strong> When you connect Figma, we
                receive your Figma user ID via Figma OAuth (scope:{" "}
                <code>current_user:read</code>). This ID is the key we use to
                store your plan and import usage. We do not receive your Figma
                files or designs.
              </li>
              <li>
                <strong>Imported content.</strong> The URLs, HTML, screenshots,
                or files you submit for conversion into wireframes.
              </li>
              <li>
                <strong>Email address.</strong> Provided when you contact{" "}
                <a href="/support">/support</a>, complete a purchase (via Flitt),
                or subscribe to our newsletter.
              </li>
              <li>
                <strong>Support messages.</strong> The content of messages you
                submit through <a href="/support">/support</a>.
              </li>
              <li>
                <strong>Technical data.</strong> IP address, browser and device
                information, timestamps, and error logs.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "how-we-use",
        title: "4. How We Use Information & Legal Basis",
        content: (
          <>
            <p>
              We use your information for the purposes below. Where the EU/UK
              GDPR applies, the legal basis for each is noted:
            </p>
            <ul>
              <li>
                Provide the Service and manage your plan and license —{" "}
                <strong>performance of a contract</strong>.
              </li>
              <li>
                Process payments and keep tax and accounting records —{" "}
                <strong>legal obligation</strong>.
              </li>
              <li>
                Respond to support requests and communicate with you —{" "}
                <strong>legitimate interest</strong> (and, where relevant,
                performance of a contract).
              </li>
              <li>
                Secure the Service, diagnose errors, prevent abuse, and improve
                W2W — <strong>legitimate interest</strong>.
              </li>
              <li>
                Send marketing or newsletter emails — <strong>consent</strong>,
                which you can withdraw at any time.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "imported-content-processing",
        title: "5. How Imported Content Is Processed",
        content: (
          <>
            <p>
              When you import a website, its content is processed to generate
              your wireframe. For the Screenshot import feature, the image you
              upload is sent to an AI service that interprets its layout.
            </p>
            <p>
              We do not use your imported content or Outputs to train AI models.
              Imported content is processed only to produce your result.
            </p>
          </>
        ),
      },
      {
        id: "cookies-local-storage",
        title: "6. Cookies & Local Storage",
        content: (
          <p>
            W2W may use functional localStorage to remember preferences (for
            example, UI settings). We do not use analytics, advertising, or
            tracking cookies.
          </p>
        ),
      },
      {
        id: "subprocessors",
        title: "7. Third-Party Providers",
        content: (
          <p>
            We rely on a small number of trusted third-party providers to
            operate the Service — for example, to process payments, send email,
            host the Service, and power AI features. They act as our processors,
            receive only the data needed to do their job, and are not permitted
            to use it for their own purposes.{" "}
            <strong>We do not sell your personal data.</strong>
          </p>
        ),
      },
      {
        id: "payment-data",
        title: "8. Payment Data",
        content: (
          <>
            <p>
              Pro payments are processed by{" "}
              <a
                href="https://flitt.com/"
                target="_blank"
                rel="noreferrer"
              >
                Flitt
              </a>
              , a PCI-DSS Level 1 payment gateway. Card data is collected,
              processed, and stored exclusively by Flitt — Web2Wireframe never
              receives or stores card numbers, CVCs, or expiration dates.
            </p>
            <p>
              We retain payment metadata necessary for tax and accounting
              compliance: order ID, transaction ID, charged amount, currency,
              status, billing email, and the Figma user ID associated with the
              purchase. This information is retained for the period
              required by Georgian accounting law (typically 7 years).
            </p>
          </>
        ),
      },
      {
        id: "tax-notice",
        title: "9. Tax Notice",
        content: (
          <p>
            Web2Wireframe is operated from outside the European Union.
            Customers are responsible for any local taxes (such as VAT)
            applicable in their own jurisdiction. Prices displayed in the
            Service and on our website are exclusive of such taxes.
          </p>
        ),
      },
      {
        id: "marketing-newsletter",
        title: "10. Marketing & Newsletter",
        content: (
          <p>
            We only send marketing or newsletter emails if you explicitly opt in.
            You can unsubscribe at any time using the link in any such email.
            Opting out of marketing does not stop essential transactional emails
            (for example, payment receipts or support replies).
          </p>
        ),
      },
      {
        id: "retention",
        title: "11. Data Retention",
        content: (
          <>
            <p>
              We keep data only as long as needed for the purposes described in
              this Policy or as required by law:
            </p>
            <ul>
              <li>
                <strong>Plan &amp; usage</strong> (tied to your Figma user ID) —
                kept for as long as you use the Service.
              </li>
              <li>
                <strong>Payment metadata</strong> — retained for the period
                required by Georgian accounting law (typically 7 years; see
                Payment Data above).
              </li>
              <li>
                <strong>Support records</strong> — retained as needed to resolve
                ongoing issues.
              </li>
              <li>
                <strong>Technical &amp; error logs</strong> — retained for a
                short period for security and diagnostics.
              </li>
              <li>
                <strong>Imported content</strong> — processed transiently and not
                retained beyond delivering your result.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "sharing",
        title: "12. Data Sharing",
        content: (
          <>
            <p>
              <strong>We do not sell your personal data.</strong> We share data
              only in these limited cases:
            </p>
            <ul>
              <li>
                With the third-party providers that operate the Service (see
                Third-Party Providers above), acting as our processors.
              </li>
              <li>
                Where required by law — for example, to comply with a legal
                obligation, court order, or a lawful request from authorities.
              </li>
              <li>
                In connection with a business transfer (such as a merger,
                acquisition, or sale of assets), in which case this Policy
                continues to apply to your data.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "international-transfers",
        title: "13. International Data Transfers",
        content: (
          <p>
            If you access W2W from outside Georgia, your data may be processed
            in other locations where our sub-processors operate, including the
            European Union and the United States. We take reasonable steps to
            protect it and rely on our providers' safeguards for such transfers.
          </p>
        ),
      },
      {
        id: "automated-decisions",
        title: "14. Automated Decision-Making",
        content: (
          <p>
            We do not use your personal data for automated decision-making or
            profiling that produces legal or similarly significant effects.
          </p>
        ),
      },
      {
        id: "rights",
        title: "15. Your Rights",
        content: (
          <>
            <p>
              Depending on your location (including under the EU/UK GDPR), you
              may have the right to:
            </p>
            <ul>
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion of your data ("right to be forgotten").</li>
              <li>Receive your data in a portable format.</li>
              <li>Object to or restrict certain processing.</li>
              <li>Withdraw consent at any time, where processing is based on consent.</li>
              <li>
                Lodge a complaint with your local data protection authority (in
                Georgia, the Personal Data Protection Service).
              </li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{" "}
              <EmailLink email="hey@web2wireframe.design" /> — we may need to
              verify your identity before acting on a request.
            </p>
          </>
        ),
      },
      {
        id: "security",
        title: "16. Security",
        content: (
          <p>
            We use reasonable technical and organizational measures to protect
            data: traffic is encrypted in transit (HTTPS), card data is never
            stored on our servers (it is handled by Flitt), and access to data
            is limited to what is needed to run the Service. No system is
            perfectly secure, and we cannot guarantee absolute security.
          </p>
        ),
      },
      {
        id: "children",
        title: "17. Children’s Privacy",
        content: (
          <p>
            W2W is not intended for children under 16, and we do not knowingly
            collect personal data from them.
          </p>
        ),
      },
      {
        id: "changes",
        title: "18. Changes to This Policy",
        content: (
          <p>
            We may update this Policy from time to time. If changes are
            material, we will provide notice. Continued use of the Service means
            you accept the updated Policy.
          </p>
        ),
      },
      {
        id: "contact",
        title: "19. Contact",
        content: (
          <p>
            For privacy questions or requests, contact{" "}
            <EmailLink email="hey@web2wireframe.design" /> or visit{" "}
            <a href="/support">/support</a>.
          </p>
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
            <h2>Privacy Policy</h2>
            <span>Effective date: 2026-06-16</span>
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
            <h1>Privacy Policy</h1>
            <p>
              This Privacy Policy describes how W2W handles information collected
              through the Service.
            </p>
          </header>

          {sections.map((section) => (
            <section key={section.id} className={styles.section}>
              <h2 id={section.id}>{section.title}</h2>
              {section.content}
            </section>
          ))}
        </main>
      </div>
    </div>
  );
};

export default Privacy;
