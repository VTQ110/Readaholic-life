// Tạo file tải về (EPUB / TXT) ngay trên trình duyệt từ nội dung đã giải mã.
import { strToU8, zipSync, type Zippable } from "fflate";
import { b64ToBytes, fetchDecrypted } from "./crypto";
import type { Chapter, Story } from "./types";

export type Format = "epub" | "txt";

function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fileName(name: string, ext: string) {
  return `${name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "truyen"}.${ext}`;
}

function save(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function parseHtml(html: string) {
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
}

// HTML của marked chưa chắc hợp lệ XHTML (thẻ <br>, <hr>, &nbsp;...), nên chuyển qua XMLSerializer
function toXhtml(html: string) {
  const s = new XMLSerializer();
  return [...parseHtml(html).childNodes].map((n) => s.serializeToString(n)).join("\n");
}

function htmlToText(html: string) {
  const body = parseHtml(html);
  body.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  return [...body.children]
    .map((el) => (el.tagName === "HR" ? "* * *" : (el.textContent ?? "")))
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n\n");
}

function xhtmlPage(title: string, body: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="vi" xml:lang="vi">
<head><meta charset="utf-8"/><title>${xmlEscape(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>`;
}

const CSS = `body { font-family: serif; line-height: 1.6; margin: 0 5%; }
h1 { text-align: center; margin: 1.5em 0 1em; font-size: 1.5em; }
p { text-indent: 1.5em; margin: 0 0 0.6em; text-align: justify; }
hr { border: 0; text-align: center; margin: 1.5em 0; }
hr::after { content: "* * *"; }
blockquote { margin: 1em 1.5em; font-style: italic; }
.title-page { text-align: center; margin-top: 20%; }
.title-page p { text-indent: 0; text-align: center; }
.author { font-size: 1.2em; margin-top: 1em; }
.desc { margin-top: 2em; font-style: italic; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover img { max-width: 100%; max-height: 100%; }`;

type Book = { title: string; author: string; description: string; tags?: string[]; cover: string | null; chapters: Chapter[] };

function buildEpub(book: Book): Uint8Array {
  const id = `urn:uuid:${crypto.randomUUID()}`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const files: Zippable = {
    // "mimetype" phải là file đầu tiên và không nén
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    "OEBPS/style.css": strToU8(CSS),
  };

  const manifest: string[] = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `<item id="css" href="style.css" media-type="text/css"/>`,
    `<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>`,
  ];
  const spine: string[] = [];
  let coverMeta = "";

  if (book.cover) {
    const m = book.cover.match(/^data:(image\/[\w+.-]+);base64,(.*)$/);
    if (m) {
      const ext = m[1].split("/")[1].replace("jpeg", "jpg");
      files[`OEBPS/cover.${ext}`] = [b64ToBytes(m[2]), { level: 0 }];
      manifest.push(`<item id="cover-image" href="cover.${ext}" media-type="${m[1]}" properties="cover-image"/>`);
      manifest.push(`<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`);
      files["OEBPS/cover.xhtml"] = strToU8(
        xhtmlPage(book.title, `<div class="cover"><img src="cover.${ext}" alt="${xmlEscape(book.title)}"/></div>`),
      );
      spine.push(`<itemref idref="cover"/>`);
      coverMeta = `<meta name="cover" content="cover-image"/>`;
    }
  }

  files["OEBPS/title.xhtml"] = strToU8(
    xhtmlPage(
      book.title,
      `<div class="title-page"><h1>${xmlEscape(book.title)}</h1>` +
        (book.author ? `<p class="author">${xmlEscape(book.author)}</p>` : "") +
        (book.description
          ? book.description
              .split(/\n+/)
              .map((l) => `<p class="desc">${xmlEscape(l)}</p>`)
              .join("")
          : "") +
        `</div>`,
    ),
  );
  spine.push(`<itemref idref="title"/>`);

  book.chapters.forEach((c, i) => {
    const name = `chap${String(i + 1).padStart(4, "0")}.xhtml`;
    files[`OEBPS/${name}`] = strToU8(xhtmlPage(c.title, `<h1>${xmlEscape(c.title)}</h1>\n${toXhtml(c.html)}`));
    manifest.push(`<item id="c${i + 1}" href="${name}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="c${i + 1}"/>`);
  });

  const toc = book.chapters.map((c, i) => ({ title: c.title, href: `chap${String(i + 1).padStart(4, "0")}.xhtml` }));

  files["OEBPS/nav.xhtml"] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="vi" xml:lang="vi">
<head><meta charset="utf-8"/><title>Mục lục</title></head>
<body><nav epub:type="toc" id="toc"><h1>Mục lục</h1><ol>
${toc.map((t) => `<li><a href="${t.href}">${xmlEscape(t.title)}</a></li>`).join("\n")}
</ol></nav></body></html>`);

  files["OEBPS/toc.ncx"] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${id}"/></head>
<docTitle><text>${xmlEscape(book.title)}</text></docTitle>
<navMap>
${toc.map((t, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${xmlEscape(t.title)}</text></navLabel><content src="${t.href}"/></navPoint>`).join("\n")}
</navMap>
</ncx>`);

  files["OEBPS/content.opf"] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="vi">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${id}</dc:identifier>
<dc:title>${xmlEscape(book.title)}</dc:title>
${book.author ? `<dc:creator>${xmlEscape(book.author)}</dc:creator>` : ""}
<dc:language>vi</dc:language>
${book.description ? `<dc:description>${xmlEscape(book.description)}</dc:description>` : ""}
${(book.tags ?? []).map((t) => `<dc:subject>${xmlEscape(t)}</dc:subject>`).join("\n")}
<meta property="dcterms:modified">${modified}</meta>
${coverMeta}
</metadata>
<manifest>
${manifest.join("\n")}
</manifest>
<spine toc="ncx">
${spine.join("\n")}
</spine>
</package>`);

  return zipSync(files, { level: 6 });
}

