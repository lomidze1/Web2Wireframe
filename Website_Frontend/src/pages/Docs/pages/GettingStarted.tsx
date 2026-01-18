import type { ReactElement } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DocsLayout from "../DocsLayout";

const GettingStartedOverview = (): ReactElement => (
  <DocsLayout>
    <h2>Getting Started</h2>
    <p>
      Web2Wireframe is a Figma plugin that lets you turn any website into a
      clean, structured wireframe in seconds. It reads the page structure and
      generates an editable layout in Figma without unnecessary visual detail.
    </p>

    <h3>What is Web2Wireframe?</h3>
    <p>
      Web2Wireframe converts live websites into wireframes so you can focus on
      layout, hierarchy, and structure before visual polish.
    </p>

    <h3>What can Web2Wireframe do?</h3>
    <ul>
      <li>Convert existing websites into wireframe layouts.</li>
      <li>Kickstart redesigns or UX explorations faster.</li>
      <li>Save time on manual layout building.</li>
      <li>Produce clean, logically organized frames.</li>
    </ul>
    <p>Every generated element is fully editable in Figma.</p>

    <h3>How it works</h3>
    <ol>
      <li>Choose an import method.</li>
      <li>Web2Wireframe processes the structure.</li>
      <li>Your wireframe appears directly on the Figma canvas.</li>
    </ol>
    <p>No coding or extra configuration required.</p>

    <h3>Supported import modes</h3>
    <ul>
      <li>Website URL</li>
      <li>Screenshot</li>
      <li>HTML content</li>
      <li>Browser Extension (optional)</li>
    </ul>
    <p>Pick the method that best fits your workflow.</p>

    <h3>Who is it for?</h3>
    <ul>
      <li>UI/UX designers</li>
      <li>Product designers</li>
      <li>Frontend developers</li>
      <li>Startup teams</li>
      <li>Freelancers and agencies</li>
    </ul>

    <h3>Why use Web2Wireframe?</h3>
    <ul>
      <li>Less manual work</li>
      <li>Faster idea validation</li>
      <li>Clear, consistent wireframes</li>
      <li>Better collaboration across teams</li>
    </ul>
    <p>Web2Wireframe does not replace designers. It speeds them up.</p>

    <h3>Next step</h3>
    <p>
      When you are ready, continue to{" "}
      <a href="/docs/start/how-to-install">How to Install</a>.
    </p>
  </DocsLayout>
);

const InstallPlugin = (): ReactElement => (
  <DocsLayout>
    <h2>Install Plugin</h2>
    <p>
      This guide shows how to install{" "}
      <a href="https://www.figma.com/community">Web2Wireframe (W2W)</a> from the{" "}
      <a href="https://www.figma.com/community">Figma Community</a> and start
      using it right away. It takes about a minute.
    </p>

    <h3>Install from Figma Community</h3>
    <ol>
      <li>Open the Web2Wireframe page in Figma Community.</li>
      <li>Click Install.</li>
      <li>Open Figma Desktop (recommended) for the smoothest experience.</li>
      <li>
        In Figma, go to: Resources -&gt; Plugins, search for Web2Wireframe, and
        click Run.
      </li>
    </ol>
    <p>That's it. W2W is now installed and ready to use.</p>

    <h3>Where to find the plugin</h3>
    <p>You can launch it from several places in Figma.</p>
    <ul>
      <li>Resources -&gt; Plugins</li>
      <li>Right-click on canvas -&gt; Plugins</li>
      <li>Saved plugins (recommended)</li>
    </ul>

    <h3>Recommended setup</h3>
    <p>These tips keep the workflow fast and reliable.</p>
    <ul>
      <li>Use Figma Desktop.</li>
      <li>Open a new or existing Figma file.</li>
      <li>Save W2W to your favorites for quick access.</li>
    </ul>

    <h3>More from GLINC</h3>
    <p>
      Web2Wireframe is built by GLINC. Explore our other plugins on our{" "}
      <a href="https://www.figma.com/@GLINC">Figma Community profile</a>.
    </p>

    <h3>Next step</h3>
    <p>
      Continue to{" "}
      <a href="https://www.figma.com/community">First Import</a> to generate
      your first wireframe.
    </p>
  </DocsLayout>
);

const PlaceholderPage = ({
  title,
  nextLabel,
  nextPath,
}: {
  title: string;
  nextLabel: string;
  nextPath: string;
}): ReactElement => (
  <DocsLayout>
    <h2>{title}</h2>
    <p>Content coming soon.</p>
    <h3>Next step</h3>
    <p>
      Continue to <a href={nextPath}>{nextLabel}</a>.
    </p>
  </DocsLayout>
);

const GettingStarted = (): ReactElement => (
  <Routes>
    <Route index element={<Navigate to="overview" replace />} />
    <Route path="overview" element={<GettingStartedOverview />} />
    <Route path="install" element={<InstallPlugin />} />
    <Route
      path="first-import"
      element={
        <PlaceholderPage
          title="First Import"
          nextLabel="Choosing Import Mode"
          nextPath="/docs/getting-started/choosing-mode"
        />
      }
    />
    <Route
      path="choosing-mode"
      element={
        <PlaceholderPage
          title="Choosing Import Mode"
          nextLabel="Editing & Handoff"
          nextPath="/docs/getting-started/editing-handoff"
        />
      }
    />
    <Route
      path="editing-handoff"
      element={
        <PlaceholderPage
          title="Editing & Handoff"
          nextLabel="How to Install"
          nextPath="/docs/start/how-to-install"
        />
      }
    />
    <Route path="*" element={<Navigate to="overview" replace />} />
  </Routes>
);

export default GettingStarted;
