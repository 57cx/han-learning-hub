import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml, makeHref, tagHref, tagSlug } from "./lib/html.mjs";
import { formatDateTimeZh, formatDateZh, shanghaiDateKey } from "./lib/time.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STATUS_LABEL = {
  live: "已上线",
  building: "建设中",
  upcoming: "即将加入",
  worker: "worker",
};

function publishedTime(article) {
  if (!article.publishedAt) return 0;
  const raw = article.publishedAt.length === 10 ? `${article.publishedAt}T12:00:00+08:00` : article.publishedAt;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
}

function isTodayArticle(article, today) {
  if (article.updatedAt && shanghaiDateKey(article.updatedAt) === today) return true;
  return article.publishedAt === today;
}

function articleTime(article) {
  const bits = [];
  if (article.publishedAt) bits.push(formatDateZh(article.publishedAt));
  if (article.updatedAt) {
    const updated = formatDateTimeZh(article.updatedAt);
    if (updated && shanghaiDateKey(article.updatedAt) !== article.publishedAt) bits.push(`仓库 ${updated}`);
  }
  return bits.join(" · ");
}

function siteById(data) {
  return new Map(data.sites.map((site) => [site.id, site]));
}

function tagList(articles) {
  const map = new Map();
  for (const article of articles) {
    for (const tag of article.tags || []) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag).push(article);
    }
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh"));
}

