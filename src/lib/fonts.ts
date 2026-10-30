// Phông chữ cho phần nội dung khi đọc truyện.
// Bookerly và Caecilia là phông bản quyền: dùng bản đã cài trên máy người đọc, hoặc file
// đặt trong public/fonts/ (xem README); không có thì rơi về phông thay thế gần giống.
export const READER_FONTS = [
  { id: "default", label: "Mặc định", family: "inherit" },
  { id: "bookerly", label: "Bookerly", family: '"Bookerly", Georgia, "Noto Serif", serif' },
  { id: "caecilia", label: "Caecilia", family: '"Caecilia", "PMN Caecilia", "Caecilia LT Std", "Roboto Slab", serif' },
  { id: "literata", label: "Literata", family: '"Literata", Georgia, serif' },
] as const;

export type ReaderFontId = (typeof READER_FONTS)[number]["id"];

export function fontFamily(id: string | null) {
  return (READER_FONTS.find((f) => f.id === id) ?? READER_FONTS[0]).family;
}
