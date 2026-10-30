"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Protected from "@/components/Protected";
import { formatDate, formatNumber } from "@/components/format";
import { useData } from "@/lib/useData";
import { setProgress } from "@/lib/progress";
import type { Chapter, Story } from "@/lib/types";

const FONT_KEY = "readaholic:font";

function Reader() {
  const params = useSearchParams();
  const router = useRouter();
  const slug = params.get("id");
  const n = Number(params.get("ch")) || 1;

  const { data: story } = useData<Story>(slug ? `s/${slug}.json` : null);
  const { data: chapter, error } = useData<Chapter>(slug ? `s/${slug}/${n}.json` : null);
  const [font, setFont] = useState(19);

  useEffect(() => {
    try {
      const f = Number(localStorage.getItem(FONT_KEY));
      if (f) setFont(f);
    } catch {}
  }, []);

  function changeFont(delta: number) {
    const f = Math.min(30, Math.max(14, font + delta));
    setFont(f);
    try {
      localStorage.setItem(FONT_KEY, String(f));
    } catch {}
  }

  const total = story?.chapterCount ?? 0;
  const prev = n > 1 ? `/doc/?id=${slug}&ch=${n - 1}` : null;
  const next = n < total ? `/doc/?id=${slug}&ch=${n + 1}` : null;

  useEffect(() => {
    if (slug && chapter) {
      setProgress(slug, n);
      window.scrollTo(0, 0);
    }
  }, [slug, n, chapter]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
      if (e.key === "ArrowLeft" && prev) router.push(prev);
      if (e.key === "ArrowRight" && next) router.push(next);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);

  if (!slug || error) return <p className="center error">Không tìm thấy chương này.</p>;

  const nav = (
    <nav className="chapter-nav">
      {prev ? (
        <Link className="btn" href={prev}>
          ← Trước
        </Link>
      ) : (
        <span className="btn disabled">← Trước</span>
      )}
      {story && total > 0 ? (
        <select
          value={n}
          onChange={(e) => router.push(`/doc/?id=${slug}&ch=${e.target.value}`)}
          aria-label="Chọn chương"
        >
          {story.chapters.map((c) => (
            <option key={c.n} value={c.n}>
              {c.title}
            </option>
          ))}
        </select>
      ) : (
        <Link className="btn" href={`/truyen/?id=${slug}`}>
          Mục lục
        </Link>
      )}
      {next ? (
        <Link className="btn" href={next}>
          Sau →
        </Link>
      ) : (
        <span className="btn disabled">Sau →</span>
      )}
    </nav>
  );

  return (
    <article className="reader">
      <p className="breadcrumb">
        <Link href="/">Trang chủ</Link> / <Link href={`/truyen/?id=${slug}`}>{story?.title ?? "..."}</Link>
      </p>
      {chapter ? (
        <>
          <header className="chapter-head">
            <h1>{chapter.title}</h1>
            <p className="muted small">
              {formatDate(chapter.date)} · {formatNumber(chapter.words)} chữ
            </p>
            <div className="font-tools">
              <button className="btn ghost small" onClick={() => changeFont(-1)} aria-label="Giảm cỡ chữ">
                A−
              </button>
              <span className="small muted">{font}px</span>
              <button className="btn ghost small" onClick={() => changeFont(1)} aria-label="Tăng cỡ chữ">
                A+
              </button>
            </div>
          </header>
          {nav}
          <div className="prose" style={{ fontSize: font }} dangerouslySetInnerHTML={{ __html: chapter.html }} />
          {nav}
          {!next && story?.status === "ongoing" && (
            <p className="center muted">Bạn đã đọc tới chương mới nhất. Chờ chương sau nhé!</p>
          )}
        </>
      ) : (
        <p className="center muted">Đang tải...</p>
      )}
    </article>
  );
}

export default function Page() {
  return (
    <Protected>
      <Suspense>
        <Reader />
      </Suspense>
    </Protected>
  );
}
