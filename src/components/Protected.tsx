"use client";

import { useAuth } from "@/lib/auth";
import Gate from "./Gate";

export default function Protected({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  if (status === "loading") return <p className="center muted">Đang tải...</p>;
  if (status === "locked") return <Gate />;
  return <>{children}</>;
}
