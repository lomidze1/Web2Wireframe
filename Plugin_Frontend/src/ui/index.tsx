/** @jsx h */
import { h } from "preact";
import { render } from "@create-figma-plugin/ui";
import App from "./App";

// Ensure CSS is loaded in the plugin UI bundle
import "./styles/global.css"; // CSS variables (tokens)
import "./styles/ui.css"; // Base layout

export default render(App);
