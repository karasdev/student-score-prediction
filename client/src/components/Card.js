// White box with an optional title and hint line.
import { createElement as h } from "react";

function Card(props) {
  return h("div", { className: "card", style: props.style },
    props.title && h("h3", null, props.title),
    props.hint && h("p", { className: "hint" }, props.hint),
    props.children);
}

export default Card;
