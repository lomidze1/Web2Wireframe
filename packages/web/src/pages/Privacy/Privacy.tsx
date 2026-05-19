import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
        title: "Purpose of this Privacy Policy",
        content: (
          <p>
            This Privacy Policy explains how Glinc collects, uses, and protects
            information when you use Web2Wireframe (W2W).
          </p>
        ),
      },
      {
        id: "who-we-are",
        title: "Who We Are",
        content: (
          <p>
            W2W is operated by Glinc, a company based in Georgia. If you have
            questions, contact us at{" "}
            <a href="mailto:hey@web2wireframe.design">
              hey@web2wireframe.design
            </a>
            .
          </p>
        ),
      },
      {
        id: "what-we-collect",
        title: "Information We Collect",
        content: (
          <>
            <p>
              We collect limited data needed to run the Service. This may
              include:
            </p>
            <ul>
              <li>
                Information you provide, such as your email address and the
                content of support messages submitted through{" "}
                <a href="/support">/support</a>.
              </li>
              <li>
                Technical data, such as IP address, browser and device
                information, timestamps, and error logs.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "how-we-use",
        title: "How We Use Information",
        content: (
          <>
            <p>We use information to:</p>
            <ul>
              <li>Respond to support requests and communicate with you.</li>
              <li>Operate, secure, and improve the Service.</li>
              <li>Diagnose errors and prevent abuse.</li>
            </ul>
          </>
        ),
      },
      {
        id: "cookies-local-storage",
        title: "Cookies & Local Storage",
        content: (
          <p>
            W2W may use functional cookies or localStorage to remember
            preferences (for example, UI settings). We do not use these for
            aggressive tracking.
          </p>
        ),
      },
      {
        id: "third-party",
        title: "Third-Party Services",
        content: (
          <p>
            We may use service providers to host the Service and deliver email
            support. These providers only receive data necessary to perform
            their services. We do not sell your personal data.
          </p>
        ),
      },
      {
        id: "payment-data",
        title: "Payment Data",
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
        title: "Tax Notice",
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
        id: "retention",
        title: "Data Retention",
        content: (
          <p>
            We keep data only as long as needed for the purposes described in
            this Policy or as required by law. Support records may be retained
            to help resolve ongoing issues. Payment metadata is retained for
            the period required by accounting law (see Payment Data above).
          </p>
        ),
      },
      {
        id: "sharing",
        title: "Data Sharing",
        content: (
          <p>
            We do not sell personal data. We may share data only with trusted
            service providers or where required by law.
          </p>
        ),
      },
      {
        id: "international-transfers",
        title: "International Data Transfers",
        content: (
          <p>
            If you access W2W from outside Georgia, your data may be processed
            in other locations where our service providers operate. We take
            reasonable steps to protect it.
          </p>
        ),
      },
      {
        id: "rights",
        title: "Your Rights",
        content: (
          <p>
            You can request access to, correction of, or deletion of your
            personal data by contacting us. We may need to verify your request.
          </p>
        ),
      },
      {
        id: "security",
        title: "Security",
        content: (
          <p>
            We use reasonable technical and organizational measures to protect
            data. No system is perfectly secure, and we cannot guarantee
            absolute security.
          </p>
        ),
      },
      {
        id: "children",
        title: "Children’s Privacy",
        content: (
          <p>
            W2W is not intended for children under 13, and we do not knowingly
            collect personal data from them.
          </p>
        ),
      },
      {
        id: "changes",
        title: "Changes to This Policy",
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
        title: "Contact",
        content: (
          <p>
            For privacy questions or requests, contact{" "}
            <a href="mailto:hey@web2wireframe.design">
              hey@web2wireframe.design
            </a>{" "}
            or visit <a href="/support">/support</a>.
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
