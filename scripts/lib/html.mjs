export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function makeHref(base, path) {
  const prefix = String(base || "").replace(/\/$/, "");
  if (!path || path === "/") return prefix ? `${prefix}/` : "/";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${prefix}${normalized}`;
}

export function tagSlug(tag) {
  return String(tag).replace(/[\\/]/g, "·").replace(/\.\./g, "·");
}

export function tagHref(base, tag) {
  return makeHref(base, `/tags/${encodeURIComponent(tagSlug(tag))}/`);
}
