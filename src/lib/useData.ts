"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./auth";
import { fetchDecrypted } from "./crypto";

export function useData<T>(file: string | null) {
  const { key } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key || !file) return;
    let cancelled = false;
    setData(null);
    setError(null);
    fetchDecrypted<T>(key, file)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [key, file]);

  return { data, error };
}
