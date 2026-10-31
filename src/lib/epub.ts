// Đọc file EPUB ngay trên trình duyệt: lấy thông tin truyện, ảnh bìa và tách chương theo mục lục.
import { unzipSync } from "fflate";

/** front: phần nằm trước chương đầu tiên của mục lục (bìa, bản quyền, lời tựa...). */
export type EpubChapter = { title: string; content: string; words: number; source: string; front: boolean };

export type EpubBook = {
  title: string;
  author: string;
  description: string;
  tags: string[];
  cover: Blob | null;
  chapters: EpubChapter[];
};

type TocEntry = { title: string; file: string; fragment: string };

const decoder = new TextDecoder();

function dirname(p: string) {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i + 1);
}

/** Ghép đường dẫn tương đối trong EPUB (có thể chứa ../ và mã %XX). */
function resolve(base: string, href: string) {
  const [path, fragment = ""] = href.split("#");
  const parts = (dirname(base) + decodeURIComponent(path)).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== "." && p !== "") out.push(p);
  }
  return { file: out.join("/"), fragment: decodeURIComponent(fragment) };
}

function parseXml(text: string, type: DOMParserSupportedType = "application/xml") {
  const doc = new DOMParser().parseFromString(text, type);
  if (type !== "text/html" && doc.getElementsByTagName("parsererror").length) {
    return new DOMParser().parseFromString(text, "text/html");
  }
  return doc;
}

// getElementsByTagNameNS("*", ...) để không phụ thuộc tiền tố namespace (dc:, opf:...)
function byTag(root: Document | Element, name: string) {
  return [...root.getElementsByTagNameNS("*", name)];
}

