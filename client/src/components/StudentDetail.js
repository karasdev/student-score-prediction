// One student: actual vs predicted chart, term-by-term table, and "what if" for the next term.
import { createElement as h } from "react";
import { fmt } from "../format.js";
import Card from "./Card.js";
import WhatIf from "./WhatIf.js";
import LineChart from "../charts/LineChart.js";

// factor columns in the term table: [key, header]. Columns with no data for this student are hidden.
const LOG_COLUMNS = [
  ["studyHours", "Study"], ["sleepHours", "Sleep"], ["attendance", "Attend."], ["parentSupport", "Parents"],
  ["homeworkPct", "Homework"], ["lateMissing", "Late work"], ["earlyQuizPct", "Early quiz"],
  ["lateArrivals", "Late class"], ["participation", "Particip."], ["onlineLogins", "Online"],
  ["confidence", "Confid."], ["motivation", "Motiv."], ["studySkills", "Skills"],
  ["targetScore", "Target"], ["screenHours", "Screen"],
];

function StudentDetail(props) {
  const { student, terms } = props.detail;
  const nextTerm = terms.filter((t) => t.predicted != null && t.actual == null).slice(-1)[0];
  const columns = LOG_COLUMNS.filter(([k]) => terms.some((t) => t.factors && t.factors[k] != null));
  return h("div", { className: "grid" },
    h(Card, { title: student.name + " – actual vs predicted" },
      h(LineChart, { labels: terms.map((t) => "T" + t.term), yLabel: "Score %", series: [
        { name: "Actual", values: terms.map((t) => t.actual) },
        { name: "Predicted", values: terms.map((t) => t.predicted), dashed: true },
      ] })),
    h(Card, { title: "Term by term" },
      h("div", { className: "table-scroll" },
        h("table", null,
          h("thead", null, h("tr", null, ["Term", "Actual", "Predicted"].concat(columns.map((c) => c[1])).map((c) => h("th", { key: c }, c)))),
          h("tbody", null, terms.map((t) => h("tr", { key: t.term },
            h("td", null, "T" + t.term), h("td", null, fmt(t.actual)), h("td", null, fmt(t.predicted)),
            columns.map(([k]) => h("td", { key: k }, t.factors && t.factors[k] != null ? t.factors[k] : "–")))))))),
    nextTerm && nextTerm.factors && h(WhatIf, { key: student.id + ":" + nextTerm.term, studentId: student.id, term: nextTerm.term })
  );
}

export default StudentDetail;
