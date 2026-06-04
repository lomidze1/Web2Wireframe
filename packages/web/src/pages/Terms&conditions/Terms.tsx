import type { ReactElement } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import EmailLink from "../../components/EmailLink";
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
              project of Giorgi Lomidze, a registered Individual Entrepreneur in
              Georgia. Registered address: Georgia, Shida Kartli, Khashuri,
              Borjomis st. N 106. You can contact us at{" "}
              <EmailLink email="hey@web2wireframe.design" />
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
              "Plan" means a Free or Pro tier.
            </li>
          </ol>
        ),
      },
      {
        id: "eligibility-accounts",
        title: "4. Eligibility & Figma Identity",
        content: (
          <>
            <p>
              You must be able to form a binding agreement under applicable law
              to use the Service. If you use the Service on behalf of an
              organization, you represent that you are authorized to accept
              these Terms on its behalf.
            </p>
            <p>
              W2W does not have its own registration, usernames, or passwords.
              Your identity is established through Figma sign-in (Figma OAuth,
              scope <code>current_user:read</code>), and your plan and import
              usage are tied to your Figma user ID. You are responsible for
              activity that occurs through your Figma sign-in and for keeping
              your Figma account secure.
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
              The Free plan includes 10 imports per month with full access to
              all import features. Once you reach 10 imports in a monthly cycle,
              further imports are blocked until your counter resets at the start
              of the next cycle, or until you upgrade to Pro (which includes
              unlimited imports). Support on the Free plan is provided through
              community channels.
            </p>
            <p>
              Free limits and features may change over time. For the current
              plan matrix, visit <a href="/pricing">/pricing</a>.
            </p>
          </>
        ),
      },
      {
        id: "payment-access",
        title: "8. Payment & Access",
        content: (
          <>
            <p>
              The paid plan is Pro, sold as a one-time purchase in two options:
              $16 grants 30 days of Pro access, or $144 grants 365 days. Access
              does not auto-renew and you are not charged automatically — to
              extend Pro you make another one-time purchase. A new purchase made
              while Pro is still active adds its days on top of the time
              remaining. When your Pro period ends without a new purchase, the
              account reverts to the Free tier.
            </p>
            <p>
              Payments are processed by Flitt, a PCI-DSS Level 1 payment
              gateway. Card data is handled exclusively by Flitt — Web2Wireframe
              never receives or stores card details. Prices are exclusive of
              any local taxes (e.g. VAT) for which you may be responsible in
              your jurisdiction.
            </p>
          </>
        ),
      },
      {
        id: "refunds",
        title: "9. Refunds",
        content: (
          <>
            <p>
              Because Pro is a one-time purchase with no auto-renewal, there is
              nothing to cancel — access simply ends when your Pro period is up
              unless you choose to buy again.
            </p>
            <p>
              <strong>All fees are non-refundable.</strong> We do not offer
              prorated refunds for unused time or partial periods. If you
              believe a charge was made in error or you have a billing dispute,
              contact <EmailLink email="billing@web2wireframe.design" /> and we'll
              investigate. Statutory refund rights under your local
              law (where applicable) are not affected by this policy.
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
              The Screenshot import feature uses a third-party AI service to
              interpret the layout of an uploaded image. AI interpretation can
              produce incomplete or incorrect results, and
              all Outputs may contain inaccuracies. You are responsible for
              reviewing, validating, and editing Outputs before use.
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
            <p>
              In any case, Glinc's total aggregate liability for all claims
              arising from or related to the Service will not exceed the amount
              you paid us for the Service in the twelve (12) months immediately
              before the event giving rise to the claim.
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
              These Terms are governed by the laws of Georgia (the country, not
              the U.S. state). Any disputes will be resolved in the courts of
              Georgia, unless otherwise required by applicable law.
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
              <EmailLink email="hey@web2wireframe.design" /> or visit{" "}
              <a href="/support">/support</a>.
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
