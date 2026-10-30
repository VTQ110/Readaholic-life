"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { ContentStore } from "@/lib/content";
import { GitHub, loadConfig, saveConfig, type GitHubConfig } from "@/lib/github";
import Protected from "../Protected";

type Admin = { store: ContentStore; config: GitHubConfig; signOut: () => void };

const AdminContext = createContext<Admin | null>(null);

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin phải nằm trong AdminProvider");
  return ctx;
}

function TokenForm({ initial, onDone }: { initial: GitHubConfig; onDone: (c: GitHubConfig) => void }) {
  const [config, setConfig] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const c = { token: config.token.trim(), repo: config.repo.trim(), branch: config.branch.trim() };
      if (!(await new GitHub(c).checkAccess())) throw new Error("Token chỉ có quyền đọc, cần quyền ghi (Contents: Read and write).");
      saveConfig(c);
      onDone(c);
    } catch (e) {
      setError((e as Error).message === "GitHub trả lỗi 404" ? "Không tìm thấy repo, kiểm tra lại tên repo hoặc quyền của token." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <h1>Kết nối GitHub</h1>
      <p className="muted">
        Trang quản lý lưu truyện bằng cách commit thẳng vào repo trên GitHub, sau đó GitHub tự build lại trang (1–2 phút). Bạn cần
        một <strong>token</strong> có quyền ghi vào repo. Token chỉ lưu trên trình duyệt này.
      </p>
      <details>
        <summary>Cách tạo token</summary>
        <ol className="small">
          <li>
            Mở{" "}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
              github.com/settings/personal-access-tokens/new
            </a>
          </li>
          <li>Đặt tên tuỳ ý, chọn thời hạn (Expiration).</li>
          <li>
            <em>Repository access</em> → <em>Only select repositories</em> → chọn repo của trang này.
          </li>
          <li>
            <em>Permissions → Repository permissions → Contents</em> → <em>Read and write</em>.
          </li>
          <li>Bấm Generate token, copy chuỗi bắt đầu bằng <code>github_pat_</code> và dán vào đây.</li>
        </ol>
      </details>
      <label>
        Token
        <input type="password" value={config.token} onChange={(e) => setConfig({ ...config, token: e.target.value })} required autoComplete="off" />
      </label>
      <div className="form-row">
        <label>
          Repo (chủ/tên)
          <input value={config.repo} onChange={(e) => setConfig({ ...config, repo: e.target.value })} placeholder="ten-ban/ten-repo" required />
        </label>
        <label>
          Nhánh
          <input value={config.branch} onChange={(e) => setConfig({ ...config, branch: e.target.value })} required />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? "Đang kiểm tra..." : "Kết nối"}
      </button>
    </form>
  );
}

function AdminInner({ children }: { children: React.ReactNode }) {
  const { key } = useAuth();
  const [config, setConfig] = useState<GitHubConfig | null>(null);

  useEffect(() => setConfig(loadConfig()), []);

  const admin = useMemo<Admin | null>(() => {
    if (!config?.token || !key) return null;
    return {
      store: new ContentStore(new GitHub(config), key),
      config,
      signOut: () => {
        saveConfig(null);
        setConfig({ ...config, token: "" });
      },
    };
  }, [config, key]);

  if (!config) return null;
  if (!admin) return <TokenForm initial={config} onDone={setConfig} />;

  return (
    <AdminContext.Provider value={admin}>
      <div className="admin-bar small muted">
        <span>
          Quản lý · <Link href="/quan-ly/">Danh sách truyện</Link> ·{" "}
          <a href={`https://github.com/${config.repo}/actions`} target="_blank" rel="noreferrer">
            Tiến trình deploy
          </a>
        </span>
        <button className="btn ghost small" onClick={admin.signOut}>
          Ngắt kết nối GitHub
        </button>
      </div>
      {children}
    </AdminContext.Provider>
  );
}

export default function AdminProvider({ children }: { children: React.ReactNode }) {
  return (
    <Protected>
      <AdminInner>{children}</AdminInner>
    </Protected>
  );
}

export function SavedNotice() {
  return (
    <p className="notice">
      ✓ Đã lưu lên GitHub. Trang đọc truyện sẽ cập nhật sau khoảng 1–2 phút.
    </p>
  );
}
