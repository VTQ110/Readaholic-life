"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Protected from "@/components/Protected";
import Cover from "@/components/Cover";
import { formatDate, formatNumber, STATUS_LABEL } from "@/components/format";
import { useData } from "@/lib/useData";
import type { SiteIndex } from "@/lib/types";

// Bỏ dấu tiếng Việt để gõ "co gai" vẫn tìm được "Cô gái"
function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function Home() {
  const { data, error } = useData<SiteIndex>("index.json");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const q = params.get("q") ?? "";
  const tag = params.get("tag") ?? "";
  const status = params.get("status") ?? "";
  const filtering = Boolean(q || tag || status);

  // Lưu bộ lọc lên URL để tải lại trang hoặc gửi link vẫn giữ kết quả
  function setFilter(name: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const tags = useMemo(() => {
    const all = new Set<string>();
    data?.stories.forEach((s) => s.tags.forEach((t) => all.add(t)));
    return [...all].sort((a, b) => a.localeCompare(b, "vi"));
  }, [data]);

  const results = useMemo(() => {
    if (!data) return [];
    const needle = normalize(q);
    return data.stories.filter(
      (s) =>
        (!needle || normalize(s.title).includes(needle) || normalize(s.author).includes(needle)) &&
        (!tag || s.tags.includes(tag)) &&
        (!status || s.status === status),
    );
  }, [data, q, tag, status]);

  if (error) return <p className="error center">{error}</p>;
  if (!data) return <p className="center muted">Đang tải...</p>;

  const recent = data.stories.filter((s) => s.latest).slice(0, 5);

  return (
    <>
      <section className="hero">
        <h1>{data.title}</h1>
        {data.description && <p className="muted">{data.description}</p>}
      </section>

      <section className="search" role="search">
        <input
          type="search"
          placeholder="Tìm theo tên truyện hoặc tác giả..."
          value={q}
          onChange={(e) => setFilter("q", e.target.value)}
          aria-label="Tìm truyện"
        />
        <select value={tag} onChange={(e) => setFilter("tag", e.target.value)} aria-label="Thể loại">
          <option value="">Tất cả thể loại</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setFilter("status", e.target.value)} aria-label="Tình trạng">
          <option value="">Mọi tình trạng</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {filtering && (
          <button className="btn ghost small" onClick={() => router.replace(pathname, { scroll: false })}>
            Xoá lọc
          </button>
        )}
      </section>

      {!filtering && recent.length > 0 && (
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
        <h2 className="section-title">
          {filtering ? `Kết quả tìm kiếm (${results.length})` : `Tất cả truyện (${data.stories.length})`}
        </h2>
        {results.length === 0 && (
          <p className="muted">{filtering ? "Không có truyện nào phù hợp." : "Chưa có truyện nào."}</p>
        )}
        <div className="grid">
          {results.map((s) => (
            <Link key={s.slug} href={`/truyen/?id=${s.slug}`} className="card">
              <Cover slug={s.slug} title={s.title} hasCover={s.hasCover} />
              <div className="card-body">
                <h3>{s.title}</h3>
                {s.author && <p className="muted small">{s.author}</p>}
                <p className="small">
                  <span className={`badge ${s.status}`}>{STATUS_LABEL[s.status]}</span> {s.chapterCount} chương ·{" "}
                  {formatNumber(s.words)} chữ
                </p>
                {s.tags.length > 0 && <p className="muted small">{s.tags.join(" · ")}</p>}
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
      <Suspense>
        <Home />
      </Suspense>
    </Protected>
  );
}
