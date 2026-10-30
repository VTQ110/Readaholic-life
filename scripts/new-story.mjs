// Tạo truyện mới: npm run new-story -- "Tên truyện"
import fs from "node:fs";
import path from "node:path";

const title = process.argv.slice(2).join(" ").trim();
if (!title) {
  console.error('Cách dùng: npm run new-story -- "Tên truyện"');
  process.exit(1);
}

const slug = title
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .replace(/đ/g, "d")
  .replace(/Đ/g, "D")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const dir = path.join(process.cwd(), "content", "stories", slug);
if (fs.existsSync(dir)) {
  console.error(`✗ Truyện "${slug}" đã tồn tại.`);
  process.exit(1);
}

fs.mkdirSync(path.join(dir, "chapters"), { recursive: true });
const story = {
  title,
  author: "",
  description: "",
  status: "ongoing",
  tags: [],
  created: new Date().toISOString().slice(0, 10),
};
fs.writeFileSync(path.join(dir, "story.json"), JSON.stringify(story, null, 2) + "\n");
console.log(`✓ Đã tạo content/stories/${slug}/`);
console.log(`  Thêm chương: npm run new-chapter -- ${slug} "Tên chương"`);
