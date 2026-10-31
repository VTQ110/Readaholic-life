// Truyện gốc trong thư mục content/ của repo, dùng cho trang quản lý.
// File tạo từ web được mã hoá (*.enc.json) vì repo có thể công khai;
// file viết tay (.md, story.json, cover.jpg) vẫn đọc được và được chuyển sang dạng mã hoá khi lưu lại.
import { decryptJson, encryptJson } from "./crypto";
import type { DirEntry, FileChange, GitHub } from "./github";

export const STORIES_DIR = "content/stories";

export type StoryMeta = {
  title: string;
  author: string;
  description: string;
  status: "ongoing" | "completed";
  tags: string[];
  created: string;
  draft?: boolean;
};

export type ChapterSource = { title: string; date: string; draft: boolean; content: string };

export type SourceStory = {
  slug: string;
  meta: StoryMeta;
  files: DirEntry[];
  chapters: DirEntry[];
};

const IMAGE_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function slugify(title: string) {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isChapterFile(name: string) {
  return name.endsWith(".md") || name.endsWith(".enc.json");
}

function chapterNumber(name: string) {
  return parseInt(name, 10) || 0;
}

function unquote(v: string) {
  const t = v.trim();
  if (/^".*"$/.test(t)) {
    try {
      return JSON.parse(t);
    } catch {}
  }
  return t.replace(/^['"]|['"]$/g, "");
}

function parseMarkdown(text: string): ChapterSource {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const data: Record<string, string> = {};
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0) data[line.slice(0, i).trim()] = unquote(line.slice(i + 1));
    }
  }
  return {
    title: data.title || "",
    date: data.date || today(),
    draft: data.draft === "true",
    content: (m ? m[2] : text).trim(),
  };
}

// GitHub API đôi khi trả dữ liệu cũ ngay sau khi commit, nên nhớ tạm các truyện vừa sửa trong ít phút
const RECENT_MS = 3 * 60 * 1000;
const recent = new Map<string, { story: SourceStory | null; at: number }>();

function remember(slug: string, story: SourceStory | null) {
  recent.set(slug, { story, at: Date.now() });
}

function recall(slug: string) {
  const r = recent.get(slug);
  return r && Date.now() - r.at < RECENT_MS ? r : undefined;
}

function entry(path: string, sha: string): DirEntry {
  return { name: path.split("/").pop()!, path, sha, type: "file" };
}

