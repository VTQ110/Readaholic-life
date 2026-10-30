export type StorySummary = {
  slug: string;
  title: string;
  author: string;
  description: string;
  status: "ongoing" | "completed";
  tags: string[];
  hasCover: boolean;
  chapterCount: number;
  words: number;
  updatedAt: string;
  latest: { n: number; title: string } | null;
};

export type SiteIndex = { title: string; description: string; stories: StorySummary[] };

export type ChapterMeta = { n: number; title: string; date: string; words: number };

export type Story = StorySummary & { chapters: ChapterMeta[] };

export type Chapter = ChapterMeta & { html: string };
