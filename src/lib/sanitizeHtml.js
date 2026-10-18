const blockedTags = new Set([
  "script", "style", "iframe", "object", "embed", "link", "meta", "base",
  "form", "input", "button", "textarea", "select", "option", "template", "svg", "math"
]);
const uriAttrs = new Set(["href", "src", "xlink:href", "action", "formaction", "poster"]);
const blockedAttrs = new Set(["srcdoc", "formaction", "action", "method", "autofocus", "contenteditable"]);
const unsafeCss = /(?:url\s*\(|expression\s*\(|@import|behavior\s*:|-moz-binding|position\s*:\s*(?:fixed|absolute|sticky)|z-index\s*:)/i;

function isUnsafeUri(value = "") {
  const normalized = String(value).trim().replace(/[\u0000-\u001f\u007f\s]+/g, "").toLowerCase();
  return normalized.startsWith("javascript:")
    || normalized.startsWith("vbscript:")
    || normalized.startsWith("data:text/html")
    || normalized.startsWith("data:application");
}

export function sanitizeHtml(html = "") {
  if (typeof window === "undefined" || !html) return "";
  const doc = new DOMParser().parseFromString(String(html), "text/html");

  doc.querySelectorAll([...blockedTags].join(",")).forEach((node) => node.remove());

  doc.body.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith("on") || blockedAttrs.has(name) || name === "srcset") node.removeAttribute(attr.name);
      if (uriAttrs.has(name) && isUnsafeUri(value)) {
        node.removeAttribute(attr.name);
      }
      if (name === "style" && unsafeCss.test(value)) node.removeAttribute(attr.name);
    });
    if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });

  return doc.body.innerHTML;
}
