import { eachDate, shanghaiDateKey, weekdayZh } from "./time.mjs";

function fileTouches(article, file) {
  if (!article.sourcePath || !file?.path) return false;
  return file.path === article.sourcePath || file.path.startsWith(`${article.sourcePath}/`);
}

export function stampArticles(articles, commits) {
  return articles.map((article) => {
    const touches = commits
      .filter((commit) => (commit.files || []).some((file) => fileTouches(article, file)))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    return { ...article, updatedAt: touches[0]?.date || null };
  });
}

export function articlesAddedOnDate(articles, commits, dateKey) {
  const added = [];
  for (const article of articles) {
    if (!article.sourcePath) continue;
    const creating = commits
      .filter((commit) => (commit.files || []).some((file) =>
        (file.status === "added" || file.status === "renamed") && fileTouches(article, file)))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (!creating.length) continue;
    if (shanghaiDateKey(creating[0].date) === dateKey) {
      added.push({ id: article.id, title: article.title, url: article.url });
    }
  }
  return added;
}

export function buildActivity({ bots, commitsByBot, articlesByBot, from, to }) {
  return eachDate(from, to).reverse().map((date) => ({
    date,
    weekday: weekdayZh(date),
    label: "",
    bots: bots.map((bot) => summarizeBot(bot, date, commitsByBot[bot.id] || [], articlesByBot[bot.id] || [])),
  }));
}

function summarizeBot(bot, date, commits, articles) {
  const base = { id: bot.id, bot: bot.bot, name: bot.name, repo: bot.repo };
  if (bot.fetchError) {
    return {
      ...base,
      state: "error",
      message: bot.errorMessage || "暂时无法读取",
      commitCount: 0,
      articlesAdded: [],
      changes: [],
      filesTruncated: false,
    };
  }
  const created = bot.createdAt ? shanghaiDateKey(bot.createdAt) : null;
  if (created && date < created) {
    return {
      ...base,
      state: "not-created",
      message: "仓库尚未创建",
      commitCount: 0,
      articlesAdded: [],
      changes: [],
      filesTruncated: false,
    };
  }
  const todays = commits.filter((commit) => shanghaiDateKey(commit.date) === date);
  if (!todays.length) {
    return {
      ...base,
      state: "empty",
      message: "无更新",
      commitCount: 0,
      articlesAdded: [],
      changes: [],
      filesTruncated: false,
    };
  }
  return {
    ...base,
    state: "updated",
    message: "",
    commitCount: todays.length,
    articlesAdded: articlesAddedOnDate(articles, commits, date),
    changes: todays.map((commit) => ({
      sha: commit.sha.slice(0, 7),
      url: commit.url,
      message: commit.message,
      author: commit.author,
    })),
    filesTruncated: todays.some((commit) => commit.filesTruncated),
  };
}

export function activityRange(bots, now = new Date()) {
  const end = shanghaiDateKey(now);
  const created = bots
    .map((bot) => (bot.createdAt ? shanghaiDateKey(bot.createdAt) : null))
    .filter(Boolean)
    .sort();
  const commitDates = bots
    .flatMap((bot) => bot.commitDates || [])
    .filter(Boolean)
    .sort();
  const start = created[0] || commitDates[0] || end;
  return { from: start < end ? start : end, to: end };
}