function page({ data, base, title, description, current, body }) {
  const href = (pathName) => makeHref(base, pathName);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="icon" href="${escapeHtml(href("/favicon.svg"))}" type="image/svg+xml">
  <link rel="stylesheet" href="${escapeHtml(href("/assets/site.css"))}">
  <script>
    (function () {
      try {
        var saved = localStorage.getItem("theme");
        var theme = saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
        document.documentElement.setAttribute("data-theme", theme);
      } catch (e) {}
    })();
  </script>
</head>
<body>
  <a class="skip" href="#content">跳到正文</a>
  <header class="mast">
    <a class="mark" href="${escapeHtml(href("/"))}">
      <span>每日汇集</span>
      <strong>${escapeHtml(data.title)}</strong>
    </a>
    <nav class="nav" aria-label="主导航">
      <a href="${escapeHtml(href("/"))}" ${current === "home" ? 'aria-current="page"' : ""}>首页</a>
      <a href="${escapeHtml(href("/activity/"))}" ${current === "activity" ? 'aria-current="page"' : ""}>每日动态</a>
      <a href="${escapeHtml(href("/browse/"))}" ${current === "browse" ? 'aria-current="page"' : ""}>检索</a>
    </nav>
    <button class="theme" type="button" data-theme-toggle aria-pressed="false">深色</button>
  </header>
  <main id="content">
    ${body}
  </main>
  <footer class="colophon">
    <p>数据更新于 ${escapeHtml(formatDateTimeZh(data.generatedAt))}（北京时间）。各老师的仓库若在此之后才有提交，会在下一次刷新汇入。</p>
    <p>每日动态只记录公开提交。没有提交写「无更新」；仓库还没建写「仓库尚未创建」；接口读失败写「暂时无法读取」，不会当成没有更新。</p>
    <p>刷新安排在每天 08:30（北京时间），推送到 main 或手动运行工作流时也会更新。</p>
  </footer>
  <script src="${escapeHtml(href("/assets/site.js"))}" defer></script>
</body>
</html>`;
}

function asset(base, cover) {
  if (!cover) return "";
  if (/^https?:\/\//.test(cover)) return cover;
  return makeHref(base, `/${String(cover).replace(/^\//, "")}`);
}

function media(article, site, title, base) {
  if (article?.image) {
    return `<div class="media"><img src="${escapeHtml(article.image)}" alt="${escapeHtml(title)}"></div>`;
  }
  const cover = asset(base, site?.cover);
  if (cover) return `<div class="media media-mark"><img src="${escapeHtml(cover)}" alt=""></div>`;
  return `<div class="media media-empty" aria-hidden="true"></div>`;
}

function articleCard(article, site, base) {
  const tags = (article.tags || []).join("|");
  const hay = [article.title, article.summary, site?.name, site?.bot, site?.topic, ...(article.tags || [])]
    .join(" ")
    .toLocaleLowerCase();
  return `<a class="piece" data-article="${escapeHtml(article.id)}" data-site="${escapeHtml(article.siteId)}" data-tags="${escapeHtml(tags)}" data-search="${escapeHtml(hay)}" href="${escapeHtml(article.url)}">
    ${media(article, site, article.title, base)}
    <div class="piece-body">
      <p class="kicker">${escapeHtml(site?.topic || "")} · ${escapeHtml(site?.bot || "")}</p>
      <h3>${escapeHtml(article.title)} <span aria-hidden="true">↗</span></h3>
      ${article.summary ? `<p>${escapeHtml(article.summary)}</p>` : ""}
      <p class="when">${escapeHtml(articleTime(article))}</p>
    </div>
  </a>`;
}

function siteCard(site, base, articles, feature) {
  const latest = articles.find((article) => article.image) || articles[0];
  const badge = STATUS_LABEL[site.status] || site.status;
  const when = site.lastCommitAt ? `最近提交 ${formatDateTimeZh(site.lastCommitAt)}` : "尚无提交";
  let note = "";
  if (site.status === "building" && site.articleCount > 0 && !site.pagesLive) note = `${site.articleCount} 篇已在仓库，Pages 尚未发布`;
  else if (site.status === "building" && site.pagesLive) note = "站点已发布，尚无文章";
  else if (site.status === "building") note = site.error || "仓库已在，页面与文章都还没有";
  else if (site.status === "live") note = `${site.articleCount} 篇`;
  const visual = latest?.image || asset(base, site.cover);
  const cover = visual ? `<img src="${escapeHtml(visual)}" alt="">` : "";
  if (site.status === "upcoming") {
    return `<article class="card upcoming">
      <div class="media">${cover}</div>
      <div class="card-body">
        <p class="kicker"><span class="badge">${badge}</span> ${escapeHtml(site.topic)}</p>
        <h3>${escapeHtml(site.name)}</h3>
        <p>${escapeHtml(site.intro)}</p>
        <p class="by">${escapeHtml(site.bot)}</p>
      </div>
    </article>`;
  }
  const destination = site.status === "live" ? (site.pagesUrl || site.url) : site.repoUrl;
  const action = site.status === "live" ? "进入站点" : "查看仓库";
  return `<article class="card ${feature ? "feature" : ""}">
    <a class="card-link" href="${escapeHtml(destination)}">
      <div class="media">${cover}</div>
      <div class="card-body">
        <p class="kicker"><span class="badge badge-${escapeHtml(site.status)}">${badge}</span> ${escapeHtml(site.topic)}</p>
        <h3>${escapeHtml(site.name)} <span aria-hidden="true">↗</span></h3>
        <p>${escapeHtml(site.intro)}</p>
        <p class="by">${escapeHtml(site.bot)}</p>
        <p class="when">${escapeHtml([when, note].filter(Boolean).join(" · "))}${site.warning ? ` · ${escapeHtml(site.warning)}` : ""}${site.error ? ` · ${escapeHtml(site.error)}` : ""}</p>
        <p class="action">${action}</p>
      </div>
    </a>
  </article>`;
}

function dayBlock(day) {
  const quiet = day.bots.every((bot) => bot.state === "empty" || bot.state === "not-created");
  const bots = day.bots.map((bot) => {
    if (bot.state !== "updated") {
      return `<section class="bot is-${escapeHtml(bot.state)}">
        <h3>${escapeHtml(bot.bot)}</h3>
        <p>${escapeHtml(bot.message)}</p>
      </section>`;
    }
    const articleItems = bot.articlesAdded.map((article) => `<li><a href="${escapeHtml(article.url)}">${escapeHtml(article.title)} ↗</a></li>`).join("");
    const articles = bot.articlesAdded.length
      ? bot.articlesAdded.length > 8
        ? `<details><summary>新增文章 ${bot.articlesAdded.length}</summary><ul>${articleItems}</ul></details>`
        : `<div><p class="mini">新增文章 ${bot.articlesAdded.length}</p><ul>${articleItems}</ul></div>`
      : "";
    const changes = `<div><p class="mini">${bot.commitCount} 次提交</p><ul>${bot.changes.map((change) => `<li><a href="${escapeHtml(change.url)}">${escapeHtml(change.message || change.sha)} ↗</a><span>${escapeHtml(change.author)}</span></li>`).join("")}</ul>${bot.filesTruncated ? `<p class="warn">这次提交的文件超过接口上限，新增文章可能没有列全。</p>` : ""}</div>`;
    return `<section class="bot is-updated">
      <h3>${escapeHtml(bot.bot)}</h3>
      ${changes}
      ${articles}
    </section>`;
  }).join("");
  return `<article class="day" data-day ${quiet ? 'data-quiet="true"' : ""}>
    <header>
      <time datetime="${escapeHtml(day.date)}">${escapeHtml(formatDateZh(day.date))}</time>
      <span>${escapeHtml(day.weekday)}</span>
    </header>
    <div class="bots">${bots}</div>
  </article>`;
}

function homeBody(data, base) {
  const sites = siteById(data);
  const sorted = [...data.articles].sort((a, b) => publishedTime(b) - publishedTime(a) || (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  const todayArticles = data.articles.filter((article) => isTodayArticle(article, data.today));
  const recent = sorted.filter((article) => !todayArticles.includes(article)).slice(0, 8);
  const lead = sorted.find((article) => article.image);
  const live = data.sites.filter((site) => site.status === "live").length;
  const building = data.sites.filter((site) => site.status === "building").length;
  const todayCommits = data.activity.find((day) => day.date === data.today);
  const commitTotal = todayCommits ? todayCommits.bots.reduce((sum, bot) => sum + bot.commitCount, 0) : 0;
  const leadSite = lead ? sites.get(lead.siteId) : null;
  const heroMedia = lead
    ? `<figure class="hero-photo"><img src="${escapeHtml(lead.image)}" alt="${escapeHtml(lead.title)}"><figcaption>${escapeHtml(leadSite?.name || "")} · ${escapeHtml(lead.title)}</figcaption></figure>`
    : `<figure class="hero-photo hero-fallback"><img src="${escapeHtml(makeHref(base, "/covers/weekly.svg"))}" alt=""><figcaption>课程图片会显示在这里</figcaption></figure>`;
  const todayBlock = todayArticles.length
    ? `<div class="stories">${todayArticles.map((article) => articleCard(article, sites.get(article.siteId), base)).join("")}</div>`
    : `<p class="quiet">今日各站点还没有新文章。</p>${recent.length ? `<h3 class="subhead">最近更新</h3><div class="stories">${recent.map((article) => articleCard(article, sites.get(article.siteId), base)).join("")}</div>` : `<p class="quiet">名册里的站点还没有可收录的文章。</p>`}`;
  return `<section class="hero">
      <div>
        <p class="eyebrow">${escapeHtml(formatDateZh(data.today))} · 北京时间</p>
        <h1>把分散的课，收成一本杂志。</h1>
        <p class="lede">审美、穿搭、摄影审美，各由一位老师在自己的仓库里写。这里只做入口：站点、今日的文章，以及每一天真实发生过的提交。</p>
        <div class="hero-actions">
          <a class="button" href="#today">看今日更新</a>
          <a class="button button-ghost" href="${escapeHtml(makeHref(base, "/activity/"))}">每日动态</a>
        </div>
      </div>
      ${heroMedia}
    </section>
    <dl class="facts">
      <div><dt>已上线</dt><dd>${live}</dd></div>
      <div><dt>建设中</dt><dd>${building}</dd></div>
      <div><dt>收录文章</dt><dd>${data.articles.length}</dd></div>
      <div><dt>今日提交</dt><dd>${commitTotal}</dd></div>
    </dl>
    <section class="block" id="sites">
      <div class="section-head">
        <p class="eyebrow">名册</p>
        <h2>站点</h2>
      </div>
      <div class="ledger">${data.sites.map((site) => {
        const own = data.articles.filter((article) => article.siteId === site.id).sort((a, b) => publishedTime(b) - publishedTime(a));
        const feature = site.status === "live" && !data.sites.slice(0, data.sites.indexOf(site)).some((item) => item.status === "live");
        return siteCard(site, base, own, feature);
      }).join("")}</div>
    </section>
    <section class="block" id="today">
      <div class="section-head">
        <p class="eyebrow">${escapeHtml(formatDateZh(data.today))}</p>
        <h2>今日更新</h2>
        <a href="${escapeHtml(makeHref(base, "/browse/"))}">全部文章</a>
      </div>
      ${todayBlock}
    </section>`;
}

function browseBody(data, base, { tag = "", heading = "检索", intro = "在全部已收录的文章里查找。标签页不依赖脚本；搜索框会在当前列表里过滤。" } = {}) {
  const sites = siteById(data);
  const source = tag ? data.articles.filter((article) => (article.tags || []).includes(tag)) : data.articles;
  const sorted = [...source].sort((a, b) => publishedTime(b) - publishedTime(a));
  const tags = tagList(data.articles);
  const chips = tags.map(([name, list]) => {
    const href = tagHref(base, name);
    const current = name === tag ? ' aria-current="page"' : "";
    return `<a class="chip" href="${escapeHtml(href)}"${current}>${escapeHtml(name)} <span>${list.length}</span></a>`;
  }).join("");
  const cards = sorted.map((article) => articleCard(article, sites.get(article.siteId), base)).join("");
  return `<section class="block browse-head">
      <p class="eyebrow">${tag ? "标签" : "检索"}</p>
      <h1>${escapeHtml(heading)}</h1>
      <p class="lede">${escapeHtml(intro)}</p>
      <form class="search" role="search" action="${escapeHtml(makeHref(base, "/browse/"))}">
        <label for="q">搜索</label>
        <input id="q" name="q" type="search" placeholder="题目、摘要、老师或标签" data-search autocomplete="off">
      </form>
      <p class="mini chips-label">标签</p>
      <div class="chips" aria-label="标签">${chips}</div>
    </section>
    <p class="result-count" data-result-count>${sorted.length} 篇${tag ? ` · ${escapeHtml(tag)}` : ""}</p>
    <p class="quiet" data-search-empty hidden>没有匹配的文章。</p>
    <div class="stories">${cards || `<p class="quiet">这一栏还没有文章。</p>`}</div>`;
}

export async function buildSite({ data, outDir, base, publicDir, styleFile, scriptFile }) {
  const resolvedBase = base !== undefined ? base : (process.env.BASE_PATH !== undefined ? process.env.BASE_PATH : data.basePath || "");
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  if (publicDir) await cp(publicDir, outDir, { recursive: true });
  await mkdir(path.join(outDir, "assets"), { recursive: true });
  if (styleFile) await cp(styleFile, path.join(outDir, "assets", "site.css"));
  if (scriptFile) await cp(scriptFile, path.join(outDir, "assets", "site.js"));
  const description = "涵的学习馆：把审美、穿搭和摄影审美站点收在一处，并按北京时间记录每位老师的每日更新。";
  await writeFile(path.join(outDir, "index.html"), page({
    data, base: resolvedBase, current: "home", description,
    title: data.title,
    body: homeBody(data, resolvedBase),
  }));
  await mkdir(path.join(outDir, "activity"), { recursive: true });
  await writeFile(path.join(outDir, "activity", "index.html"), page({
    data, base: resolvedBase, current: "activity", description,
    title: `每日动态 · ${data.title}`,
    body: `<section class="block">
      <p class="eyebrow">北京时间 · 从仓库建立之日起</p>
      <h1>每日动态</h1>
      <p class="lede">每一天、每一位老师，以及负责这个学习馆的 worker。内容来自对应仓库的提交记录和真实文件，没有提交就是无更新。</p>
      <button class="button button-ghost" type="button" data-only-updates aria-pressed="false">只看有更新</button>
    </section>
    <div class="days">${data.activity.map(dayBlock).join("")}</div>`,
  }));
  await mkdir(path.join(outDir, "browse"), { recursive: true });
  await writeFile(path.join(outDir, "browse", "index.html"), page({
    data, base: resolvedBase, current: "browse", description,
    title: `检索 · ${data.title}`,
    body: browseBody(data, resolvedBase),
  }));
  for (const [tag, list] of tagList(data.articles)) {
    const dir = path.join(outDir, "tags", tagSlug(tag));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), page({
      data, base: resolvedBase, current: "browse", description,
      title: `${tag} · 检索 · ${data.title}`,
      body: browseBody(data, resolvedBase, {
        tag,
        heading: tag,
        intro: `${list.length} 篇文章带有这个标签。`,
      }),
    }));
  }
  await writeFile(path.join(outDir, "404.html"), page({
    data, base: resolvedBase, current: "", description,
    title: `找不到页面 · ${data.title}`,
    body: `<section class="block"><p class="eyebrow">404</p><h1>这页不在学习馆里。</h1><p class="lede"><a href="${escapeHtml(makeHref(resolvedBase, "/"))}">回到首页</a></p></section>`,
  }));
  await mkdir(path.join(outDir, "data"), { recursive: true });
  await writeFile(path.join(outDir, "data", "hub.json"), `${JSON.stringify(data)}\n`);
}

async function main() {
  const dataPath = path.join(root, "data", "hub.json");
  const data = JSON.parse(await readFile(dataPath, "utf8"));
  const base = process.env.BASE_PATH !== undefined ? process.env.BASE_PATH : data.basePath || "";
  await buildSite({
    data,
    outDir: path.join(root, "dist"),
    base,
    publicDir: path.join(root, "public"),
    styleFile: path.join(root, "src", "site.css"),
    scriptFile: path.join(root, "src", "site.js"),
  });
  console.log(`已生成 dist ，base ${base || "/"}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
