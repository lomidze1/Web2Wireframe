import type { ReactElement, ReactNode } from "react";
import DoksSidebar from "./DoksSidebar";
import DocsRightNav from "./DocsRightNav";
import DocsBreadcrumb from "./DocsBreadcrumb";
import styles from "./Docs.module.scss";

interface DocsLayoutProps {
  children: ReactNode;
}

const DocsLayout = ({ children }: DocsLayoutProps): ReactElement => {
  return (
    <div className={styles.docsContainer}>
      <DoksSidebar />
      <div className={styles.mainWrapper}>
        <DocsBreadcrumb />
        <main className={styles.mainContent}>{children}</main>
      </div>
      <DocsRightNav />
    </div>
  );
};

export default DocsLayout;
