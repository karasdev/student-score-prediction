// Students: list on the left, the selected student's details on the right.
// URL: /students/:id selects a student; plain /students jumps to the first one.
import { createElement as h, useState, useEffect, useRef } from "react";
import { api } from "../api.js";
import { Link, navigate } from "../router.js";
import Card from "../components/Card.js";
import StudentDetail from "../components/StudentDetail.js";

function StudentsPage(props) {
  const selected = props.params.id ? Number(props.params.id) : null;
  const [students, setStudents] = useState([]);
  const [detail, setDetail] = useState(null);
  const [listError, setListError] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    api("/students").then(setStudents).catch((e) => setListError(e.message));
  }, []);

  // no student in the URL: show the first one (replace, so Back doesn't land on /students again)
  useEffect(() => {
    if (props.params.id == null && students.length) navigate("/students/" + students[0].id, { replace: true });
  }, [props.params.id, students]);

  // opened from a link like /students/57: scroll the list (not the page) so that student is in the middle
  useEffect(() => {
    const list = listRef.current;
    const active = list && list.querySelector(".active");
    if (!active) return;
    const offset = active.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTop += offset - list.clientHeight / 2 + active.offsetHeight / 2;
  }, [students]);

  useEffect(() => {
    if (selected == null) return;
    setDetail(null);
    setDetailError(null);
    api("/students/" + selected).then(setDetail).catch((e) => setDetailError(e.message));
  }, [selected]);

  if (listError) return h("p", { className: "error" }, listError);
  let right;
  if (detailError) right = h("p", { className: "error" }, detailError);
  else if (detail) right = h(StudentDetail, { detail });
  else right = h("p", null, students.length ? "Loading..." : "No students yet.");

  return h("div", { className: "row" },
    h(Card, { style: { padding: 8 } },
      h("div", { className: "list", ref: listRef }, students.map((s) =>
        h(Link, { key: s.id, to: "/students/" + s.id, className: s.id === selected ? "active" : "" },
          s.name, h("span", { style: { color: "#9ca3af" } }, " · " + s.className))))),
    h("div", { style: { flex: 1 } }, right)
  );
}

export default StudentsPage;
