const API = "https://api.github.com";

export function githubToken() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class GitHub {
  constructor(token = githubToken()) {
    this.token = token;
  }

  async request(path, { retry = 4, token = this.token } = {}) {
    const url = path.startsWith("http") ? path : `${API}${path}`;
    let lastError;
    for (let attempt = 0; attempt < retry; attempt += 1) {
      const headers = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "han-learning-hub",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(url, { headers });
      if (response.status === 404) return null;
      if (response.status === 403 || response.status === 429 || response.status >= 500) {
        const remaining = response.headers.get("x-ratelimit-remaining");
        const reset = Number(response.headers.get("x-ratelimit-reset") || 0);
        const body = await response.text();
        const blocked = /Resource not accessible|not accessible by integration/i.test(body);
        if (blocked && token) return this.request(path, { retry, token: "" });
        if ((response.status === 403 || response.status === 429) && remaining === "0" && reset) {
          const wait = reset * 1000 - Date.now() + 1000;
          if (wait > 0 && wait < 90_000) {
            await sleep(wait);
            continue;
          }
        }
        lastError = new Error(`GitHub ${response.status} ${path}: ${body.slice(0, 180)}`);
        lastError.fatal = true;
        lastError.status = response.status;
        if (attempt < retry - 1 && (response.status >= 500 || response.status === 403)) {
          await sleep(800 * 2 ** attempt);
          continue;
        }
        throw lastError;
      }
      if (!response.ok) {
        const body = await response.text();
        const error = new Error(`GitHub ${response.status} ${path}: ${body.slice(0, 180)}`);
        error.fatal = response.status >= 500;
        error.status = response.status;
        throw error;
      }
      return response.json();
    }
    throw lastError;
  }

  async paginate(path) {
    const items = [];
    const joiner = path.includes("?") ? "&" : "?";
    for (let page = 1; page <= 30; page += 1) {
      const data = await this.request(`${path}${joiner}per_page=100&page=${page}`);
      if (!Array.isArray(data) || data.length === 0) break;
      items.push(...data);
      if (data.length < 100) break;
    }
    return items;
  }
}

export async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await fn(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}
