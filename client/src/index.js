// Entry point, like CRA's src/index.js. index.html loads it as <script type="module">.
// (CRA would also  import "./index.css"  - that needs a bundler, so index.html links the CSS instead.)
import { createElement as h } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";

const root = createRoot(document.getElementById("root"));
root.render(h(App));
