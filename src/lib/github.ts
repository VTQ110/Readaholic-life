// Đọc/ghi file trong repo qua GitHub API, dùng cho trang quản lý.
import { b64ToBytes } from "./crypto";

const CONFIG_KEY = "readaholic:github";

export type GitHubConfig = { token: string; repo: string; branch: string };

export function loadConfig(): GitHubConfig {
  let saved: Partial<GitHubConfig> = {};
  try {
    saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}");
  } catch {}
  return {
    token: saved.token || "",
    repo: saved.repo || process.env.NEXT_PUBLIC_GITHUB_REPO || "",
    branch: saved.branch || process.env.NEXT_PUBLIC_GITHUB_BRANCH || "main",
  };
}

export function saveConfig(config: GitHubConfig | null) {
  try {
    if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {}
}

export type DirEntry = { name: string; path: string; sha: string; type: "file" | "dir" };

export type FileChange = { path: string; content: string } | { path: string; delete: true };

export class GitHub {
  constructor(private config: GitHubConfig) {}

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`https://api.github.com/repos/${this.config.repo}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.config.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!res.ok) {
      const detail = ((await res.json().catch(() => ({}))) as { message?: string }).message ?? "";
      const msg =
        res.status === 401
          ? "Token không hợp lệ hoặc đã hết hạn."
          : res.status === 403 && /rate limit/i.test(detail)
            ? "GitHub tạm giới hạn số lần gọi, thử lại sau ít phút."
            : res.status === 403
              ? "Token chưa có quyền ghi vào repo này. Kiểm tra token: Repository access phải chọn đúng repo, và Permissions → Contents phải là “Read and write”."
              : res.status === 404
                ? "Không tìm thấy repo hoặc nhánh, kiểm tra lại tên repo/nhánh và quyền truy cập của token."
                : `GitHub trả lỗi ${res.status}`;
      const err = new Error(msg) as Error & { status: number };
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  /**
   * Kiểm tra token có thật sự ghi được vào repo không. `permissions` trong thông tin repo là quyền của
   * tài khoản chứ không phải của token, nên thử tạo một blob rỗng (không gắn vào commit nào, không ảnh hưởng repo).
   */
  async checkAccess() {
    await this.api(`/git/ref/heads/${encodeURIComponent(this.config.branch)}`);
    await this.api("/git/blobs", { method: "POST", body: JSON.stringify({ content: "", encoding: "utf-8" }) });
  }

  /** Liệt kê thư mục; trả về [] nếu thư mục chưa tồn tại. */
  async list(dir: string): Promise<DirEntry[]> {
    try {
      const items = await this.api<DirEntry[]>(`/contents/${dir}?ref=${encodeURIComponent(this.config.branch)}`);
      return Array.isArray(items) ? items : [];
    } catch (e) {
      if ((e as { status?: number }).status === 404) return [];
      throw e;
    }
  }

  async readBase64(sha: string): Promise<string> {
    const blob = await this.api<{ content: string }>(`/git/blobs/${sha}`);
    return blob.content.replace(/\s/g, "");
  }

  async readText(sha: string): Promise<string> {
    return new TextDecoder().decode(b64ToBytes(await this.readBase64(sha)));
  }

  /** Ghi/xoá nhiều file trong một commit duy nhất (chỉ kích hoạt một lần deploy). Trả về sha của các file đã ghi. */
  async commit(changes: FileChange[], message: string): Promise<Record<string, string>> {
    const branch = encodeURIComponent(this.config.branch);
    const head = await this.api<{ object: { sha: string } }>(`/git/ref/heads/${branch}`);
    const parent = await this.api<{ tree: { sha: string } }>(`/git/commits/${head.object.sha}`);

    const tree = await Promise.all(
      changes.map(async (c) => {
        if ("delete" in c) return { path: c.path, mode: "100644", type: "blob", sha: null };
        const blob = await this.api<{ sha: string }>("/git/blobs", {
          method: "POST",
          body: JSON.stringify({ content: c.content, encoding: "utf-8" }),
        });
        return { path: c.path, mode: "100644", type: "blob", sha: blob.sha };
      }),
    );

    const newTree = await this.api<{ sha: string }>("/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: parent.tree.sha, tree }),
    });
    const commit = await this.api<{ sha: string }>("/git/commits", {
      method: "POST",
      body: JSON.stringify({ message, tree: newTree.sha, parents: [head.object.sha] }),
    });
    await this.api(`/git/refs/heads/${branch}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
    return Object.fromEntries(tree.filter((t) => t.sha).map((t) => [t.path, t.sha as string]));
  }
}
