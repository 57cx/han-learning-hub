import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildActivity } from "../scripts/lib/activity.mjs";
import { chooseArticles, parseCurriculum } from "../scripts/lib/extract.mjs";
import { escapeHtml, makeHref, tagHref } from "../scripts/lib/html.mjs";
import { loadConfig } from "../scripts/lib/registry.mjs";
import { eachDate, shanghaiDateKey } from "../scripts/lib/time.mjs";
import { buildSite } from "../scripts/build.mjs";
import { refreshHub } from "../scripts/refresh.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("北京时间以午夜为界", () => {
  assert.equal(shanghaiDateKey("2026-11-12T15:59:00Z"), "2026-11-12");
  assert.equal(shanghaiDateKey("2026-11-12T16:30:00Z"), "2026-11-13");
  assert.deepEqual(eachDate("2026-11-11", "2026-11-13"), ["2026-11-11", "2026-11-12", "2026-11-13"]);
});

test("课程表里的主题会变成真实标签，而不是另写一句", () => {
  const map = parseCurriculum(`## 第一阶段 · 冬 · 学会看
- **第 1 周 2026-01-04｜光是第一主角** —— 不学参数先学看光。`);
  assert.equal(map.get("2026-01-04").theme, "光是第一主角");
  assert.equal(map.get("2026-01-04").stage, "学会看");
  const articles = chooseArticles({
    id: "weekly",
    topic: "摄影审美",
    tags: ["每周课程"],
    repo: "57cx/aesthetic-weekly",
    branch: "main",
    pagesUrl: "https://57cx.github.io/aesthetic-weekly/",
  }, {
    catalogText: `window.PHOTOGRAPHY_CATALOG=${JSON.stringify({
      weeks: [{ date: "2026-01-04", topics: [{ title: "窗光", photos: ["2026-01-04/窗光/01.jpg"] }] }],
    })};`,
    curriculumText: `## 第一阶段 · 冬 · 学会看
- **第 1 周 2026-01-04｜光是第一主角** —— 不学参数先学看光。`,
    paths: ["2026-01-04/窗光/01.jpg", "2026-02-01/别的/01.jpg"],
  });
  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, "窗光");
  assert.equal(articles[0].summary, "不学参数先学看光。");
  assert.ok(articles[0].tags.includes("光是第一主角"));
  assert.equal(articles[0].url, "https://57cx.github.io/aesthetic-weekly/#week=2026-01-04");
  assert.match(articles[0].image, /2026-01-04\/%E7%AA%97%E5%85%89\/01\.jpg/);
});

test("空的 feed 不会再从文件夹里编出文章", () => {
  const articles = chooseArticles({ id: "s", topic: "审美", repo: "o/r", branch: "main", pagesUrl: "" }, {
    feedJson: JSON.stringify({ articles: [] }),
    paths: ["2026-01-04/窗光/01.jpg"],
  });
  assert.equal(articles.length, 0);
});

test("markdown 文稿、草稿和 RSS 都按原文收录", () => {
  const site = { id: "daily", topic: "审美", repo: "o/r", branch: "main", pagesUrl: "https://57cx.github.io/aesthetics-daily/" };
  const markdown = chooseArticles(site, {
    markdown: [
      { path: "posts/color.md", text: "---\ntitle: 色彩\ndate: 2026-11-12\ntags: 色彩, 光线\nsummary: 先看颜色。\nimage: cover.jpg\n---\n正文" },
      { path: "posts/draft.md", text: "---\ntitle: 草稿\ndraft: true\n---\n隐藏" },
    ],
  });
  assert.equal(markdown.length, 1);
  assert.equal(markdown[0].title, "色彩");
  assert.deepEqual(markdown[0].tags.includes("色彩") && markdown[0].tags.includes("审美"), true);
  assert.match(markdown[0].image, /posts\/cover\.jpg/);
  const feed = chooseArticles(site, {
    feedXml: `<?xml version="1.0"?><rss><channel><item><title>窗光</title><link>https://example.com/a</link><description>一篇短文</description><pubDate>2026-11-12</pubDate><category>光线</category></item></channel></rss>`,
  });
  assert.equal(feed[0].title, "窗光");
  assert.equal(feed[0].url, "https://example.com/a");
  assert.ok(feed[0].tags.includes("光线"));
});

