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

function encrypt(obj, k = key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final(), cipher.getAuthTag()]);
  return JSON.stringify({ iv: iv.toString("base64"), data: data.toString("base64") });
}

function decrypt(text, file) {
  try {
    const { iv, data } = JSON.parse(text);
    const buf = Buffer.from(data, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(buf.subarray(-16));
    return JSON.parse(Buffer.concat([decipher.update(buf.subarray(0, -16)), decipher.final()]).toString("utf8"));
  } catch {
    console.error(`✗ Không giải mã được ${path.relative(ROOT, file)}.`);
    console.error("  File này được mã hoá bằng mã bí mật khác. Nếu vừa đổi ACCESS_CODE, chạy: npm run reencrypt -- <mã-cũ> <mã-mới>");
    process.exit(1);
  }
}

function readEncrypted(file) {
  return decrypt(fs.readFileSync(file, "utf8"), file);
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
  // Truyện tạo trên web được lưu mã hoá (*.enc.json); truyện viết tay dùng file thường
  const encMeta = path.join(dir, "story.enc.json");
  const metaFile = path.join(dir, "story.json");
  let meta;
  if (fs.existsSync(encMeta)) meta = readEncrypted(encMeta);
  else if (fs.existsSync(metaFile)) meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  else {
    console.warn(`⚠ Bỏ qua "${slug}": thiếu story.json`);
    continue;
  }
  if (meta.draft) continue;

  const chapterDir = path.join(dir, "chapters");
  const files = fs.existsSync(chapterDir)
    ? fs.readdirSync(chapterDir).filter((f) => f.endsWith(".md") || f.endsWith(".enc.json")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];

  const chapters = [];
  for (const file of files) {
    const full = path.join(chapterDir, file);
    let data, content;
    if (file.endsWith(".enc.json")) {
      ({ content, ...data } = readEncrypted(full));
    } else {
      ({ data, content } = matter(fs.readFileSync(full, "utf8")));
    }
    if (data.draft) continue;
    const n = chapters.length + 1;
    const mtime = fs.statSync(full).mtime.toISOString().slice(0, 10);
    const chapter = {
      n,
      title: data.title || `Chương ${n}`,
      date: toDate(data.date, mtime),
      words: countWords(content),
    };
    chapters.push(chapter);
    write(`s/${slug}/${n}.json`, { ...chapter, html: marked.parse(content) });
  }

  const encCover = path.join(dir, "cover.enc.json");
  const cover = fs.existsSync(encCover)
    ? encCover
    : Object.keys(MIME).map((ext) => path.join(dir, "cover" + ext)).find((f) => fs.existsSync(f));
  if (cover === encCover) {
    write(`c/${slug}.json`, readEncrypted(encCover));
  } else if (cover) {
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
// Token GitHub cho trang quản lý: mã hoá bằng mật khẩu quản lý (ADMIN_PASSWORD),
// rồi bọc thêm một lớp bằng mã đọc truyện như mọi dữ liệu khác.
const ADMIN_ITERATIONS = 600000; // Phải khớp với src/lib/crypto.ts
if (process.env.ADMIN_TOKEN && process.env.ADMIN_PASSWORD) {
  const salt = crypto.randomBytes(16);
  const adminKey = crypto.pbkdf2Sync(process.env.ADMIN_PASSWORD, salt, ADMIN_ITERATIONS, 32, "sha256");
  const inner = JSON.parse(encrypt({ token: process.env.ADMIN_TOKEN.trim() }, adminKey));
  write("admin.json", { ...inner, salt: salt.toString("base64"), iterations: ADMIN_ITERATIONS });
  console.log("✓ Đã đóng gói token quản lý (mở bằng mật khẩu quản lý)");
} else if (process.env.ADMIN_TOKEN || process.env.ADMIN_PASSWORD) {
  console.warn("⚠ Cần đặt cả ADMIN_TOKEN và ADMIN_PASSWORD thì mới dùng được đăng nhập bằng mật khẩu quản lý.");
}

fs.writeFileSync(path.join(OUT, "salt.json"), JSON.stringify({ salt: site.salt, iterations: PBKDF2_ITERATIONS }));
console.log(`✓ Đã mã hoá ${index.length} truyện vào public/data/`);
