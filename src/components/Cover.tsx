"use client";

import { useData } from "@/lib/useData";

export default function Cover({ slug, title, hasCover }: { slug: string; title: string; hasCover: boolean }) {
  const { data } = useData<{ src: string }>(hasCover ? `c/${slug}.json` : null);
  if (data) return <img className="cover" src={data.src} alt={title} />;
  return (
    <div className="cover cover-placeholder" aria-hidden>
      {title.charAt(0).toUpperCase()}
    </div>
  );
}
