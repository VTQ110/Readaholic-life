// Đọc truyện trong content/, chuyển Markdown → HTML, mã hoá bằng mã bí mật
// rồi ghi ra public/data/. Trang web chỉ giải mã được khi người đọc nhập đúng mã.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import matter from "gray-matter";
import { marked } from "marked";

const ROOT = process.cwd();
const CONTENT = path.join(ROOT, "content");
const STORIES = path.join(CONTENT, "stories");
const OUT = path.join(ROOT, "public", "data");

// Phải khớp với src/lib/crypto.ts
const PBKDF2_ITERATIONS = 250000;

for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(path.join(ROOT, f))) process.loadEnvFile(path.join(ROOT, f));
}

let code = process.env.ACCESS_CODE;
if (!code) {
  if (process.env.CI) {
    console.error("✗ Thiếu biến môi trường ACCESS_CODE (hãy tạo secret ACCESS_CODE trên GitHub).");
    process.exit(1);
  }
  code = "123456";
  console.warn("⚠ Chưa đặt ACCESS_CODE, dùng mã mặc định 123456 (chỉ nên dùng khi chạy thử).");
}

const site = JSON.parse(fs.readFileSync(path.join(CONTENT, "site.json"), "utf8"));
const key = crypto.pbkdf2Sync(code, site.salt, PBKDF2_ITERATIONS, 32, "sha256");

function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({ iv: iv.toString("base64"), data: data.toString("base64") });
}

function write(rel, obj) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encrypt(obj));
}

function toDate(v, fallback) {
  if (!v) return fallback;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d) ? fallback : d.toISOString().slice(0, 10);
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const index = [];
const slugs = fs.existsSync(STORIES)
  ? fs.readdirSync(STORIES).filter((d) => fs.statSync(path.join(STORIES, d)).isDirectory())
  : [];

for (const slug of slugs) {
  const dir = path.join(STORIES, slug);
  const metaFile = path.join(dir, "story.json");
  if (!fs.existsSync(metaFile)) {
    console.warn(`⚠ Bỏ qua "${slug}": thiếu story.json`);
    continue;
  }
  const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  if (meta.draft) continue;

  const chapterDir = path.join(dir, "chapters");
  const files = fs.existsSync(chapterDir)
    ? fs.readdirSync(chapterDir).filter((f) => f.endsWith(".md")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];

  const chapters = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(chapterDir, file), "utf8");
    const { data, content } = matter(raw);
    if (data.draft) continue;
    const n = chapters.length + 1;
    const mtime = fs.statSync(path.join(chapterDir, file)).mtime.toISOString().slice(0, 10);
    const chapter = {
      n,
      title: data.title || `Chương ${n}`,
      date: toDate(data.date, mtime),
      words: countWords(content),
    };
    chapters.push(chapter);
    write(`s/${slug}/${n}.json`, { ...chapter, html: marked.parse(content) });
  }

  const cover = Object.keys(MIME).map((ext) => path.join(dir, "cover" + ext)).find((f) => fs.existsSync(f));
  if (cover) {
    const b64 = fs.readFileSync(cover).toString("base64");
    write(`c/${slug}.json`, { src: `data:${MIME[path.extname(cover)]};base64,${b64}` });
  }

  const story = {
    slug,
    title: meta.title || slug,
    author: meta.author || "",
    description: meta.description || "",
    status: meta.status === "completed" ? "completed" : "ongoing",
    tags: meta.tags || [],
    hasCover: Boolean(cover),
    chapterCount: chapters.length,
    words: chapters.reduce((s, c) => s + c.words, 0),
    updatedAt: chapters.reduce((m, c) => (c.date > m ? c.date : m), toDate(meta.created, "")),
    latest: chapters.at(-1) ? { n: chapters.at(-1).n, title: chapters.at(-1).title } : null,
  };
  write(`s/${slug}.json`, { ...story, chapters });
  index.push(story);
  console.log(`✓ ${story.title}: ${chapters.length} chương`);
}

index.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
write("index.json", { title: site.title, description: site.description, stories: index });
fs.writeFileSync(path.join(OUT, "salt.json"), JSON.stringify({ salt: site.salt, iterations: PBKDF2_ITERATIONS }));
console.log(`✓ Đã mã hoá ${index.length} truyện vào public/data/`);
