// App shell: header with page links, and the page for the current URL.
// To add a page: create it in pages/, add a route (and a NAV entry if it needs a tab).
import { createElement as h } from "react";
import { usePath, matchPath, Link } from "./router.js";
import DashboardPage from "./pages/DashboardPage.js";
import StudentsPage from "./pages/StudentsPage.js";
import ModelPage from "./pages/ModelPage.js";

// first match wins; ":id" parts are passed to the page as props.params
const ROUTES = [
  { path: "/", component: DashboardPage },
  { path: "/students", component: StudentsPage },
  { path: "/students/:id", component: StudentsPage },
  { path: "/model", component: ModelPage },
];

const NAV = [
  { to: "/", title: "Dashboard" },
  { to: "/students", title: "Students" },
  { to: "/model", title: "Model" },
];

function NotFound() {
  return h("p", null, "Page not found. ", h(Link, { to: "/" }, "Go to the dashboard"));
}

// "/students/12" is under the "Students" tab; "/" only matches itself
const isActive = (to, path) => (to === "/" ? path === "/" : path === to || path.startsWith(to + "/"));

function App() {
  const path = usePath();
  let page = null;
  for (const route of ROUTES) {
    const params = matchPath(route.path, path);
    if (params) {
      page = h(route.component, { params });
      break;
    }
  }
  return h("div", null,
    h("header", null,
      h("h1", null, "Student Score Prediction"),
      h("nav", null, NAV.map((n) =>
        h(Link, { key: n.to, to: n.to, className: isActive(n.to, path) ? "active" : "" }, n.title)))),
    h("main", null, page || h(NotFound))
  );
}

export default App;
