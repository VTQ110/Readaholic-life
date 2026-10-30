"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Protected from "@/components/Protected";
import Cover from "@/components/Cover";
import { formatDate, formatNumber, STATUS_LABEL } from "@/components/format";
import { useData } from "@/lib/useData";
import { getProgress } from "@/lib/progress";
import type { Story } from "@/lib/types";

function StoryView() {
  const slug = useSearchParams().get("id");
  const { data: story, error } = useData<Story>(slug ? `s/${slug}.json` : null);
  const [progress, setProgress] = useState<number | null>(null);
  const [desc, setDesc] = useState(false);

  useEffect(() => {
    if (slug) setProgress(getProgress(slug));
  }, [slug]);

  if (!slug || error) return <p className="center error">Không tìm thấy truyện.</p>;
  if (!story) return <p className="center muted">Đang tải...</p>;

  const chapters = desc ? [...story.chapters].reverse() : story.chapters;

  return (
    <>
      <p className="breadcrumb">
        <Link href="/">Trang chủ</Link> / {story.title}
      </p>
      <section className="story-head">
        <Cover slug={story.slug} title={story.title} hasCover={story.hasCover} />
        <div>
          <h1>{story.title}</h1>
          {story.author && <p className="muted">Tác giả: {story.author}</p>}
          <p className="small">
            <span className={`badge ${story.status}`}>{STATUS_LABEL[story.status]}</span> {story.chapterCount} chương ·{" "}
            {formatNumber(story.words)} chữ · Cập nhật {formatDate(story.updatedAt)}
          </p>
          {story.tags.length > 0 && (
            <p className="tags">
              {story.tags.map((t) => (
                <Link key={t} className="tag" href={`/?tag=${encodeURIComponent(t)}`}>
                  {t}
                </Link>
              ))}
            </p>
          )}
          {story.chapterCount > 0 && (
            <div className="actions">
              <Link className="btn primary" href={`/doc/?id=${story.slug}&ch=1`}>
                Đọc từ đầu
              </Link>
              {progress && progress <= story.chapterCount && (
                <Link className="btn" href={`/doc/?id=${story.slug}&ch=${progress}`}>
                  Đọc tiếp chương {progress}
                </Link>
              )}
              {story.latest && (
                <Link className="btn" href={`/doc/?id=${story.slug}&ch=${story.latest.n}`}>
                  Chương mới nhất
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      {story.description && (
        <section>
          <h2 className="section-title">Giới thiệu</h2>
          <p className="prose-plain">{story.description}</p>
        </section>
      )}

      <section>
        <div className="row">
          <h2 className="section-title">Danh sách chương</h2>
          <button className="btn ghost small" onClick={() => setDesc(!desc)}>
            {desc ? "↑ Cũ nhất" : "↓ Mới nhất"}
          </button>
        </div>
        {chapters.length === 0 && <p className="muted">Chưa có chương nào.</p>}
        <ol className="chapter-list">
          {chapters.map((c) => (
            <li key={c.n} className={progress === c.n ? "current" : ""}>
              <Link href={`/doc/?id=${story.slug}&ch=${c.n}`}>
                <span>{c.title}</span>
                <span className="muted small">{formatDate(c.date)}</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

export default function Page() {
  return (
    <Protected>
      <Suspense>
        <StoryView />
      </Suspense>
    </Protected>
  );
}
