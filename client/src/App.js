// App shell: header with page tabs. To add a page, create it in pages/ and add it to PAGES.
import { createElement as h, useState } from "react";
import DashboardPage from "./pages/DashboardPage.js";
import StudentsPage from "./pages/StudentsPage.js";
import ModelPage from "./pages/ModelPage.js";

const PAGES = {
  dashboard: { title: "Dashboard", component: DashboardPage },
  students: { title: "Students", component: StudentsPage },
  model: { title: "Model", component: ModelPage },
};

function App() {
  const [page, setPage] = useState("dashboard");
  return h("div", null,
    h("header", null,
      h("h1", null, "Student Score Prediction"),
      h("nav", null, Object.keys(PAGES).map((p) =>
        h("button", { key: p, className: p === page ? "active" : "", onClick: () => setPage(p) }, PAGES[p].title)))),
    h("main", null, h(PAGES[page].component))
  );
}

export default App;
