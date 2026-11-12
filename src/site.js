const root = document.documentElement;
const toggle = document.querySelector("[data-theme-toggle]");

function theme() {
  return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function applyTheme(next, persist) {
  root.setAttribute("data-theme", next);
  if (persist) {
    try { localStorage.setItem("theme", next); } catch { /* 私密模式只在这一页生效 */ }
  }
  if (!toggle) return;
  const dark = next === "dark";
  toggle.setAttribute("aria-pressed", String(dark));
  toggle.textContent = dark ? "浅色" : "深色";
  toggle.setAttribute("aria-label", dark ? "切换为浅色" : "切换为深色");
}

applyTheme(theme(), false);
toggle?.addEventListener("click", () => applyTheme(theme() === "dark" ? "light" : "dark", true));

const search = document.querySelector("[data-search]");
if (search) {
  const cards = [...document.querySelectorAll("[data-article]")];
  const empty = document.querySelector("[data-search-empty]");
  const count = document.querySelector("[data-result-count]");
  const countLabel = count ? count.textContent : "";
  const params = new URLSearchParams(location.search);
  if (params.get("q")) search.value = params.get("q");
  const filter = () => {
    const query = String(search.value || "").trim().toLocaleLowerCase();
    let shown = 0;
    for (const card of cards) {
      const hay = (card.getAttribute("data-search") || "").toLocaleLowerCase();
      const match = !query || hay.includes(query);
      card.hidden = !match;
      if (match) shown += 1;
    }
    if (empty) empty.hidden = shown !== 0;
    if (count) count.textContent = query ? `${shown} 篇` : countLabel;
  };
  search.addEventListener("input", filter);
  filter();
}

const onlyUpdates = document.querySelector("[data-only-updates]");
onlyUpdates?.addEventListener("click", () => {
  const on = onlyUpdates.getAttribute("aria-pressed") !== "true";
  onlyUpdates.setAttribute("aria-pressed", String(on));
  onlyUpdates.textContent = on ? "显示全部日期" : "只看有更新";
  document.querySelectorAll("[data-day]").forEach((day) => {
    if (day.getAttribute("data-quiet") === "true") day.hidden = on;
  });
});
