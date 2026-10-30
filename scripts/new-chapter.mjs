// Thêm chương mới: npm run new-chapter -- <slug-truyện> "Tên chương"
import fs from "node:fs";
import path from "node:path";

const [slug, ...rest] = process.argv.slice(2);
const dir = slug && path.join(process.cwd(), "content", "stories", slug, "chapters");
if (!slug || !fs.existsSync(path.dirname(dir))) {
  console.error('Cách dùng: npm run new-chapter -- <slug-truyện> "Tên chương"');
  process.exit(1);
}

fs.mkdirSync(dir, { recursive: true });
const n = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).length + 1;
const title = rest.join(" ").trim() || `Chương ${n}`;
const file = path.join(dir, `${String(n).padStart(3, "0")}.md`);
const today = new Date().toISOString().slice(0, 10);

fs.writeFileSync(file, `---\ntitle: "${title.replace(/"/g, '\\"')}"\ndate: ${today}\n---\n\nViết nội dung chương ở đây...\n`);
console.log(`✓ Đã tạo ${path.relative(process.cwd(), file)}`);
