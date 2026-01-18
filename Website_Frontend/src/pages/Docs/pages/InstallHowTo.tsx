import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const InstallHowTo = (): ReactElement => (
  <DocsLayout>
    <h2>How to Install</h2>

    <h3>Installation overview</h3>
    <p>
      Installing Web2Wireframe is a quick and straightforward process. The
      plugin is distributed through the Figma Community and can be added to
      your Figma account in just a few clicks.
    </p>
    <p>
      Once installed, Web2Wireframe becomes available directly inside Figma,
      where you can launch it from the Plugins menu and start working
      immediately. No additional setup, configuration, or technical steps are
      required before your first use.
    </p>
    <p>
      This section explains the basic installation flow before walking you
      through each step in more detail below.
    </p>

    <h3>Install from Figma Community</h3>
    <p>
      Web2Wireframe is installed directly from the Figma Community, making the
      process simple and reliable. Installing from the Community ensures that
      you always use the official version of the plugin and receive updates
      automatically.
    </p>
    <p>
      To install the plugin, open the Web2Wireframe page in Figma Community and
      click Install. The plugin will be added to your Figma account and become
      available inside Figma immediately.
    </p>
    <p>
      Once the installation is complete, no additional setup is required. You
      can move on to opening Figma and running the plugin from the Plugins
      menu.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Figma Community plugin page with the Install button"
      />
      <figcaption className={styles.imageCaption}>
        Install Web2Wireframe directly from the Figma Community.
      </figcaption>
    </figure>

    <h3>Where to find the plugin</h3>
    <p>
      After installing Web2Wireframe, the plugin becomes available directly
      inside Figma. You can access it from any Figma file, whether you are
      starting a new project or working on an existing one.
    </p>
    <p>
      To find the plugin, open Resources -&gt; Plugins in Figma and search for
      Web2Wireframe. Once found, you can run it immediately or save it for
      quick access in future sessions.
    </p>
    <p>
      If the plugin does not appear right away, refreshing Figma or reopening
      the file usually resolves the issue.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Figma interface with Resources panel open and Web2Wireframe visible"
      />
      <figcaption className={styles.imageCaption}>
        Access Web2Wireframe from the Plugins menu in Figma.
      </figcaption>
    </figure>

    <h3>Running Web2Wireframe</h3>
    <p>
      Once you've located the plugin in Figma, launching Web2Wireframe is
      simple. From the Plugins list, click Run to open the plugin interface.
    </p>
    <p>
      When the plugin starts, it opens in a separate panel where you can
      choose your import method and adjust basic settings before generating a
      wireframe. You can run Web2Wireframe as many times as needed within the
      same file or across different projects.
    </p>
    <p>
      If the plugin does not open immediately, closing and reopening Figma or
      re-running the plugin usually resolves the issue.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Web2Wireframe selected in Plugins list with the plugin interface open"
      />
      <figcaption className={styles.imageCaption}>
        Launch Web2Wireframe and start your first import.
      </figcaption>
    </figure>
  </DocsLayout>
);

export default InstallHowTo;
