import { execSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activityRange, buildActivity, stampArticles } from "./lib/activity.mjs";
import { chooseArticles, classifyTree, digestFilePath, paperCountFromManifest, parseSiteManifest } from "./lib/extract.mjs";
import { GitHub, githubToken, mapPool } from "./lib/github.mjs";
import { activityBots, isUpcoming, loadConfig } from "./lib/registry.mjs";
import { shanghaiDateKey, todayKey } from "./lib/time.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function token() {
  const env = githubToken();
  if (env) return env;
  try {
    return execSync("gh auth token", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function slimCommit(detail) {
  const commit = detail.commit || {};
  const files = detail.files || [];
  return {
    sha: detail.sha,
    date: commit.author?.date || commit.committer?.date,
    message: String(commit.message || "").split("\n")[0].trim(),
    url: detail.html_url,
    author: commit.author?.name || detail.author?.login || "",
    files: files.map((file) => ({ path: file.filename, status: file.status })),
    filesTruncated: files.length >= 300,
  };
}

async function readTextFile(github, repo, ref, filePath) {
  const apiPath = `/repos/${repo}/contents/${filePath.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`;
  try {
    const data = await github.request(apiPath);
    if (data?.content) return Buffer.from(data.content, "base64").toString("utf8");
  } catch (error) {
    if (!error.fatal) throw error;
  }
  const raw = `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref)}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(raw, { headers: { "User-Agent": "han-learning-hub", Accept: "text/plain" } });
  if (!response.ok) {
    const error = new Error(`无法读取 ${repo}/${filePath}`);
    error.fatal = true;
    throw error;
  }
  return response.text();
}

async function loadRepo(github, bot) {
  const repo = await github.request(`/repos/${bot.repo}`);
  if (!repo) {
    return {
      ...bot,
      missing: true,
      fetchError: true,
      errorMessage: "仓库不存在",
      createdAt: null,
      commits: [],
      articles: [],
      pagesLive: false,
    };
  }
  const branch = repo.default_branch || "main";
  const pages = await github.request(`/repos/${bot.repo}/pages`);
  let pagesUrl = pages?.html_url || "";
  let pagesLive = Boolean(pagesUrl);
  if (!pagesLive && bot.url && await urlIsLive(bot.url)) {
    pagesLive = true;
    pagesUrl = bot.url;
  }
  const tree = await github.request(`/repos/${bot.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const truncated = Boolean(tree?.truncated);
  const paths = (tree?.tree || []).filter((item) => item.type === "blob").map((item) => item.path);
  const classes = classifyTree(paths);
  const texts = {};
  const wanted = [classes.feedJson, classes.feedXml, classes.catalog, classes.curriculum].filter(Boolean);
  for (const filePath of wanted) {
    texts[filePath] = await readTextFile(github, bot.repo, branch, filePath);
  }
  const markdown = [];
  for (const filePath of classes.markdown.slice(0, 200)) {
    markdown.push({ path: filePath, text: await readTextFile(github, bot.repo, branch, filePath) });
  }
  const manifestText = paths.includes("site.json") ? await readTextFile(github, bot.repo, branch, "site.json") : "";
  const manifest = parseSiteManifest(manifestText);
  const daily = await loadDailyDigests(github, bot.repo, branch, paths, manifest);
  const summaries = await github.paginate(`/repos/${bot.repo}/commits?sha=${encodeURIComponent(branch)}`);
  const details = await mapPool(summaries, 6, (item) => github.request(`/repos/${bot.repo}/commits/${item.sha}`));
  const commits = details.filter(Boolean).map(slimCommit);
  const site = {
    ...bot,
    branch,
    pagesUrl,
    description: repo.description || "",
    createdAt: repo.created_at,
    pushedAt: repo.pushed_at,
    repoUrl: repo.html_url,
  };
  let articles = chooseArticles(site, {
    manifest,
    dailyIndex: daily.index,
    digests: daily.digests,
    feedJson: classes.feedJson ? texts[classes.feedJson] : null,
    feedXml: classes.feedXml ? texts[classes.feedXml] : null,
    markdown,
    catalogText: classes.catalog ? texts[classes.catalog] : "",
    curriculumText: classes.curriculum ? texts[classes.curriculum] : "",
    paths,
  });
  articles = stampArticles(articles, commits);
  return {
    ...site,
    missing: false,
    fetchError: false,
    truncated,
    pagesLive,
    paperCount: paperCountFromManifest(manifest),
    commits,
    articles,
    lastCommitAt: commits[0]?.date || repo.pushed_at || null,
  };
}

export function publicationStatus(record) {
  if (!record.pagesLive) return "building";
  if ((record.articles?.length || 0) > 0 || Number.isInteger(record.paperCount)) return "live";
  return "building";
}

function statusFor(record) {
  if (record.kind === "worker") return "worker";
  return publicationStatus(record);
}

async function urlIsLive(url) {
  try {
    const response = await fetch(url, { redirect: "follow", headers: { "User-Agent": "han-learning-hub" } });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

async function loadDailyDigests(github, repo, branch, paths, manifest) {
  const indexPath = manifest?.data?.daily_index;
  if (typeof indexPath !== "string") return { index: null, digests: {} };
  let index = { dates: [] };
  if (paths.includes(indexPath)) {
    const parsed = parseSiteManifest(await readTextFile(github, repo, branch, indexPath));
    if (parsed && Array.isArray(parsed.dates)) index = { dates: parsed.dates };
  }
  const digests = {};
  for (const date of index.dates) {
    const filePath = digestFilePath(manifest.data.daily_digest, date);
    if (!filePath || !paths.includes(filePath)) continue;
    const digest = parseSiteManifest(await readTextFile(github, repo, branch, filePath));
    if (digest) digests[date] = digest;
  }
  return { index, digests };
}

function publicSite(configSite, record) {
  if (!record) {
    return {
      id: configSite.id,
      name: configSite.name,
      topic: configSite.topic,
      bot: configSite.bot,
      repo: configSite.repo || "",
      repoUrl: "",
      url: "",
      pagesUrl: "",
      pagesLive: false,
      status: "upcoming",
      cover: configSite.cover || "",
      intro: configSite.intro || "",
      createdAt: null,
      pushedAt: null,
      lastCommitAt: null,
      commitCount: 0,
      articleCount: 0,
      warning: "",
      error: "",
    };
  }
  const status = record.missing ? "building" : statusFor(record);
  const pagesUrl = record.pagesUrl || "";
  return {
    id: configSite.id,
    name: configSite.name,
    topic: configSite.topic,
    bot: configSite.bot,
    repo: configSite.repo,
    repoUrl: record.repoUrl || `https://github.com/${configSite.repo}`,
    url: record.pagesLive ? pagesUrl : record.repoUrl || "",
    expectedUrl: configSite.url || "",
    pagesUrl,
    pagesLive: Boolean(record.pagesLive),
    status,
    cover: configSite.cover || "",
    intro: configSite.intro || "",
    createdAt: record.createdAt,
    pushedAt: record.pushedAt,
    lastCommitAt: record.lastCommitAt,
    commitCount: record.commits.length,
    articleCount: record.articles.length,
    paperCount: Number.isInteger(record.paperCount) ? record.paperCount : null,
    warning: record.truncated ? "文件树过大，文章可能不完整" : "",
    error: record.missing ? "仓库不存在" : "",
  };
}

export async function refreshHub({ config, github, now = new Date() }) {
  const bots = activityBots(config);
  const records = [];
  for (const bot of bots) {
    try {
      console.log(`读取 ${bot.repo}`);
      const record = await loadRepo(github, bot);
      records.push(record);
      console.log(`  提交 ${record.commits.length} · 文章 ${record.articles.length} · Pages ${record.pagesLive ? "已发布" : "未发布"}`);
    } catch (error) {
      if (!error.fatal) throw error;
      console.error(`  读取失败：${error.message}`);
      records.push({
        ...bot,
        fetchError: true,
        errorMessage: "暂时无法读取",
        missing: false,
        pagesLive: false,
        pagesUrl: "",
        commits: [],
        articles: [],
        createdAt: null,
        error: error.message,
      });
    }
  }
  const fatal = records.filter((record) => record.fetchError);
  if (fatal.length === records.length) {
    const error = new Error("所有仓库都读取失败，停止生成，避免把故障写成「无更新」。");
    error.fatal = true;
    throw error;
  }
  const byId = new Map(records.map((record) => [record.id, record]));
  const sites = config.sites.map((site) => {
    if (isUpcoming(site)) return publicSite(site, null);
    return publicSite(site, byId.get(site.id));
  });
  const articles = records
    .filter((record) => record.kind !== "worker")
    .flatMap((record) => record.articles || []);
  const activityBotsFull = bots.map((bot) => {
    const record = byId.get(bot.id);
    return {
      ...bot,
      createdAt: record?.createdAt || null,
      fetchError: Boolean(record?.fetchError || record?.missing),
      errorMessage: record?.errorMessage || (record?.fetchError ? "暂时无法读取" : ""),
      commitDates: (record?.commits || []).map((commit) => shanghaiDateKey(commit.date)).filter(Boolean),
    };
  });
  const range = activityRange(activityBotsFull, now);
  const activity = buildActivity({
    bots: activityBotsFull,
    commitsByBot: Object.fromEntries(records.map((record) => [record.id, record.commits || []])),
    articlesByBot: Object.fromEntries(records.map((record) => [record.id, record.articles || []])),
    from: range.from,
    to: range.to,
  });
  return {
    generatedAt: now.toISOString(),
    timezone: "Asia/Shanghai",
    today: todayKey(now),
    title: config.title || "涵的学习馆",
    siteUrl: config.siteUrl || "",
    basePath: config.basePath || "",
    sites,
    articles,
    activity,
    warnings: records.filter((record) => record.fetchError).map((record) => ({
      id: record.id,
      repo: record.repo,
      message: "暂时无法读取",
    })),
  };
}

async function main() {
  const config = loadConfig(await readFile(path.join(root, "sites.json"), "utf8"));
  const github = new GitHub(token());
  const hub = await refreshHub({ config, github });
  const dest = path.join(root, "data", "hub.json");
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, `${JSON.stringify(hub, null, 2)}\n`);
  const live = hub.sites.filter((site) => site.status === "live").length;
  const building = hub.sites.filter((site) => site.status === "building").length;
  console.log(`写入 ${dest}`);
  console.log(`站点 ${hub.sites.length} · 已上线 ${live} · 建设中 ${building} · 文章 ${hub.articles.length} · 日期 ${hub.activity.length}`);
  if (hub.warnings.length) {
    console.error("有仓库暂时无法读取。这些日子不会标成「无更新」，但本次数据不完整。");
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
