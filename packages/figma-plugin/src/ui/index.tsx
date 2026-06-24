/** @jsx h */
import { h } from "preact";
import { render } from "@create-figma-plugin/ui";
import App from "./App";
import { installDevLogger } from "../utils/devLogger";

// Ensure CSS is loaded in the plugin UI bundle
import "./styles/global.css"; // CSS variables (tokens)
import "./styles/ui.css"; // Base layout

if (__W2W_DEV_LOG__) installDevLogger();

export default render(App);
