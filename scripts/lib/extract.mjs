import { dateKeyFrom } from "./time.mjs";

const SKIP_DIRS = new Set([
  "node_modules", "vendor", "dist", "_site", ".github", "scripts", "tests",
  "_includes", "_layouts", "assets", ".jekyll-cache",
]);
const SKIP_MARKDOWN = /^(readme|writing_guide|contributing|license|changelog|code_of_conduct)\.mdx?$/i;
const CHROME_LAYOUTS = new Set(["category", "page", "default", "base", "taxonomy"]);
const CONTENT_DIRS = /(?:^|\/)(_posts|posts|articles|notes|days|lessons)(?:\/|$)/;

function skippedPath(filePath) {
  return String(filePath).split("/").some((part) => part.startsWith(".") || SKIP_DIRS.has(part));
}

function layoutName(value) {
  return String(value || "").replace(/\.njk$/i, "").toLowerCase();
}

export function plainText(value, max = 180) {
  const text = String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function unique(list) {
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const text = String(item || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

export function rawUrl(repo, branch, filePath) {
  const path = String(filePath || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch || "main")}/${path}`;
}

export function githubBlobUrl(repo, branch, filePath) {
  const path = String(filePath || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://github.com/${repo}/blob/${encodeURIComponent(branch || "main")}/${path}`;
}

export function githubTreeUrl(repo, branch, filePath) {
  const path = String(filePath || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://github.com/${repo}/tree/${encodeURIComponent(branch || "main")}/${path}`;
}

export function isMarkdownArticle(path) {
  if (!/\.mdx?$/i.test(path)) return false;
  if (skippedPath(path)) return false;
  return !SKIP_MARKDOWN.test(path.split("/").pop());
}

export function isHtmlPage(path) {
  if (!/\.html?$/i.test(path)) return false;
  if (skippedPath(path)) return false;
  const base = path.split("/").pop().toLowerCase();
  return base !== "404.html" && base !== "index.html";
}

export function isJsonIndex(path) {
  if (!/\.json$/i.test(path)) return false;
  if (skippedPath(path)) return false;
  const base = path.split("/").pop().toLowerCase();
  if (base === "package.json" || base === "package-lock.json" || base === "site.json") return false;
  if (base.endsWith(".schema.json") || base === "tsconfig.json") return false;
  return true;
}

export function parseFrontmatter(raw) {
  const matched = String(raw || "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!matched) return { data: {}, body: String(raw || "") };
  const data = {};
  const lines = matched[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let value = kv[2].trim();
    if (value === "" || value === ">" || value === "|") {
      const list = [];
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        i += 1;
        list.push(unquote(lines[i].replace(/^\s+-\s+/, "").trim()));
      }
      if (list.length) data[key] = list;
      continue;
    }
    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((part) => unquote(part.trim()))
        .filter(Boolean);
    } else if ((key === "tags" || key === "categories") && value.includes(",")) {
      data[key] = value.split(",").map((part) => unquote(part.trim())).filter(Boolean);
    } else {
      data[key] = unquote(value);
    }
  }
  return { data, body: matched[2] };
}

function unquote(value) {
  return String(value).replace(/^["']|["']$/g, "");
}

export function parseFeedJson(text) {
  try {
    const data = JSON.parse(String(text).replace(/^\uFEFF/, ""));
    const items = Array.isArray(data) ? data : data.articles || data.items;
    return Array.isArray(items) ? items : null;
  } catch {
    return null;
  }
}

function xmlTag(block, name) {
  const matched = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  if (!matched) return "";
  return plainText(matched[1], 500);
}

export function parseFeedXml(xml) {
  const source = String(xml || "");
  if (!/<(item|entry)\b/i.test(source)) return null;
  const blocks = source.match(/<item\b[\s\S]*?<\/item>|<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((block) => {
    const atom = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
    const enclosure = block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
    const media = block.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i);
    const categories = [...block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((item) => plainText(item[1], 40));
    const term = [...block.matchAll(/<category[^>]*term=["']([^"']+)["'][^>]*\/?>/gi)].map((item) => item[1]);
    return {
      title: xmlTag(block, "title"),
      url: atom?.[1] || xmlTag(block, "link"),
      summary: xmlTag(block, "description") || xmlTag(block, "summary"),
      date: xmlTag(block, "pubDate") || xmlTag(block, "updated") || xmlTag(block, "published"),
      image: enclosure?.[1] || media?.[1] || "",
      tags: unique([...categories, ...term]),
    };
  }).filter((item) => item.title);
}

export function parseCurriculum(markdown) {
  const map = new Map();
  if (!markdown) return map;
  let stage = "";
  for (const line of String(markdown).split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      const bits = line.replace(/^##\s+/, "").split("·").map((part) => part.trim()).filter(Boolean);
      stage = bits.at(-1) || "";
    }
    const matched = line.match(/\*\*第\s*\d+\s*周\s*(\d{4}-\d{2}-\d{2})｜([^*]+)\*\*\s*——\s*(.+)$/);
    if (!matched) continue;
    map.set(matched[1], {
      theme: matched[2].trim(),
      blurb: plainText(matched[3], 180),
      stage,
    });
  }
  return map;
}

export function parseSiteManifest(text) {
  if (!text) return null;
  try {
    const data = JSON.parse(String(text).replace(/^\uFEFF/, ""));
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data;
  } catch {
    return null;
  }
}

export function paperCountFromManifest(manifest) {
  const count = manifest?.counts?.papers;
  return Number.isInteger(count) && count >= 0 ? count : null;
}

export function digestFilePath(pattern, date) {
  if (typeof pattern !== "string" || !pattern.includes("YYYY-MM-DD")) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return pattern.replaceAll("YYYY-MM-DD", date);
}

function dailyPageUrl(site, manifest, date) {
  const section = (manifest.sections || []).find((item) => item && item.id === "daily" && item.path);
  const root = site.pagesUrl || manifest.url || "";
  if (!section || !root) return root;
  const url = new URL(String(section.path).replace(/^\//, ""), root.endsWith("/") ? root : `${root}/`);
  url.searchParams.set("date", date);
  return url.toString();
}

export function manifestDigestArticles(site, manifest, index, digests = {}) {
  if (!manifest?.data || typeof manifest.data.daily_index !== "string") return null;
  if (!index || !Array.isArray(index.dates)) return null;
  const articles = [];
  for (const date of index.dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const digest = digests[date];
    if (!digest || !Array.isArray(digest.items)) continue;
    const sourcePath = digestFilePath(manifest.data.daily_digest, date);
    const url = dailyPageUrl(site, manifest, date);
    digest.items.forEach((item, itemIndex) => {
      const title = plainText(item?.title, 180);
      if (!title) return;
      articles.push({
        ...articleBase(site, [...asList(item.tags), ...asList(item.categories)]),
        id: `${site.id}:${date}:${itemIndex}:${title}`,
        title,
        summary: plainText(item.summary_zh || "", 180),
        url,
        image: "",
        publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(digest.date) ? digest.date : date,
        sourcePath,
        source: "manifest-digest",
      });
    });
  }
  return articles;
}

export function tryParseCatalog(text) {
  if (!text || !text.includes("{")) return null;
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const json = JSON.parse(text.slice(start, end + 1));
    if (!json || !Array.isArray(json.weeks)) return null;
    return json;
  } catch {
    return null;
  }
}

function pagesRoot(site) {
  return site.pagesUrl ? site.pagesUrl.replace(/\/?$/, "/") : "";
}

export function resolveLink(site, value, fallback) {
  if (!value) return fallback || "";
  if (/^https?:\/\//i.test(value)) return value;
  const root = pagesRoot(site);
  if (!root) return fallback || "";
  if (value.startsWith("#")) return `${root}${value}`;
  if (value.startsWith("/")) {
    const url = new URL(root);
    return `${url.origin}${url.pathname.replace(/\/$/, "")}${value}`;
  }
  return `${root}${String(value).replace(/^\.\//, "")}`;
}

export function resolveImage(site, value, filePath = "") {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/") && site.pagesUrl) {
    const url = new URL(site.pagesUrl);
    return `${url.origin}${url.pathname.replace(/\/$/, "")}${value}`;
  }
  const cleaned = String(value).replace(/^\.\//, "");
  const dir = filePath ? filePath.split("/").slice(0, -1).join("/") : "";
  const relative = cleaned.startsWith("/") || !dir ? cleaned.replace(/^\//, "") : `${dir}/${cleaned}`;
  return rawUrl(site.repo, site.branch, relative);
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function articleBase(site, extra) {
  return {
    siteId: site.id,
    tags: unique([...(site.tags || []), site.topic, ...(extra || [])]),
  };
}

export function articlesFromFeed(site, items) {
  return items.map((item, index) => {
    const title = plainText(item.title, 120);
    if (!title) return null;
    const sourcePath = item.path || item.sourcePath || "";
    const publishedAt = dateKeyFrom(item.date || item.published || item.publishedAt) || null;
    const fallback = sourcePath
      ? githubBlobUrl(site.repo, site.branch, sourcePath)
      : site.pagesUrl || (site.repo ? `https://github.com/${site.repo}` : "");
    return {
      ...articleBase(site, asList(item.tags).concat(asList(item.categories))),
      id: item.id || `${site.id}:feed:${index}:${title}`,
      title,
      summary: plainText(item.summary || item.description || item.excerpt || "", 180),
      url: resolveLink(site, item.url || item.link, fallback),
      image: resolveImage(site, item.image || item.cover || "", sourcePath),
      publishedAt,
      sourcePath,
      source: "feed",
    };
  }).filter(Boolean);
}

function contentPermalink(filePath) {
  const base = filePath.split("/").pop().replace(/\.mdx?$/i, "");
  if (CONTENT_DIRS.test(filePath) && /(?:^|\/)articles(?:\/|$)/.test(filePath)) {
    return `/articles/${base.replace(/^\d{4}-\d{2}-\d{2}-/, "")}/`;
  }
  const post = base.match(/^(\d{4})-(\d{2})-(\d{2})-(.+)$/);
  if (post && /(?:^|\/)_posts(?:\/|$)/.test(filePath)) {
    return `/${post[1]}/${post[2]}/${post[3]}/${post[4]}/`;
  }
  return "";
}

function firstMedia(body) {
  const markdown = String(body).match(/!\[[^\]]*\]\(([^)\s]+)\)/);
  if (markdown) return markdown[1];
  const image = String(body).match(/<img[^>]+src=["']([^"']+)["']/i);
  return image ? image[1] : "";
}

function articlePageUrl(site, filePath, explicit) {
  const permalink = explicit || contentPermalink(filePath);
  const fallback = githubBlobUrl(site.repo, site.branch, filePath);
  return resolveLink(site, permalink, fallback);
}

function articleImage(site, image, pageUrl, filePath) {
  if (!image) return "";
  if (/^https?:\/\//i.test(image)) return image;
  if (image.startsWith("/") && site.pagesUrl) return resolveImage(site, image, filePath);
  if (site.pagesUrl && pageUrl && !image.startsWith("/")) {
    const base = pageUrl.endsWith("/") ? pageUrl : pageUrl.replace(/[^/]*$/, "");
    try {
      return new URL(image.replace(/^\.\//, ""), base).toString();
    } catch {
      return "";
    }
  }
  return "";
}

function frontmatterTags(data) {
  return asList(data.tags)
    .concat(asList(data.categories), asList(data.category), asList(data.topic), asList(data.section), asList(data.seasons), asList(data.styles));
}

function keepMarkdown(file, data) {
  if (data.draft === true || data.draft === "true" || data.draft === "yes") return false;
  const layout = layoutName(data.layout);
  if (CHROME_LAYOUTS.has(layout)) return false;
  if (CONTENT_DIRS.test(file.path) || layout === "article") return true;
  return Boolean(data.date || data.pubDate || data.day || dateFromPath(file.path));
}

export function articlesFromMarkdown(site, files) {
  const articles = [];
  for (const file of files) {
    const { data, body } = parseFrontmatter(file.text);
    if (!keepMarkdown(file, data)) continue;
    const title = plainText(data.title || heading(body) || titleFromPath(file.path), 120);
    if (!title) continue;
    const publishedAt = dateKeyFrom(data.date || data.pubDate) || dateFromPath(file.path);
    const summary = plainText(data.summary || data.description || data.excerpt || firstParagraph(body), 180);
    const url = articlePageUrl(site, file.path, data.url || data.permalink);
    const imagePath = data.image || data.cover || data.hero || firstMedia(body);
    articles.push({
      ...articleBase(site, frontmatterTags(data)),
      id: `${site.id}:${file.path}`,
      title,
      summary,
      url,
      image: articleImage(site, imagePath, url, file.path),
      publishedAt,
      sourcePath: file.path,
      source: "markdown",
    });
  }
  return articles;
}

function tagText(source, tag) {
  const matched = String(source).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return matched ? plainText(matched[1], 180) : "";
}

export function articlesFromHtml(site, files) {
  const articles = [];
  for (const file of files) {
    const { data, body } = parseFrontmatter(file.text);
    if (CHROME_LAYOUTS.has(layoutName(data.layout))) continue;
    const title = plainText(data.title || tagText(body, "h1") || tagText(file.text, "title"), 120);
    if (!title || title === "首页") continue;
    const url = articlePageUrl(site, file.path, data.url || data.permalink || `/${file.path}`);
    articles.push({
      ...articleBase(site, frontmatterTags(data)),
      id: `${site.id}:${file.path}`,
      title,
      summary: plainText(data.summary || data.description || tagText(file.text, "p"), 180),
      url,
      image: articleImage(site, data.image || data.cover || firstMedia(body || file.text), url, file.path),
      publishedAt: dateKeyFrom(data.date || data.pubDate) || dateFromPath(file.path),
      sourcePath: file.path,
      source: "html",
    });
  }
  return articles;
}

export function articlesFromJsonDocument(site, file) {
  let data;
  try {
    data = JSON.parse(String(file.text).replace(/^\uFEFF/, ""));
  } catch {
    return [];
  }
  if (!data || data.status === "uninterpreted_candidates") return [];
  const items = Array.isArray(data) ? data : ["articles", "posts", "entries", "lessons"].map((key) => data[key]).find(Array.isArray);
  if (!Array.isArray(items) || !items.some((item) => item && item.title)) return [];
  return articlesFromFeed(site, items);
}

function heading(body) {
  const matched = String(body).match(/^#\s+(.+)$/m);
  return matched ? matched[1] : "";
}

function firstParagraph(body) {
  const paragraph = String(body)
    .replace(/^---[\s\S]*?---/, "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .find((part) => part && !part.startsWith("#"));
  return paragraph || "";
}

function titleFromPath(path) {
  return path
    .split("/")
    .pop()
    .replace(/\.mdx?$/i, "")
    .replace(/^\d{4}-\d{2}-\d{2}-/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function dateFromPath(path) {
  const matched = path.match(/(20\d{2}-\d{2}-\d{2})/);
  return matched ? matched[1] : null;
}

export function articlesFromCatalog(site, catalog, curriculumText) {
  const themes = parseCurriculum(curriculumText);
  const articles = [];
  for (const week of catalog.weeks) {
    const theme = themes.get(week.date);
    const topics = Array.isArray(week.topics) ? week.topics : [];
    for (const topic of topics) {
      const title = plainText(topic.title, 120);
      if (!title) continue;
      const photo = Array.isArray(topic.photos) ? topic.photos[0] : "";
      const sourcePath = photo ? photo.split("/").slice(0, -1).join("/") : `${week.date}/${title}`;
      const pagesRoot = site.pagesUrl ? site.pagesUrl.replace(/\/?$/, "/") : "";
      const url = pagesRoot
        ? `${pagesRoot}#week=${week.date}`
        : githubTreeUrl(site.repo, site.branch, sourcePath);
      const photoCount = Array.isArray(topic.photos) ? topic.photos.length : 0;
      const summary = theme?.blurb
        || (photoCount ? `${week.date} 的题材，含 ${photoCount} 张范例。` : `${week.date} 的题材。`);
      articles.push({
        ...articleBase(site, [theme?.stage, theme?.theme]),
        id: `${site.id}:${week.date}:${title}`,
        title,
        summary,
        url,
        image: photo ? rawUrl(site.repo, site.branch, photo) : "",
        publishedAt: week.date,
        sourcePath,
        source: "catalog",
      });
    }
  }
  return articles;
}

export function articlesFromDateFolders(site, paths) {
  const groups = new Map();
  for (const path of paths) {
    const matched = path.match(/^(\d{4}-\d{2}-\d{2})\/([^/]+)\/([^/]+)$/);
    if (!matched) continue;
    const [, date, folder, file] = matched;
    if (folder.startsWith(".")) continue;
    const key = `${date}/${folder}`;
    if (!groups.has(key)) groups.set(key, { date, folder, files: [] });
    groups.get(key).files.push(file);
  }
  const articles = [];
  for (const [key, group] of groups) {
    const images = group.files.filter((file) => /\.(jpe?g|png|webp|gif|avif)$/i.test(file)).sort();
    const docs = group.files.filter((file) => /\.(md|pdf)$/i.test(file));
    if (!images.length && !docs.length) continue;
    const pagesRoot = site.pagesUrl ? site.pagesUrl.replace(/\/?$/, "/") : "";
    articles.push({
      ...articleBase(site),
      id: `${site.id}:${key}`,
      title: group.folder,
      summary: `${group.date} 的题材文件夹，含 ${images.length} 张图片${docs.length ? `、${docs.length} 份文档` : ""}。`,
      url: pagesRoot ? `${pagesRoot}#week=${group.date}` : githubTreeUrl(site.repo, site.branch, key),
      image: images[0] ? rawUrl(site.repo, site.branch, `${key}/${images[0]}`) : "",
      publishedAt: group.date,
      sourcePath: key,
      source: "folder",
    });
  }
  return articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.title.localeCompare(b.title, "zh"));
}

export function chooseArticles(site, input) {
  if (input.dailyIndex) {
    const fromManifest = manifestDigestArticles(site, input.manifest, input.dailyIndex, input.digests || {});
    if (fromManifest) return fromManifest;
  }
  if (input.feedJson != null) {
    const items = parseFeedJson(input.feedJson);
    if (items) return articlesFromFeed(site, items);
  }
  if (input.feedXml != null) {
    const items = parseFeedXml(input.feedXml);
    if (items) return articlesFromFeed(site, items);
  }
  const catalog = tryParseCatalog(input.catalogText);
  if (catalog) return articlesFromCatalog(site, catalog, input.curriculumText);
  const collected = [
    ...(input.markdown?.length ? articlesFromMarkdown(site, input.markdown) : []),
    ...(input.html?.length ? articlesFromHtml(site, input.html) : []),
    ...(input.jsonDocs?.length ? input.jsonDocs.flatMap((file) => articlesFromJsonDocument(site, file)) : []),
  ];
  if (collected.length) return dedupeArticles(collected);
  return articlesFromDateFolders(site, input.paths || []);
}

const FEED_JSON = ["feed.json", "articles.json", "hub-feed.json", "data/feed.json", "data/articles.json"];
const FEED_XML = ["feed.xml", "rss.xml", "atom.xml", "index.xml"];

function smallEnough(path, sizes) {
  const size = sizes?.[path];
  return size == null || size < 400_000;
}

export function dedupeArticles(articles) {
  const seen = new Set();
  const out = [];
  for (const article of articles) {
    const key = article.url || article.sourcePath || article.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(article);
  }
  return out;
}

export function classifyTree(paths, sizes = {}) {
  const set = new Set(paths);
  const keep = (path) => smallEnough(path, sizes);
  return {
    feedJson: FEED_JSON.find((path) => set.has(path)) || null,
    feedXml: FEED_XML.find((path) => set.has(path)) || null,
    catalog: set.has("catalog.js") ? "catalog.js" : null,
    curriculum: set.has("curriculum.md") ? "curriculum.md" : null,
    markdown: paths.filter((path) => keep(path) && isMarkdownArticle(path)),
    html: paths.filter((path) => keep(path) && isHtmlPage(path)),
    jsonIndexes: paths.filter((path) => keep(path) && isJsonIndex(path)),
  };
}
