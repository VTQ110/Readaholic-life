"use client";

import { useRef, useState } from "react";
import type { Format } from "@/lib/download";

const FORMATS: { id: Format; label: string; hint: string }[] = [
  { id: "epub", label: "EPUB", hint: "Sách điện tử: điện thoại, Kindle, Apple Books" },
  { id: "txt", label: "TXT", hint: "Văn bản thuần, mở được ở mọi nơi" },
];

type Props = {
  label: string;
  onDownload: (format: Format, onProgress: (text: string) => void) => Promise<void> | void;
  /** Chỉ hiện biểu tượng ⬇ */
  compact?: boolean;
  small?: boolean;
};

export default function DownloadMenu({ label, onDownload, compact, small }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function pick(format: Format) {
    ref.current?.removeAttribute("open");
    setError("");
    setBusy("Đang tạo file...");
    try {
      await onDownload(format, setBusy);
    } catch (e) {
      setError(`Tải thất bại: ${(e as Error).message}`);
    }
    setBusy(null);
  }

  return (
    <details ref={ref} className="download-menu">
      <summary className={`btn ${compact || small ? "ghost small" : ""}`} aria-label={label} title={label} aria-busy={Boolean(busy)}>
        {compact ? "⬇" : busy ?? `⬇ ${label}`}
      </summary>
      <div className="download-options" role="menu">
        {FORMATS.map((f) => (
          <button key={f.id} type="button" role="menuitem" onClick={() => pick(f.id)} disabled={Boolean(busy)}>
            <strong>{f.label}</strong>
            <span className="small muted">{f.hint}</span>
          </button>
        ))}
      </div>
      {error && <p className="error small">{error}</p>}
    </details>
  );
}
