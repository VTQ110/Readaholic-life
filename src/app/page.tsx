"use client";

import Link from "next/link";
import Protected from "@/components/Protected";
import Cover from "@/components/Cover";
import { formatDate, formatNumber, STATUS_LABEL } from "@/components/format";
import { useData } from "@/lib/useData";
import type { SiteIndex } from "@/lib/types";

function Home() {
  const { data, error } = useData<SiteIndex>("index.json");
  if (error) return <p className="error center">{error}</p>;
  if (!data) return <p className="center muted">Đang tải...</p>;

  const recent = data.stories.filter((s) => s.latest).slice(0, 5);

  return (
    <>
      <section className="hero">
        <h1>{data.title}</h1>
        {data.description && <p className="muted">{data.description}</p>}
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="section-title">Mới cập nhật</h2>
          <ul className="updates">
            {recent.map((s) => (
              <li key={s.slug}>
                <Link href={`/doc/?id=${s.slug}&ch=${s.latest!.n}`}>
                  <strong>{s.title}</strong> — {s.latest!.title}
                </Link>
                <span className="muted small">{formatDate(s.updatedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="section-title">Tất cả truyện ({data.stories.length})</h2>
        {data.stories.length === 0 && <p className="muted">Chưa có truyện nào.</p>}
        <div className="grid">
          {data.stories.map((s) => (
            <Link key={s.slug} href={`/truyen/?id=${s.slug}`} className="card">
              <Cover slug={s.slug} title={s.title} hasCover={s.hasCover} />
              <div className="card-body">
                <h3>{s.title}</h3>
                {s.author && <p className="muted small">{s.author}</p>}
                <p className="small">
                  <span className={`badge ${s.status}`}>{STATUS_LABEL[s.status]}</span> {s.chapterCount} chương ·{" "}
                  {formatNumber(s.words)} chữ
                </p>
                {s.description && <p className="desc">{s.description}</p>}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

export default function Page() {
  return (
    <Protected>
      <Home />
    </Protected>
  );
}
