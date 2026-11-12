# 涵的学习馆

把 han 的各科学习站点收成一个入口，发布在 [https://57cx.github.io/han-learning-hub/](https://57cx.github.io/han-learning-hub/)。

页面上的文章、提交和「无更新」都来自各仓库的公开记录。脚本不会在没有提交时编造更新。

## 站点名册

编辑根目录的 [`sites.json`](sites.json)。每个已接入的站点一条：

| 字段 | 含义 |
|---|---|
| `id` | 稳定英文标识，不要重复 |
| `name` | 站点名称 |
| `topic` | 学科，也会作为文章标签 |
| `bot` | 老师或维护者的显示名 |
| `repo` | `owner/name` |
| `url` | 预期的 Pages 地址 |
| `cover` | `public/` 下的封面，目前用自制 SVG |
| `intro` | 一句话介绍 |
| `tags` | 可选，额外标签 |
| `status` | 不填就是按仓库实际情况判断；`upcoming` 表示还没接入 |

还没有 Pages 或还没有文章的站点会显示「建设中」。`upcoming` 只出现在名册里，不进入每日动态，也不会假装有提交。

## 加上摄影站

光影 · 摄影老师的位置已经留在名册末尾。仓库建好后，把那一条改成：

```json
{
  "id": "photography",
  "name": "光影",
  "topic": "摄影",
  "bot": "光影 · 摄影老师",
  "repo": "57cx/你的摄影仓库",
  "url": "https://57cx.github.io/你的摄影仓库/",
  "cover": "covers/photography.svg",
  "intro": "一句话介绍。"
}
```

删掉 `"status": "upcoming"`。推送到 `main` 后，工作流会重新读取这个仓库。

## 文章怎样被收录

按这个顺序，命中一种就不再猜下一种：

1. 仓库根目录的 `site.json`。若其中声明了 `data.daily_index` 和 `data.daily_digest`，只收录索引里的每日解读；论文数量用 `counts.papers`。某天没有解读文件，就不会出现在今日更新里。
2. 仓库根目录或 `data/` 里的 `feed.json`、`articles.json`、`hub-feed.json`
3. `feed.xml`、`rss.xml`、`atom.xml`、`index.xml`
4. 任意目录里的 Markdown、HTML 页面，以及带 `articles` / `posts` / `entries` 的 JSON 索引。导航页、关于页和 README 不算文章。站点已发布时链到页面；还没有 Pages 时链到 GitHub 上的文件，卡片保持建设中。
5. 根目录 `catalog.js` 里的 `weeks`（观照现在就是这种）
6. `YYYY-MM-DD/题材名/` 文件夹里的图片或文档

建议新站点直接放一份 `feed.json`：

```json
{
  "articles": [
    {
      "title": "文章标题",
      "url": "https://57cx.github.io/仓库/文章地址/",
      "date": "2026-11-12",
      "summary": "一两句摘要",
      "image": "https://...",
      "tags": ["标签"]
    }
  ]
}
```

Markdown 可用前言：

```yaml
---
title: 色彩
date: 2026-11-12
summary: 先看颜色。
tags: [色彩, 光线]
image: cover.jpg
---
```

`url` 写绝对地址最稳。没有 `url` 时，链接会指向 GitHub 上的文件，或者站点已经发布时的相对路径。

## 每日动态

日期按北京时间。从最早一个已接入仓库的创建日排到今天。每一位老师，加上这个仓库的 `worker`，当天都会出现：

- 有提交：提交次数、说明、作者和链接；若提交里第一次加入了某篇文章，会列出文章
- 仓库当天已存在但没有提交：无更新
- 仓库还没创建：仓库尚未创建
- 接口读失败：暂时无法读取（不会写成无更新）

## 本地预览

需要 Node.js 22。公开仓库用 `GITHUB_TOKEN` 或本机 `gh auth token`，避免匿名接口的频率限制。

```bash
npm test
npm run refresh
BASE_PATH= npm run build
npm start
```

浏览器打开 `http://127.0.0.1:4173/`。正式发布的子路径是 `/han-learning-hub/`，由 GitHub Actions 在构建时加上。

## 自动更新

[`.github/workflows/pages.yml`](.github/workflows/pages.yml) 会在这些情况下运行：每天 08:30 和 10:00（北京时间）、推送到 `main`、以及手动 `workflow_dispatch`。10:00 这一次用来收进大约 09:30 才写好的当日解读。它用默认的 `GITHUB_TOKEN` 读取公开仓库，重新生成本站，再部署到 GitHub Pages。

Pages 的构建来源需要是 GitHub Actions。如果仓库还没打开这个开关，到 Settings → Pages → Build and deployment，把 Source 设为 GitHub Actions，然后重跑「发布学习馆」。
