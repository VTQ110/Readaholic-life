// Mã hoá lại các file *.enc.json trong content/ khi đổi mã bí mật:
// npm run reencrypt -- <mã-cũ> <mã-mới>
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [oldCode, newCode] = process.argv.slice(2);
if (!oldCode || !newCode) {
  console.error("Cách dùng: npm run reencrypt -- <mã-cũ> <mã-mới>");
  process.exit(1);
}

const CONTENT = path.join(process.cwd(), "content");
const { salt } = JSON.parse(fs.readFileSync(path.join(CONTENT, "site.json"), "utf8"));
// Phải khớp với scripts/build-data.mjs
const derive = (code) => crypto.pbkdf2Sync(code, salt, 250000, 32, "sha256");
const oldKey = derive(oldCode);
const newKey = derive(newCode);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".enc.json")) yield p;
  }
}

let count = 0;
for (const file of walk(CONTENT)) {
  const { iv, data } = JSON.parse(fs.readFileSync(file, "utf8"));
  const buf = Buffer.from(data, "base64");
  let plain;
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", oldKey, Buffer.from(iv, "base64"));
    d.setAuthTag(buf.subarray(-16));
    plain = Buffer.concat([d.update(buf.subarray(0, -16)), d.final()]);
  } catch {
    console.error(`✗ Mã cũ không đúng với ${path.relative(process.cwd(), file)}`);
    process.exit(1);
  }
  const newIv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", newKey, newIv);
  const out = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  fs.writeFileSync(file, JSON.stringify({ iv: newIv.toString("base64"), data: out.toString("base64") }));
  count++;
}
console.log(`✓ Đã mã hoá lại ${count} file. Nhớ đổi secret ACCESS_CODE trên GitHub thành mã mới rồi commit + push.`);
