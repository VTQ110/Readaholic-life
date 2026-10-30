"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { marked } from "marked";
import AdminProvider, { useAdmin } from "@/components/admin/AdminProvider";
import { formatNumber } from "@/components/format";
import { today, type ChapterSource, type SourceStory } from "@/lib/content";

const draftKey = (slug: string, file: string | null) => `readaholic:draft:${slug}:${file ?? "new"}`;

function ChapterEditor() {
  const { store } = useAdmin();
  const router = useRouter();
  const params = useSearchParams();
  const slug = params.get("id")!;
  const fileName = params.get("file");

  const [story, setStory] = useState<SourceStory | null>(null);
  const [chapter, setChapter] = useState<ChapterSource>({ title: "", date: today(), draft: false, content: "" });
  const [restored, setRestored] = useState(false);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = useRef(false);

  const file = story?.chapters.find((c) => c.name === fileName) ?? null;

  useEffect(() => {
    (async () => {
      try {
        const s = await store.loadStory(slug);
        if (!s) throw new Error("Không tìm thấy truyện");
        setStory(s);
        const f = s.chapters.find((c) => c.name === fileName);
        if (fileName && !f) throw new Error("Không tìm thấy chương");
        let data: ChapterSource = f
          ? await store.readChapter(f)
          : { title: `Chương ${s.chapters.length + 1}: `, date: today(), draft: false, content: "" };
        try {
          const local = localStorage.getItem(draftKey(slug, fileName));
          if (local) {
            data = JSON.parse(local);
            setRestored(true);
            dirty.current = true;
          }
        } catch {}
        setChapter(data);
      } catch (e) {
        setError((e as Error).message);
      }
      setLoading(false);
    })();
  }, [store, slug, fileName]);

  // Tự lưu bản nháp trên trình duyệt để không mất bài khi lỡ đóng trang
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(slug, fileName), JSON.stringify(chapter));
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [chapter, slug, fileName]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function update(patch: Partial<ChapterSource>) {
    dirty.current = true;
    setChapter((c) => ({ ...c, ...patch }));
  }

  function discardDraft() {
    try {
      localStorage.removeItem(draftKey(slug, fileName));
    } catch {}
    dirty.current = false;
    location.reload();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!story) return;
    setBusy(true);
    setError("");
    try {
      await store.saveChapter(story, file, { ...chapter, title: chapter.title.trim(), content: chapter.content.trim() });
      dirty.current = false;
      try {
        localStorage.removeItem(draftKey(slug, fileName));
      } catch {}
      router.push(`/quan-ly/truyen/?id=${slug}&saved=1`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Đang tải từ GitHub...</p>;
  if (!story) return <p className="error">{error}</p>;

  const words = chapter.content.split(/\s+/).filter(Boolean).length;

  return (
    <>
      <p className="breadcrumb">
        <Link href={`/quan-ly/truyen/?id=${slug}`}>{story.meta.title}</Link> / {file ? "Sửa chương" : "Chương mới"}
      </p>
      {restored && (
        <p className="notice warn">
          Đã khôi phục bản nháp chưa lưu trên máy này.{" "}
          <button type="button" className="btn ghost small" onClick={discardDraft}>
            Bỏ bản nháp
          </button>
        </p>
      )}
      <form className="panel form" onSubmit={save}>
        <div className="form-row">
          <label className="grow">
            Tên chương
            <input value={chapter.title} onChange={(e) => update({ title: e.target.value })} required />
          </label>
          <label>
            Ngày đăng
            <input type="date" value={chapter.date} onChange={(e) => update({ date: e.target.value })} required />
          </label>
        </div>
        <div className="tabs">
          <button type="button" className={`btn small ${preview ? "ghost" : ""}`} onClick={() => setPreview(false)}>
            Viết
          </button>
          <button type="button" className={`btn small ${preview ? "" : "ghost"}`} onClick={() => setPreview(true)}>
            Xem trước
          </button>
          <span className="muted small">{formatNumber(words)} chữ</span>
        </div>
        {preview ? (
          <div className="prose preview" dangerouslySetInnerHTML={{ __html: marked.parse(chapter.content) as string }} />
        ) : (
          <textarea
            className="editor"
            rows={22}
            value={chapter.content}
            onChange={(e) => update({ content: e.target.value })}
            placeholder="Viết nội dung chương. Mỗi đoạn cách nhau một dòng trống. **in đậm**, *in nghiêng*, --- để ngắt cảnh."
          />
        )}
        <label className="check">
          <input type="checkbox" checked={chapter.draft} onChange={(e) => update({ draft: e.target.checked })} />
          Bản nháp (chưa hiện trên trang đọc)
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy}>
            {busy ? "Đang lưu..." : file ? "Lưu chương" : "Đăng chương"}
          </button>
          <Link
            className="btn"
            href={`/quan-ly/truyen/?id=${slug}`}
            onClick={(e) => {
              if (dirty.current && !confirm("Bỏ những thay đổi chưa lưu?")) return e.preventDefault();
              try {
                localStorage.removeItem(draftKey(slug, fileName));
              } catch {}
              dirty.current = false;
            }}
          >
            Huỷ
          </Link>
        </div>
      </form>
    </>
  );
}

export default function Page() {
  return (
    <AdminProvider>
      <Suspense>
        <ChapterEditor />
      </Suspense>
    </AdminProvider>
  );
}
