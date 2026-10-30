"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";

export default function Gate() {
  const { unlock } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setError(false);
    const ok = await unlock(code);
    setBusy(false);
    if (!ok) {
      setError(true);
      setCode("");
    }
  }

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <div className="gate-icon" aria-hidden>
          🔒
        </div>
        <h1>Nhập mã bí mật</h1>
        <p className="muted">Trang này chỉ dành cho người có mã truy cập.</p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-label="Mã bí mật"
        />
        {error && <p className="error">Mã không đúng, thử lại nhé.</p>}
        <button type="submit" className="btn primary" disabled={busy || !code}>
          {busy ? "Đang kiểm tra..." : "Vào trang"}
        </button>
      </form>
    </div>
  );
}
