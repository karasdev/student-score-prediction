// One big number with a label (the tiles at the top of the dashboard).
import { createElement as h } from "react";

function Stat(props) {
  return h("div", { className: "card stat" },
    h("div", { className: "value" }, props.value),
    h("div", { className: "label" }, props.label));
}

export default Stat;
