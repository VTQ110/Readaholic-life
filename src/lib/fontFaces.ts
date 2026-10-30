// Chạy lúc build: tạo @font-face cho các file phông có trong public/fonts/
// Tên file: <Bookerly|Caecilia>-<Regular|Italic|Bold|BoldItalic>.<woff2|woff|ttf|otf>
import fs from "node:fs";
import path from "node:path";

const STYLES: Record<string, { weight: number; style: string }> = {
  Regular: { weight: 400, style: "normal" },
  Italic: { weight: 400, style: "italic" },
  Bold: { weight: 700, style: "normal" },
  BoldItalic: { weight: 700, style: "italic" },
};
const FORMAT: Record<string, string> = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };

export function fontFaceCss(basePath: string) {
  const dir = path.join(process.cwd(), "public", "fonts");
  if (!fs.existsSync(dir)) return "";
  return fs
    .readdirSync(dir)
    .map((file) => file.match(/^(Bookerly|Caecilia)-(Regular|Italic|Bold|BoldItalic)\.(woff2|woff|ttf|otf)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map(([file, family, variant, ext]) => {
      const { weight, style } = STYLES[variant];
      return `@font-face{font-family:"${family}";src:url("${basePath}/fonts/${file}") format("${FORMAT[ext]}");font-weight:${weight};font-style:${style};font-display:swap}`;
    })
    .join("\n");
}
