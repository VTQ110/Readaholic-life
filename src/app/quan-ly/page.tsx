"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AdminProvider, { SavedNotice, useAdmin } from "@/components/admin/AdminProvider";
import { STATUS_LABEL } from "@/components/format";
import type { SourceStory } from "@/lib/content";

function StoryList() {
  const { store } = useAdmin();
  const saved = useSearchParams().has("saved");
  const [stories, setStories] = useState<SourceStory[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    store
      .listStories()
      .then((s) => setStories(s.sort((a, b) => a.meta.title.localeCompare(b.meta.title, "vi"))))
      .catch((e) => setError(e.message));
  }, [store]);

  return (
    <>
      {saved && <SavedNotice />}
      <div className="row">
        <h1>Quản lý truyện</h1>
        <span className="actions">
          <Link className="btn" href="/quan-ly/nhap-epub/">
            ⬆ Nhập từ EPUB
          </Link>
          <Link className="btn primary" href="/quan-ly/truyen/">
            + Truyện mới
          </Link>
        </span>
      </div>
      {error && <p className="error">{error}</p>}
      {!stories && !error && <p className="muted">Đang tải từ GitHub...</p>}
      {stories?.length === 0 && <p className="muted">Chưa có truyện nào. Bấm “Truyện mới” để bắt đầu.</p>}
      <ul className="admin-list">
        {stories?.map((s) => (
          <li key={s.slug}>
            <Link href={`/quan-ly/truyen/?id=${s.slug}`}>
              <strong>{s.meta.title}</strong>
              <span className="small muted">
                {STATUS_LABEL[s.meta.status]} · {s.chapters.length} chương
                {s.meta.draft && " · Đang ẩn"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Page() {
  return (
    <AdminProvider>
      <Suspense>
        <StoryList />
      </Suspense>
    </AdminProvider>
  );
}
