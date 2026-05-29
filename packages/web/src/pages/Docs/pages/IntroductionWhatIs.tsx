import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";

const IntroductionWhatIs = (): ReactElement => (
  <DocsLayout>
    <h1>What is Web2Wireframe?</h1>

    <h2>Overview</h2>
    <p>
      <strong>Web2Wireframe - Website to Wireframe in Figma</strong>
    </p>
    <p>
      Web2Wireframe is a Figma plugin that converts websites into clean,
      structured wireframes in seconds. It combines multi-method import (URL,
      screenshot, HTML, area capture, browser extension), reusable wireframe
      libraries, and a growing community to help you move from existing
      websites to editable Figma layouts faster and more consistently.
    </p>

    <h2>What problem it solves</h2>
    <p>
      Creating wireframes from existing websites is often slow and repetitive.
      Designers and product teams usually spend hours manually rebuilding
      layouts just to understand structure, hierarchy, and content flow.
      Web2Wireframe removes this friction by automatically converting websites
      into structured wireframes. Instead of starting from a blank canvas, you
      get an organized layout that reflects the real page structure and can be
      edited, refined, or redesigned immediately.
    </p>
    <p>This makes Web2Wireframe especially useful when:</p>
    <ul>
      <li>Starting a redesign or UX audit</li>
      <li>Exploring ideas based on real products or competitors</li>
      <li>Working under tight deadlines</li>
      <li>Collaborating with teams that need clear, structural layouts</li>
    </ul>
    <p>
      By handling the repetitive groundwork, Web2Wireframe lets you focus on
      decision-making, UX, and design quality instead of manual reconstruction.
    </p>

    <h2>How Web2Wireframe works</h2>
    <p>
      Web2Wireframe works by analyzing the structure of a website rather than
      its visual design. It detects layout, hierarchy, and content blocks, then
      converts them into clean wireframe elements inside Figma.
    </p>
    <p>
      You choose an import method, adjust basic settings if needed, and start
      the generation. The plugin uses AI-assisted processing to organize
      sections, components, and spacing, producing a wireframe that reflects
      the original page while remaining fully editable.
    </p>
    <p>
      The result is a structured starting point in Figma that you can quickly
      iterate on, customize, or redesign without rebuilding everything from
      scratch.
    </p>

    <h2>What you get in Figma</h2>
    <p>
      After the generation is complete, Web2Wireframe creates a structured
      wireframe directly on your Figma canvas. All elements are organized into
      logical sections, making the layout easy to understand, navigate, and
      modify.
    </p>
    <p>
      Every wireframe is fully editable. You can adjust spacing, rearrange
      components, replace content, or apply your own design system without
      limitations. The generated structure is designed to support iteration,
      not lock you into a fixed layout.
    </p>
    <p>
      Web2Wireframe also integrates wireframe libraries, allowing you to reuse
      common components and maintain consistency across pages and projects as
      you continue working in Figma.
    </p>
  </DocsLayout>
);

export default IntroductionWhatIs;
