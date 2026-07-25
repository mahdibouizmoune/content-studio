const blockedTags = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "base"]);
const uriAttrs = new Set(["href", "src", "xlink:href"]);

export function sanitizeHtml(html = "") {
  if (typeof window === "undefined" || !html) return "";
  const doc = new DOMParser().parseFromString(String(html), "text/html");

  doc.querySelectorAll([...blockedTags].join(",")).forEach((node) => node.remove());

  doc.body.querySelectorAll("*").forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      if (name.startsWith("on")) node.removeAttribute(attr.name);
      if (uriAttrs.has(name) && (value.startsWith("javascript:") || value.startsWith("data:text/html"))) {
        node.removeAttribute(attr.name);
      }
    });
  });

  return doc.body.innerHTML;
}
