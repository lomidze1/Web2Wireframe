import { render } from "preact";
import { gateConsoleInProduction } from "../shared/consoleGating";
import { App } from "./App";

gateConsoleInProduction();

render(<App />, document.getElementById("app")!);
