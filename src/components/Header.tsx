"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import ThemeToggle from "./ThemeToggle";

export default function Header({ title }: { title: string }) {
  const { status, lock } = useAuth();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link href="/" className="brand">
          📖 {title}
        </Link>
        <div className="header-actions">
          <ThemeToggle />
          {status === "unlocked" && (
            <button className="btn ghost small" onClick={lock}>
              Khoá
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
