// Students: list on the left, the selected student's details on the right.
import { createElement as h, useState, useEffect } from "react";
import { api } from "../api.js";
import Card from "../components/Card.js";
import StudentDetail from "../components/StudentDetail.js";

function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api("/students").then((list) => {
      setStudents(list);
      if (list.length) setSelected(list[0].id);
    }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!selected) return;
    setDetail(null);
    api("/students/" + selected).then(setDetail).catch((e) => setError(e.message));
  }, [selected]);

  if (error) return h("p", { className: "error" }, error);
  return h("div", { className: "row" },
    h(Card, { style: { padding: 8 } },
      h("div", { className: "list" }, students.map((s) =>
        h("button", { key: s.id, className: s.id === selected ? "active" : "", onClick: () => setSelected(s.id) },
          s.name, h("span", { style: { color: "#9ca3af" } }, " · " + s.className))))),
    h("div", { style: { flex: 1 } }, detail ? h(StudentDetail, { detail }) : h("p", null, students.length ? "Loading..." : "No students yet."))
  );
}

export default StudentsPage;