test("没有提交的日子是无更新，读失败不是无更新", () => {
  const bots = [
    { id: "a", bot: "云观 · 审美老师", createdAt: "2026-11-12T01:00:00Z" },
    { id: "b", bot: "衣见 · 穿搭老师", createdAt: "2026-11-13T01:00:00Z" },
    { id: "broken", bot: "观照", createdAt: null, fetchError: true, errorMessage: "暂时无法读取" },
  ];
  const commits = {
    a: [{
      sha: "abcdef1",
      date: "2026-11-12T14:43:00Z",
      message: "Initial commit",
      url: "https://github.com/o/r/commit/abcdef1",
      author: "57cx",
      files: [{ path: "README.md", status: "added" }],
    }],
    b: [],
    broken: [],
  };
  const days = buildActivity({
    bots,
    commitsByBot: commits,
    articlesByBot: { a: [], b: [], broken: [] },
    from: "2026-11-12",
    to: "2026-11-13",
  });
  const nov12 = days.find((day) => day.date === "2026-11-12");
  const yun = nov12.bots.find((bot) => bot.id === "a");
  const yi = nov12.bots.find((bot) => bot.id === "b");
  const broken = nov12.bots.find((bot) => bot.id === "broken");
  assert.equal(yun.commitCount, 1);
  assert.equal(yun.articlesAdded.length, 0);
  assert.equal(yun.changes[0].message, "Initial commit");
  assert.equal(yi.message, "仓库尚未创建");
  assert.equal(broken.message, "暂时无法读取");
  const nov13 = days.find((day) => day.date === "2026-11-13");
  assert.equal(nov13.bots.find((bot) => bot.id === "a").message, "无更新");
  assert.equal(nov13.bots.find((bot) => bot.id === "b").message, "无更新");
});

test("新增文章只算第一次加入的那天", () => {
  const article = { id: "1", title: "窗光", url: "https://example.com/#week=2026-11-07", sourcePath: "2026-11-07/窗光" };
  const commits = [
    { sha: "1111111", date: "2026-11-08T12:00:00Z", files: [{ path: "2026-11-07/窗光/01.jpg", status: "added" }] },
    { sha: "2222222", date: "2026-11-10T14:00:00Z", files: [{ path: "2026-11-07/窗光/note.pdf", status: "modified" }] },
  ];
  const days = buildActivity({
    bots: [{ id: "w", bot: "观照", createdAt: "2026-10-17T15:39:50Z" }],
    commitsByBot: { w: commits.map((commit) => ({ ...commit, message: commit.sha, url: "https://example.com", author: "A" })) },
    articlesByBot: { w: [article] },
    from: "2026-11-08",
    to: "2026-11-10",
  });
  const added = days.find((day) => day.date === "2026-11-08").bots[0];
  const revised = days.find((day) => day.date === "2026-11-10").bots[0];
  assert.equal(added.articlesAdded.length, 1);
  assert.equal(revised.articlesAdded.length, 0);
  assert.equal(revised.commitCount, 1);
  assert.equal(days.find((day) => day.date === "2026-11-09").bots[0].message, "无更新");
});

test("页面会转义提交说明，并带上 Pages 子路径", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "hub-"));
  await buildSite({
    data: {
      title: "涵的学习馆",
      generatedAt: "2026-11-12T04:00:00Z",
      today: "2026-11-12",
      sites: [{
        id: "a",
        name: "每日审美",
        topic: "审美",
        bot: "云观 · 审美老师",
        status: "building",
        cover: "covers/aesthetics.svg",
        intro: "零基础",
        repo: "o/r",
        repoUrl: "https://github.com/o/r",
        pagesLive: false,
        articleCount: 0,
        commitCount: 1,
        lastCommitAt: "2026-11-12T14:43:00Z",
      }],
      articles: [{
        id: "a:1",
        siteId: "a",
        title: "窗光",
        summary: "看光",
        url: "https://example.com/a",
        image: "",
        tags: ["摄影审美"],
        publishedAt: "2026-01-04",
      }],
      activity: [{
        date: "2026-11-12",
        weekday: "星期四",
        bots: [{
          id: "a",
          bot: "云观 · 审美老师",
          state: "updated",
          commitCount: 1,
          articlesAdded: [],
          changes: [{ sha: "abc1234", url: "https://github.com/o/r/commit/abc", message: "<script>alert(1)</script>", author: "57cx" }],
          filesTruncated: false,
        }, {
          id: "worker",
          bot: "worker",
          state: "empty",
          message: "无更新",
          commitCount: 0,
          articlesAdded: [],
          changes: [],
        }],
      }],
    },
    outDir: out,
    base: "/han-learning-hub",
    publicDir: path.join(root, "public"),
    styleFile: path.join(root, "src", "site.css"),
    scriptFile: path.join(root, "src", "site.js"),
  });
  const activity = await readFile(path.join(out, "activity", "index.html"), "utf8");
  const home = await readFile(path.join(out, "index.html"), "utf8");
  assert.match(activity, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(activity.includes("<script>alert(1)</script>"), false);
  assert.match(activity, /无更新/);
  assert.match(activity, /建设中|云观/);
  assert.match(home, /建设中/);
  assert.match(home, /href="\/han-learning-hub\/activity\/"/);
  assert.match(home, /src="\/han-learning-hub\/covers\/aesthetics\.svg"/);
  const tagPage = await readFile(path.join(out, "tags", "摄影审美", "index.html"), "utf8");
  assert.match(tagPage, /窗光/);
  assert.equal(tagHref("/han-learning-hub", "摄影审美"), "/han-learning-hub/tags/%E6%91%84%E5%BD%B1%E5%AE%A1%E7%BE%8E/");
  await rm(out, { recursive: true, force: true });
});