function sortChapters(files: DirEntry[]) {
  return files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export class ContentStore {
  constructor(
    private gh: GitHub,
    private key: CryptoKey,
  ) {}

  async listStories(): Promise<SourceStory[]> {
    const slugs = new Set((await this.gh.list(STORIES_DIR)).filter((e) => e.type === "dir").map((d) => d.name));
    for (const [slug] of recent) if (recall(slug)) slugs.add(slug);
    const stories = await Promise.all([...slugs].map((slug) => this.loadStory(slug).catch(() => null)));
    return stories.filter((s): s is SourceStory => s !== null);
  }

  async loadStory(slug: string): Promise<SourceStory | null> {
    const cached = recall(slug);
    if (cached) return cached.story;
    const dir = `${STORIES_DIR}/${slug}`;
    const [files, chapterFiles] = await Promise.all([this.gh.list(dir), this.gh.list(`${dir}/chapters`)]);
    const metaFile = files.find((f) => f.name === "story.enc.json") ?? files.find((f) => f.name === "story.json");
    if (!metaFile) return null;
    const text = await this.gh.readText(metaFile.sha);
    const raw = metaFile.name === "story.json" ? JSON.parse(text) : await decryptJson<StoryMeta>(this.key, text);
    const meta: StoryMeta = {
      title: raw.title || slug,
      author: raw.author || "",
      description: raw.description || "",
      status: raw.status === "completed" ? "completed" : "ongoing",
      tags: raw.tags || [],
      created: raw.created || "",
      draft: Boolean(raw.draft),
    };
    const chapters = sortChapters(chapterFiles.filter((f) => f.type === "file" && isChapterFile(f.name)));
    return { slug, meta, files, chapters };
  }

  /** Tên thư mục chưa bị dùng cho một truyện mới. */
  async uniqueSlug(title: string) {
    const base = slugify(title) || `truyen-${Date.now()}`;
    const taken = new Set((await this.listStories()).map((s) => s.slug));
    let slug = base;
    for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
    return slug;
  }

  /** Tạo truyện mới cùng toàn bộ chương trong một commit (dùng khi nhập từ EPUB). */
  async importStory(meta: StoryMeta, cover: string | null, chapters: ChapterSource[], onProgress?: (done: number, total: number) => void) {
    const slug = await this.uniqueSlug(meta.title);
    const dir = `${STORIES_DIR}/${slug}`;
    const changes: FileChange[] = [{ path: `${dir}/story.enc.json`, content: await encryptJson(this.key, meta) }];
    if (cover) changes.push({ path: `${dir}/cover.enc.json`, content: await encryptJson(this.key, { src: cover }) });
    for (const [i, c] of chapters.entries()) {
      changes.push({ path: `${dir}/chapters/${String(i + 1).padStart(3, "0")}.enc.json`, content: await encryptJson(this.key, c) });
    }
    const shas = await this.gh.commit(changes, `Nhập truyện từ EPUB: ${meta.title} (${chapters.length} chương)`, onProgress);
    const all = Object.entries(shas).map(([p, sha]) => entry(p, sha));
    remember(slug, {
      slug,
      meta,
      files: all.filter((f) => !f.path.includes("/chapters/")),
      chapters: sortChapters(all.filter((f) => f.path.includes("/chapters/"))),
    });
    return slug;
  }

  async readCover(story: SourceStory): Promise<string | null> {
    const enc = story.files.find((f) => f.name === "cover.enc.json");
    if (enc) return (await decryptJson<{ src: string }>(this.key, await this.gh.readText(enc.sha))).src;
    const img = story.files.find((f) => /^cover\.(jpe?g|png|webp|gif)$/.test(f.name));
    if (!img) return null;
    return `data:${IMAGE_EXT[img.name.split(".").pop()!]};base64,${await this.gh.readBase64(img.sha)}`;
  }

  async readChapter(file: DirEntry): Promise<ChapterSource> {
    const text = await this.gh.readText(file.sha);
    if (file.name.endsWith(".md")) return parseMarkdown(text);
    return decryptJson<ChapterSource>(this.key, text);
  }

  /** cover: chuỗi data URL để đặt ảnh mới, null để xoá ảnh, undefined để giữ nguyên. */
  async saveStory(slug: string, meta: StoryMeta, cover: string | null | undefined, existing: SourceStory | null) {
    const dir = `${STORIES_DIR}/${slug}`;
    const changes: FileChange[] = [{ path: `${dir}/story.enc.json`, content: await encryptJson(this.key, meta) }];
    if (existing?.files.some((f) => f.name === "story.json")) changes.push({ path: `${dir}/story.json`, delete: true });
    if (cover !== undefined) {
      for (const f of existing?.files ?? []) {
        if (/^cover\./.test(f.name) && !(cover && f.name === "cover.enc.json")) changes.push({ path: f.path, delete: true });
      }
      if (cover) changes.push({ path: `${dir}/cover.enc.json`, content: await encryptJson(this.key, { src: cover }) });
    }
    const shas = await this.gh.commit(changes, `${existing ? "Sửa" : "Thêm"} truyện: ${meta.title}`);
    const deleted = new Set(changes.filter((c) => "delete" in c).map((c) => c.path));
    const files = (existing?.files ?? []).filter((f) => !deleted.has(f.path) && !(f.path in shas));
    const story = { slug, meta, files: [...files, ...Object.entries(shas).map(([p, sha]) => entry(p, sha))], chapters: existing?.chapters ?? [] };
    remember(slug, story);
    return story;
  }

  /** file: chương đang sửa, hoặc null để thêm chương mới vào cuối. */
  async saveChapter(story: SourceStory, file: DirEntry | null, chapter: ChapterSource) {
    const dir = `${STORIES_DIR}/${story.slug}/chapters`;
    const n = file ? chapterNumber(file.name) : Math.max(0, ...story.chapters.map((c) => chapterNumber(c.name))) + 1;
    const name = `${String(n).padStart(3, "0")}.enc.json`;
    const changes: FileChange[] = [{ path: `${dir}/${name}`, content: await encryptJson(this.key, chapter) }];
    if (file && file.name !== name) changes.push({ path: file.path, delete: true });
    const shas = await this.gh.commit(changes, `${file ? "Sửa" : "Thêm"} chương: ${story.meta.title} — ${chapter.title}`);
    const path = `${dir}/${name}`;
    const chapters = story.chapters.filter((c) => c.path !== path && c.path !== file?.path);
    remember(story.slug, { ...story, chapters: sortChapters([...chapters, entry(path, shas[path])]) });
  }

  async deleteChapter(story: SourceStory, file: DirEntry) {
    await this.gh.commit([{ path: file.path, delete: true }], `Xoá chương: ${story.meta.title} — ${file.name}`);
    const updated = { ...story, chapters: story.chapters.filter((c) => c.path !== file.path) };
    remember(story.slug, updated);
    return updated;
  }

  async deleteStory(story: SourceStory) {
    const paths = [...story.files.filter((f) => f.type === "file"), ...story.chapters].map((f) => f.path);
    await this.gh.commit(
      paths.map((path) => ({ path, delete: true as const })),
      `Xoá truyện: ${story.meta.title}`,
    );
    remember(story.slug, null);
  }
}
