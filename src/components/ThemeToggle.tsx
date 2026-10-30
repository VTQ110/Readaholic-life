"use client";

import { useEffect, useState } from "react";

const THEMES = ["light", "sepia", "dark"] as const;
type Theme = (typeof THEMES)[number];
const ICON: Record<Theme, string> = { light: "☀️", sepia: "📜", dark: "🌙" };

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const t = document.documentElement.dataset.theme as Theme | undefined;
    setTheme(t && THEMES.includes(t) ? t : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  function next() {
    const t = THEMES[(THEMES.indexOf(theme ?? "light") + 1) % THEMES.length];
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("readaholic:theme", t);
    } catch {}
    setTheme(t);
  }

  return (
    <button className="btn ghost small" onClick={next} title="Đổi giao diện" aria-label="Đổi giao diện">
      {theme ? ICON[theme] : "☀️"}
    </button>
  );
}