function text(el: Element | undefined | null) {
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

function stripHtml(s: string) {
  if (!/[<&]/.test(s)) return s.trim();
  const body = new DOMParser().parseFromString(s, "text/html").body;
  body.querySelectorAll("p, br, div, li").forEach((el) => el.append("\n"));
  return (body.textContent ?? "").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

// ---- HTML → Markdown -------------------------------------------------------

function escapeInline(s: string) {
  return s.replace(/([\\`*_[\]])/g, "\\$1");
}

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeInline((node.textContent ?? "").replace(/\s+/g, " "));
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as Element;
  const tag = el.localName.toLowerCase();
  // Dấu "\" cuối dòng là xuống dòng trong Markdown, không bị mất khi dọn khoảng trắng như hai dấu cách
  if (tag === "br") return "\\\n";
  if (["img", "svg", "script", "style", "image"].includes(tag)) return "";
  const inner = [...el.childNodes].map(inline).join("");
  const style = (el.getAttribute("style") ?? "") + " " + (el.getAttribute("class") ?? "");
  const wrap = (mark: string) => {
    const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner;
  };
  if (tag === "strong" || tag === "b" || /font-weight:\s*(bold|[6-9]00)/i.test(style)) return wrap("**");
  if (tag === "em" || tag === "i" || tag === "cite" || /font-style:\s*italic/i.test(style)) return wrap("*");
  return inner;
}

const BLOCK = new Set([
  "p", "div", "section", "article", "blockquote", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
  "hr", "pre", "table", "figure", "header", "footer", "aside", "main", "body", "dl", "dt", "dd",
]);

function blocks(el: Element, out: string[]) {
  let buffer = "";
  const flush = () => {
    const t = buffer.replace(/^[ \t]+|[ \t]+$/gm, "").trim();
    if (t) out.push(t.replace(/^([#>+-]|\d+\.)/gm, "\\$1"));
    buffer = "";
  };
  for (const child of el.childNodes) {
    const tag = child.nodeType === Node.ELEMENT_NODE ? (child as Element).localName.toLowerCase() : "";
    if (!BLOCK.has(tag)) {
      buffer += inline(child);
      continue;
    }
    flush();
    const c = child as Element;
    if (tag === "hr") out.push("---");
    else if (/^h[1-6]$/.test(tag)) {
      const t = inline(c).trim();
      if (t) out.push(`${"#".repeat(Math.min(6, Number(tag[1]) + 1))} ${t}`);
    } else if (tag === "blockquote") {
      const inner: string[] = [];
      blocks(c, inner);
      if (inner.length) out.push(inner.map((b) => b.replace(/^/gm, "> ")).join("\n>\n"));
    } else if (tag === "ul" || tag === "ol") {
      const items = [...c.children].filter((li) => li.localName.toLowerCase() === "li");
      const lines = items.map((li, i) => `${tag === "ol" ? `${i + 1}.` : "-"} ${inline(li).trim()}`);
      if (lines.length) out.push(lines.join("\n"));
    } else if (tag === "pre") {
      out.push("```\n" + (c.textContent ?? "") + "\n```");
    } else blocks(c, out);
  }
  flush();
}

function toMarkdown(nodes: Node[]) {
  const holder = document.createElement("div");
  nodes.forEach((n) => holder.appendChild(n.cloneNode(true)));
  const out: string[] = [];
  blocks(holder, out);
  // Đoạn "* * *" hay "***" trong sách thường là dấu ngắt cảnh
  return out.map((b) => (/^(\\?[*#~•]\s*){3,}$/.test(b.replace(/\\/g, "")) ? "---" : b)).join("\n\n");
}

function countWords(md: string) {
  return md.replace(/[#*>\\_`-]/g, " ").split(/\s+/).filter(Boolean).length;
}

// ---- Mục lục ---------------------------------------------------------------

function readNav(files: Record<string, Uint8Array>, path: string): TocEntry[] {
  const doc = parseXml(decoder.decode(files[path]), "application/xhtml+xml");
  const nav =
    byTag(doc, "nav").find((n) => /toc/.test(n.getAttributeNS("http://www.idpf.org/2007/ops", "type") ?? n.getAttribute("epub:type") ?? "")) ??
    byTag(doc, "nav")[0];
  if (!nav) return [];
  return byTag(nav, "a")
    .filter((a) => a.getAttribute("href"))
    .map((a) => ({ title: text(a), ...resolve(path, a.getAttribute("href")!) }));
}

function readNcx(files: Record<string, Uint8Array>, path: string): TocEntry[] {
  const doc = parseXml(decoder.decode(files[path]));
  return byTag(doc, "navPoint")
    .map((p) => {
      const label = byTag(p, "navLabel")[0];
      const src = byTag(p, "content")[0]?.getAttribute("src");
      return src ? { title: text(byTag(label ?? p, "text")[0] ?? label), ...resolve(path, src) } : null;
    })
    .filter((e): e is TocEntry => e !== null);
}

// ---- Chính -----------------------------------------------------------------

function bodyOf(files: Record<string, Uint8Array>, path: string) {
  const raw = files[path];
  if (!raw) return null;
  const doc = parseXml(decoder.decode(raw), "application/xhtml+xml");
  return (byTag(doc, "body")[0] as Element | undefined) ?? null;
}

/** Các phần tử con "thật" của body: bỏ qua các lớp div bọc ngoài chỉ có một con. */
function topNodes(body: Element): Node[] {
  let el = body;
  for (;;) {
    const kids = [...el.childNodes].filter((n) => n.nodeType === Node.ELEMENT_NODE || (n.textContent ?? "").trim());
    if (kids.length === 1 && kids[0].nodeType === Node.ELEMENT_NODE && ["div", "section", "article", "main"].includes((kids[0] as Element).localName)) {
      el = kids[0] as Element;
    } else return [...el.childNodes];
  }
}

function containsId(node: Node, id: string) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node as Element;
  return el.getAttribute("id") === id || Boolean(el.querySelector(`[id="${CSS.escape(id)}"]`));
}

/** Bỏ tiêu đề đầu chương nếu trùng tên chương (trang đọc đã hiện tên chương rồi). */
function dropLeadingTitle(md: string, title: string) {
  const norm = (s: string) => s.replace(/[\\#*_\s]/g, "").toLowerCase();
  const lines = md.split("\n\n");
  if (lines.length && norm(lines[0]) === norm(title)) lines.shift();
  return lines.join("\n\n");
}

function firstHeading(nodes: Node[]) {
  for (const n of nodes) {
    if (n.nodeType !== Node.ELEMENT_NODE) continue;
    const el = n as Element;
    const h = /^h[1-6]$/i.test(el.localName) ? el : el.querySelector("h1, h2, h3");
    if (h && text(h)) return text(h);
  }
  return "";
}

export async function parseEpub(file: File): Promise<EpubBook> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("Không đọc được file. Hãy chắc chắn đây là file .epub hợp lệ.");
  }
  // Một số EPUB lưu tên file khác hoa/thường so với khai báo trong OPF
  const lower: Record<string, string> = {};
  for (const k of Object.keys(files)) lower[k.toLowerCase()] = k;
  const get = (p: string) => files[p] ?? files[lower[p.toLowerCase()]];
  const real = (p: string) => (files[p] ? p : (lower[p.toLowerCase()] ?? p));

  const container = get("META-INF/container.xml");
  if (!container) throw new Error("File EPUB thiếu META-INF/container.xml.");
  const opfPath = real(byTag(parseXml(decoder.decode(container)), "rootfile")[0]?.getAttribute("full-path") ?? "");
  if (!get(opfPath)) throw new Error("Không tìm thấy file mô tả sách (OPF) trong EPUB.");
  const opf = parseXml(decoder.decode(get(opfPath)));

  const meta = byTag(opf, "metadata")[0] ?? opf.documentElement;
  const manifest = new Map(
    byTag(opf, "item").map((i) => [
      i.getAttribute("id") ?? "",
      {
        path: real(resolve(opfPath, i.getAttribute("href") ?? "").file),
        type: i.getAttribute("media-type") ?? "",
        props: i.getAttribute("properties") ?? "",
      },
    ]),
  );

  // Ảnh bìa: EPUB 3 dùng properties="cover-image", EPUB 2 dùng <meta name="cover">
  const coverId = byTag(meta, "meta").find((m) => m.getAttribute("name") === "cover")?.getAttribute("content");
  const coverItem =
    [...manifest.values()].find((i) => i.props.split(/\s+/).includes("cover-image")) ??
    (coverId ? manifest.get(coverId) : undefined) ??
    [...manifest.values()].find((i) => i.type.startsWith("image/") && /cover/i.test(i.path));
  const coverBytes = coverItem ? get(coverItem.path) : undefined;
  const cover = coverItem && coverBytes ? new Blob([coverBytes as BlobPart], { type: coverItem.type || "image/jpeg" }) : null;

  // Mục lục: ưu tiên nav (EPUB 3), sau đó toc.ncx (EPUB 2)
  const navItem = [...manifest.values()].find((i) => i.props.split(/\s+/).includes("nav"));
  const ncxItem = [...manifest.values()].find((i) => i.type === "application/x-dtbncx+xml");
  let toc: TocEntry[] = [];
  try {
    if (navItem && get(navItem.path)) toc = readNav(files, navItem.path);
    if (!toc.length && ncxItem && get(ncxItem.path)) toc = readNcx(files, ncxItem.path);
  } catch {
    toc = [];
  }
  const seen = new Set<string>();
  toc = toc
    .map((t) => ({ ...t, file: real(t.file) }))
    .filter((t) => {
      const k = `${t.file}#${t.fragment}`;
      return seen.has(k) ? false : (seen.add(k), true);
    });

  const spine = byTag(opf, "itemref")
    .filter((r) => r.getAttribute("linear") !== "no")
    .map((r) => manifest.get(r.getAttribute("idref") ?? ""))
    .filter((i): i is NonNullable<typeof i> => Boolean(i) && /html|xml/.test(i!.type) && !i!.props.includes("nav"))
    .map((i) => i.path);

  const chapters: { title: string; nodes: Node[]; source: string; front: boolean }[] = [];

  for (const path of spine) {
    const body = bodyOf(files, path);
    if (!body) continue;
    const nodes = topNodes(body);
    const entries = toc.filter((t) => t.file === path);

    if (!toc.length || (entries.length === 0 && chapters.length === 0)) {
      // Không có mục lục, hoặc phần mở đầu trước chương đầu tiên: mỗi file là một chương
      chapters.push({ title: firstHeading(nodes), nodes, source: path, front: toc.length > 0 });
    } else if (entries.length === 0) {
      // File không có trong mục lục: thường là phần tiếp theo của chương trước
      chapters.at(-1)!.nodes.push(...nodes);
    } else {
      // Một file có thể chứa nhiều chương, mỗi chương bắt đầu tại phần tử có id = #fragment
      type Draft = (typeof chapters)[number];
      const open = (e: TocEntry): Draft => {
        const c = { title: e.title, nodes: [] as Node[], source: path, front: false };
        chapters.push(c);
        return c;
      };
      let next = 0;
      let current: Draft | null = entries[0].fragment ? null : open(entries[next++]);
      for (const node of nodes) {
        let hit: TocEntry | null = null;
        while (next < entries.length && entries[next].fragment && containsId(node, entries[next].fragment)) hit = entries[next++];
        if (hit) current = open(hit);
        // Phần đứng trước mốc chương đầu tiên trong file thuộc về chương trước (nếu có)
        if (!current && !chapters.length) {
          current = open(entries[0]);
          next = Math.max(next, 1);
        }
        (current ?? chapters.at(-1)!).nodes.push(node);
      }
    }
  }

  const result = chapters
    .map((c, i) => {
      const title = c.title || (c.front ? "Phần mở đầu" : `Chương ${i + 1}`);
      const content = dropLeadingTitle(toMarkdown(c.nodes), title);
      return { title, content, words: countWords(content), source: c.source, front: c.front };
    })
    .filter((c) => c.content.trim() || c.title);

  return {
    title: text(byTag(meta, "title")[0]) || file.name.replace(/\.epub$/i, ""),
    author: byTag(meta, "creator").map(text).filter(Boolean).join(", "),
    description: stripHtml(byTag(meta, "description")[0]?.textContent ?? ""),
    tags: [...new Set(byTag(meta, "subject").map(text).filter(Boolean))],
    cover,
    chapters: result,
  };
}
