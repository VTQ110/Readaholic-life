"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AdminProvider, { SavedNotice, useAdmin } from "@/components/admin/AdminProvider";
import { today, type SourceStory, type StoryMeta } from "@/lib/content";
import type { DirEntry } from "@/lib/github";
import { resizeImage } from "@/lib/image";

const EMPTY: StoryMeta = { title: "", author: "", description: "", status: "ongoing", tags: [], created: "", draft: false };

function StoryEditor() {
  const { store } = useAdmin();
  const router = useRouter();
  const params = useSearchParams();
  const slug = params.get("id");
  const saved = params.has("saved");

  const [story, setStory] = useState<SourceStory | null>(null);
  const [meta, setMeta] = useState<StoryMeta>(EMPTY);
  const [tags, setTags] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [coverChanged, setCoverChanged] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(Boolean(slug));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    store
      .loadStory(slug)
      .then(async (s) => {
        if (!s) throw new Error("Không tìm thấy truyện");
        setStory(s);
        setMeta(s.meta);
        setTags(s.meta.tags.join(", "));
        setLoading(false);
        store.readCover(s).then(setCover).catch(() => {});
        const entries = await Promise.all(
          s.chapters.map(async (c) => [c.name, (await store.readChapter(c)).title] as const),
        );
        setTitles(Object.fromEntries(entries));
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [store, slug]);

  async function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setCover(await resizeImage(file));
      setCoverChanged(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data: StoryMeta = {
        ...meta,
        title: meta.title.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        created: meta.created || today(),
      };
      const target = slug ?? (await store.uniqueSlug(data.title));
      const updated = await store.saveStory(target, data, coverChanged ? cover : undefined, story);
      if (slug) {
        setStory(updated);
        setCoverChanged(false);
        setBusy(false);
      }
      router.push(`/quan-ly/truyen/?id=${target}&saved=1`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function removeChapter(file: DirEntry) {
    if (!story || !confirm(`Xoá chương “${titles[file.name] || file.name}”? Không thể hoàn tác trên web.`)) return;
    setBusy(true);
    try {
      setStory(await store.deleteChapter(story, file));
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  async function removeStory() {
    if (!story) return;
    const answer = prompt(`Xoá toàn bộ truyện “${story.meta.title}” và ${story.chapters.length} chương?\nGõ XOA để xác nhận.`);
    if (answer?.trim().toUpperCase() !== "XOA") return;
    setBusy(true);
    try {
      await store.deleteStory(story);
      router.push("/quan-ly/?saved=1");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (loading) return <p className="muted">Đang tải từ GitHub...</p>;
  if (slug && !story) return <p className="error">{error || "Không tìm thấy truyện"}</p>;

  const isPlain = story?.files.some((f) => f.name === "story.json") || story?.chapters.some((c) => c.name.endsWith(".md"));

  return (
    <>
      {saved && <SavedNotice />}
      <h1>{story ? story.meta.title : "Truyện mới"}</h1>
      {isPlain && (
        <p className="notice warn">
          Truyện này có file chưa mã hoá (viết tay trong repo), ai xem repo cũng đọc được. Bấm Lưu (và lưu lại từng chương) để chuyển
          sang dạng mã hoá.
        </p>
      )}

      <form className="panel form" onSubmit={save}>
        <label>
          Tên truyện
          <input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} required />
        </label>
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
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Ngôn tình, Hiện đại" />
        </label>
        <label>
          Giới thiệu
          <textarea rows={5} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
        </label>
        <div className="cover-field">
          {cover ? <img className="cover" src={cover} alt="Ảnh bìa" /> : <div className="cover cover-placeholder">?</div>}
          <div>
            <label className="btn small">
              Chọn ảnh bìa
              <input type="file" accept="image/*" hidden onChange={pickCover} />
            </label>
            {cover && (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  setCover(null);
                  setCoverChanged(true);
                }}
              >
                Bỏ ảnh
              </button>
            )}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={Boolean(meta.draft)} onChange={(e) => setMeta({ ...meta, draft: e.target.checked })} />
          Ẩn truyện này khỏi trang đọc
        </label>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="btn primary" disabled={busy}>
            {busy ? "Đang lưu..." : story ? "Lưu thông tin" : "Tạo truyện"}
          </button>
          {story && (
            <button type="button" className="btn danger" onClick={removeStory} disabled={busy}>
              Xoá truyện
            </button>
          )}
        </div>
      </form>

      {story && (
        <section>
          <div className="row">
            <h2 className="section-title">Chương ({story.chapters.length})</h2>
            <Link className="btn primary" href={`/quan-ly/chuong/?id=${story.slug}`}>
              + Thêm chương
            </Link>
          </div>
          {story.chapters.length === 0 && <p className="muted">Chưa có chương nào.</p>}
          <ol className="admin-list">
            {story.chapters.map((c, i) => (
              <li key={c.path}>
                <Link href={`/quan-ly/chuong/?id=${story.slug}&file=${c.name}`}>
                  <span>
                    <span className="muted">{i + 1}.</span> {titles[c.name] ?? c.name}
                    {c.name.endsWith(".md") && <span className="badge warn-badge">chưa mã hoá</span>}
                  </span>
                </Link>
                <button className="btn ghost small" onClick={() => removeChapter(c)} disabled={busy} aria-label="Xoá chương">
                  🗑
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

export default function Page() {
  return (
    <AdminProvider>
      <Suspense>
        <StoryEditor />
      </Suspense>
    </AdminProvider>
  );
}
