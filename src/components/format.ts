export function formatDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatNumber(n: number) {
  return n.toLocaleString("vi-VN");
}

export const STATUS_LABEL = { ongoing: "Đang ra", completed: "Hoàn thành" } as const;
