// Ghi nhớ chương đang đọc dở trên trình duyệt của người đọc
const k = (slug: string) => `readaholic:progress:${slug}`;

export function getProgress(slug: string): number | null {
  try {
    const v = Number(localStorage.getItem(k(slug)));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function setProgress(slug: string, n: number) {
  try {
    localStorage.setItem(k(slug), String(n));
  } catch {}
}