test("配置只接受完整条目", () => {
  assert.throws(() => loadConfig({ hubRepo: "o/r", sites: [{ id: "a" }] }));
  const config = loadConfig({
    hubRepo: "57cx/han-learning-hub",
    sites: [{ id: "photo", name: "光影", topic: "摄影", bot: "光影 · 摄影老师", status: "upcoming", repo: "" }],
  });
  assert.equal(config.sites[0].status, "upcoming");
});

test("刷新不会把空仓库写成已有文章", async () => {
  const config = loadConfig({
    title: "涵的学习馆",
    hubRepo: "57cx/han-learning-hub",
    basePath: "/han-learning-hub",
    worker: { id: "worker", bot: "worker" },
    sites: [
      { id: "daily", name: "每日审美", topic: "审美", bot: "云观 · 审美老师", repo: "57cx/aesthetics-daily", cover: "covers/aesthetics.svg", intro: "每天一篇" },
      { id: "photo", name: "光影", topic: "摄影", bot: "光影 · 摄影老师", repo: "", status: "upcoming", intro: "即将接入", cover: "covers/photography.svg" },
    ],
  });
  const github = {
    async request(requestPath) {
      if (requestPath.includes("/pages")) return null;
      if (requestPath.includes("/git/trees/")) return { tree: [{ type: "blob", path: "README.md" }] };
      if (requestPath.includes("/commits/")) return null;
      const repo = requestPath.split("/")[2] + "/" + requestPath.split("/")[3];
      return {
        default_branch: "main",
        created_at: repo.endsWith("han-learning-hub") ? "2026-11-12T14:49:41Z" : "2026-11-12T14:42:58Z",
        pushed_at: "2026-11-12T14:43:00Z",
        html_url: `https://github.com/${repo}`,
        description: "",
      };
    },
    async paginate(requestPath) {
      if (requestPath.includes("aesthetics-daily")) {
        return [{ sha: "aaaaaaa" }];
      }
      return [];
    },
  };
  github.request = async function request(requestPath) {
    if (requestPath.endsWith("/commits/aaaaaaa")) {
      return {
        sha: "aaaaaaa",
        html_url: "https://github.com/57cx/aesthetics-daily/commit/aaaaaaa",
        commit: { message: "Initial commit\n\n", author: { name: "57cx", date: "2026-11-12T14:43:00Z" } },
        files: [{ filename: "README.md", status: "added" }],
      };
    }
    if (requestPath.includes("/pages")) return null;
    if (requestPath.includes("/git/trees/")) return { tree: [{ type: "blob", path: "README.md" }] };
    const [, , owner, name] = requestPath.split("/");
    return {
      default_branch: "main",
      created_at: name === "han-learning-hub" ? "2026-11-12T14:49:41Z" : "2026-11-12T14:42:58Z",
      pushed_at: "2026-11-12T14:43:00Z",
      html_url: `https://github.com/${owner}/${name}`,
      description: "",
    };
  };
  const hub = await refreshHub({ config, github, now: new Date("2026-11-12T16:00:00Z") });
  assert.equal(hub.today, "2026-11-13");
  assert.equal(hub.articles.length, 0);
  assert.equal(hub.sites.find((site) => site.id === "daily").status, "building");
  assert.equal(hub.sites.find((site) => site.id === "photo").status, "upcoming");
  const today = hub.activity[0];
  assert.equal(today.date, "2026-11-13");
  assert.equal(today.bots.find((bot) => bot.id === "daily").message, "无更新");
  assert.equal(today.bots.find((bot) => bot.id === "worker").message, "无更新");
  assert.equal(hub.activity.at(-1).bots.find((bot) => bot.id === "daily").changes[0].message, "Initial commit");
  assert.equal(hub.activity.some((day) => day.bots.some((bot) => bot.bot === "光影 · 摄影老师")), false);
  assert.equal(escapeHtml("<ok>"), "&lt;ok&gt;");
  assert.equal(makeHref("/han-learning-hub", "/browse/"), "/han-learning-hub/browse/");
});
