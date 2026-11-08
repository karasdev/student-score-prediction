// Tiny router (instead of react-router): the URL path picks the page, and links change the URL
// without reloading. Back/forward, reload and bookmarks all work.
//   const path = usePath();                          current path, re-renders when it changes
//   matchPath("/students/:id", "/students/12")       -> { id: "12" }  (null if no match)
//   h(Link, { to: "/model" }, "Model")               an <a> that navigates without reloading
//   navigate("/students/3", { replace: true })       change the URL from code
// serve.js sends index.html for any page path, so a reload on /students/12 works too.
import { createElement as h, useState, useEffect } from "react";

const listeners = new Set();

export function navigate(to, options) {
  if (to === window.location.pathname) return;
  if (options && options.replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  listeners.forEach((fn) => fn());
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    listeners.add(update);
    window.addEventListener("popstate", update); // back / forward buttons
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return path;
}

export function matchPath(pattern, path) {
  const want = pattern.split("/").filter(Boolean);
  const got = path.split("/").filter(Boolean);
  if (want.length !== got.length) return null;
  const params = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i][0] === ":") params[want[i].slice(1)] = got[i];
    else if (want[i] !== got[i]) return null;
  }
  return params;
}

export function Link(props) {
  const { to, ...rest } = props;
  return h("a", {
    ...rest,
    href: to,
    onClick: (e) => {
      // let the browser handle Cmd/Ctrl-click (new tab), middle-click, etc.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(to);
    },
  });
}
