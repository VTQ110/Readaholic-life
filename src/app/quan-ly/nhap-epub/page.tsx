"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { marked } from "marked";
import AdminProvider, { useAdmin } from "@/components/admin/AdminProvider";
import { formatNumber } from "@/components/format";
import { today, type StoryMeta } from "@/lib/content";
import { parseEpub, type EpubChapter } from "@/lib/epub";
import { resizeImage } from "@/lib/image";

type Row = EpubChapter & { include: boolean };

function EpubImport() {
  const { store } = useAdmin();
  const router = useRouter();

  const [fileName, setFileName] = useState("");
  const [meta, setMeta] = useState<StoryMeta | null>(null);
  const [tags, setTags] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setMeta(null);
    setBusy(true);
    setStatus("Đang đọc file EPUB...");
    try {
      const book = await parseEpub(file);
      if (!book.chapters.length) throw new Error("Không tìm thấy chương nào trong file này.");
      setFileName(file.name);
      setMeta({
        title: book.title,
        author: book.author,
        description: book.description,
        status: "completed",
        tags: book.tags,
        created: today(),
        draft: false,
      });
      setTags(book.tags.join(", "));
      setCover(book.cover ? await resizeImage(book.cover).catch(() => null) : null);
      // Bỏ chọn sẵn các phần thường không phải nội dung truyện
      setRows(
        book.chapters.map((c) => ({
          ...c,
          include: !c.front && c.words > 0 && !/^(mục lục|table of contents|contents|bìa|cover|copyright|bản quyền)$/i.test(c.title.trim()),
        })),
      );
      setOpen(null);
    } catch (err) {
      setError((err as Error).message);
    }
    setStatus("");
    setBusy(false);
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!meta) return;
    const chosen = rows.filter((r) => r.include);
    if (!chosen.length) return setError("Chọn ít nhất một chương.");
    if (!meta.title.trim()) return setError("Nhập tên truyện.");
    setBusy(true);
    setError("");
    try {
      const date = today();
      const slug = await store.importStory(
        { ...meta, title: meta.title.trim(), tags: tags.split(",").map((t) => t.trim()).filter(Boolean) },
        cover,
        chosen.map((r) => ({ title: r.title.trim() || "Chương", date, draft: false, content: r.content })),
        (done, total) => setStatus(`Đang tải lên GitHub ${done}/${total}...`),
      );
      router.push(`/quan-ly/truyen/?id=${slug}&saved=1`);
    } catch (err) {
      setError((err as Error).message);
      setStatus("");
      setBusy(false);
    }
  }

  const chosen = rows.filter((r) => r.include);

  return (
    <>
      <h1>Nhập truyện từ EPUB</h1>
      <p className="muted">
        Chọn một file .epub hoàn chỉnh. Trang sẽ đọc tên truyện, tác giả, giới thiệu, ảnh bìa và tách chương theo mục lục. Bạn xem lại
        và chỉnh trước khi lưu. Nội dung được mã hoá trước khi tải lên.
      </p>

      <div className="panel">
        <label className="btn primary">
          {fileName ? "Chọn file khác" : "Chọn file EPUB"}
          <input type="file" accept=".epub,application/epub+zip" hidden onChange={pick} disabled={busy} />
        </label>
        {fileName && <span className="muted small"> {fileName}</span>}
        {status && <p className="muted">{status}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      {meta && (
        <>
          <div className="panel form">
            <div className="cover-field">
              {cover ? <img className="cover" src={cover} alt="Ảnh bìa" /> : <div className="cover cover-placeholder">?</div>}
              <div className="grow-col">
                <label>
                  Tên truyện
                  <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} required />
                </label>
                {cover && (
                  <button type="button" className="btn ghost small" onClick={() => setCover(null)}>
                    Bỏ ảnh bìa
                  </button>
                )}
              </div>
            </div>
            <div className="form-row">
              <label>
                Tác giả / bút danh
                <input value={meta.author} onChange={(e) => setMeta({ ...meta, author: e.target.value })} />
              </label>
              <label>
                Tình trạng
                <select value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value as StoryMeta["status"] })}>
                  <option value="ongoing">Đang ra</option>
                  <option value="completed">Hoàn thành</option>
                </select>
              </label>
            </div>
            <label>
              Thể loại <span className="muted small">(cách nhau bằng dấu phẩy)</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} />
            </label>
            <label>
              Giới thiệu
              <textarea rows={4} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={Boolean(meta.draft)} onChange={(e) => setMeta({ ...meta, draft: e.target.checked })} />
              Ẩn truyện này khỏi trang đọc
            </label>
          </div>

          <section>
            <div className="row">
              <h2 className="section-title">
                Chương ({chosen.length}/{rows.length} được chọn · {formatNumber(chosen.reduce((s, r) => s + r.words, 0))} chữ)
              </h2>
              <span>
                <button className="btn ghost small" onClick={() => setRows(rows.map((r) => ({ ...r, include: true })))}>
                  Chọn hết
                </button>
                <button className="btn ghost small" onClick={() => setRows(rows.map((r) => ({ ...r, include: false })))}>
                  Bỏ hết
                </button>
              </span>
            </div>
            <p className="muted small">Bỏ chọn các phần không phải truyện (lời cảm ơn, bản quyền...). Bấm “Xem” để kiểm tra nội dung.</p>
            <ol className="admin-list import-list">
              {rows.map((r, i) => (
                <li key={i} className={r.include ? "" : "excluded"}>
                  <div className="import-row">
                    <input type="checkbox" checked={r.include} onChange={(e) => updateRow(i, { include: e.target.checked })} aria-label="Chọn chương" />
                    <input className="title-input" value={r.title} onChange={(e) => updateRow(i, { title: e.target.value })} aria-label="Tên chương" />
                    <span className="muted small nowrap">{formatNumber(r.words)} chữ</span>
                    <button className="btn ghost small" onClick={() => setOpen(open === i ? null : i)}>
                      {open === i ? "Đóng" : "Xem"}
                    </button>
                  </div>
                  {open === i && (
                    <div className="prose preview" dangerouslySetInnerHTML={{ __html: marked.parse(r.content || "*(trống)*") as string }} />
                  )}
                </li>
              ))}
            </ol>
          </section>

          <div className="actions sticky-actions">
            <button className="btn primary" onClick={save} disabled={busy || !chosen.length}>
              {busy ? status || "Đang lưu..." : `Tạo truyện (${chosen.length} chương)`}
            </button>
            {error && <span className="error">{error}</span>}
          </div>
        </>
      )}
    </>
  );
}

export default function Page() {
  return (
    <AdminProvider>
      <EpubImport />
    </AdminProvider>
  );
}