function buildTxt(book: Book) {
  const head = [book.title, book.author && `Tác giả: ${book.author}`, book.description].filter(Boolean).join("\n\n");
  const body = book.chapters.map((c) => `${c.title}\n${"=".repeat(Math.min(c.title.length, 40))}\n\n${htmlToText(c.html)}`);
  return [head, ...body].join("\n\n\n");
}

function download(book: Book, name: string, format: Format) {
  if (format === "epub") save(buildEpub(book) as BlobPart, fileName(name, "epub"), "application/epub+zip");
  else save("﻿" + buildTxt(book), fileName(name, "txt"), "text/plain;charset=utf-8");
}

async function loadCover(key: CryptoKey, story: Story) {
  if (!story.hasCover) return null;
  try {
    return (await fetchDecrypted<{ src: string }>(key, `c/${story.slug}.json`)).src;
  } catch {
    return null;
  }
}

export function downloadChapter(story: Story, chapter: Chapter, format: Format) {
  const book: Book = {
    title: `${story.title} — ${chapter.title}`,
    author: story.author,
    description: "",
    cover: null,
    chapters: [chapter],
  };
  // TXT một chương thì không cần lặp lại tiêu đề truyện ở đầu
  if (format === "txt") book.title = story.title;
  download(book, `${story.title} - ${chapter.title}`, format);
}

export async function downloadStory(key: CryptoKey, story: Story, format: Format, onProgress?: (done: number) => void) {
  const chapters: Chapter[] = new Array(story.chapters.length);
  let done = 0;
  // Tải song song vài chương một lúc cho nhanh
  const queue = [...story.chapters.keys()];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        chapters[i] = await fetchDecrypted<Chapter>(key, `s/${story.slug}/${story.chapters[i].n}.json`);
        onProgress?.(++done);
      }
    }),
  );
  const cover = format === "epub" ? await loadCover(key, story) : null;
  download({ title: story.title, author: story.author, description: story.description, tags: story.tags, cover, chapters }, story.title, format);
}
