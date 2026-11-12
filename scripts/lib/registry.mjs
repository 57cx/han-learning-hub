export function loadConfig(raw) {
  const config = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!config || !Array.isArray(config.sites)) {
    throw new Error("sites.json 需要 sites 数组");
  }
  const ids = new Set();
  for (const site of config.sites) {
    if (!site.id || !site.name || !site.topic || !site.bot) {
      throw new Error(`站点缺少 id、name、topic 或 bot：${JSON.stringify(site)}`);
    }
    if (ids.has(site.id)) throw new Error(`站点 id 重复：${site.id}`);
    ids.add(site.id);
    if (site.status !== "upcoming" && !site.repo) {
      throw new Error(`${site.id} 需要 repo，或把 status 设为 upcoming`);
    }
  }
  if (!config.hubRepo) throw new Error("sites.json 需要 hubRepo");
  return config;
}

export function isUpcoming(site) {
  return site.status === "upcoming" || !site.repo;
}

export function trackedSites(config) {
  return config.sites.filter((site) => !isUpcoming(site));
}

export function activityBots(config) {
  const sites = trackedSites(config).map((site) => ({
    id: site.id,
    bot: site.bot,
    name: site.name,
    topic: site.topic,
    repo: site.repo,
    kind: "site",
  }));
  sites.push({
    id: config.worker?.id || "worker",
    bot: config.worker?.bot || "worker",
    name: config.worker?.bot || "worker",
    topic: config.worker?.topic || "学习馆",
    repo: config.hubRepo,
    kind: "worker",
  });
  return sites;
}
