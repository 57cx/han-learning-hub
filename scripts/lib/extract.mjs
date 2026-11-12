import { dateKeyFrom } from "./time.mjs";

const MARKDOWN_ROOTS = ["posts/", "articles/", "content/", "lessons/", "src/content/"];

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
  if (/(^|\/)README\.md$/i.test(path)) return false;
  if (path.startsWith(".") || path.split("/").some((part) => part.startsWith("."))) return false;
  if (/^(node_modules|dist|tests|scripts|.github)\//.test(path)) return false;
  return MARKDOWN_ROOTS.some((root) => path.startsWith(root));
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

export function articlesFromMarkdown(site, files) {
  const articles = [];
  for (const file of files) {
    const { data, body } = parseFrontmatter(file.text);
    if (data.draft === true || data.draft === "true" || data.draft === "yes") continue;
    const title = plainText(data.title || heading(body) || titleFromPath(file.path), 120);
    if (!title) continue;
    const publishedAt = dateKeyFrom(data.date || data.pubDate) || dateFromPath(file.path);
    const summary = plainText(data.summary || data.description || data.excerpt || firstParagraph(body), 180);
    const tags = asList(data.tags).concat(asList(data.categories));
    const imagePath = data.image || data.cover || data.hero || "";
    articles.push({
      ...articleBase(site, tags),
      id: `${site.id}:${file.path}`,
      title,
      summary,
      url: resolveLink(site, data.url || data.permalink, githubBlobUrl(site.repo, site.branch, file.path)),
      image: imagePath ? resolveImage(site, imagePath, file.path) : "",
      publishedAt,
      sourcePath: file.path,
      source: "markdown",
    });
  }
  return articles;
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
  if (input.feedJson != null) {
    const items = parseFeedJson(input.feedJson);
    if (items) return articlesFromFeed(site, items);
  }
  if (input.feedXml != null) {
    const items = parseFeedXml(input.feedXml);
    if (items) return articlesFromFeed(site, items);
  }
  if (input.markdown?.length) {
    const articles = articlesFromMarkdown(site, input.markdown);
    if (articles.length) return articles;
  }
  const catalog = tryParseCatalog(input.catalogText);
  if (catalog) return articlesFromCatalog(site, catalog, input.curriculumText);
  return articlesFromDateFolders(site, input.paths || []);
}

const FEED_JSON = ["feed.json", "articles.json", "hub-feed.json", "data/feed.json", "data/articles.json"];
const FEED_XML = ["feed.xml", "rss.xml", "atom.xml", "index.xml"];

export function classifyTree(paths) {
  const set = new Set(paths);
  return {
    feedJson: FEED_JSON.find((path) => set.has(path)) || null,
    feedXml: FEED_XML.find((path) => set.has(path)) || null,
    catalog: set.has("catalog.js") ? "catalog.js" : null,
    curriculum: set.has("curriculum.md") ? "curriculum.md" : null,
    markdown: paths.filter(isMarkdownArticle),
  };
}
