"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { deriveKey, exportKey, fetchDecrypted, importKey } from "./crypto";

const STORAGE_KEY = "readaholic:key";

type AuthState = {
  status: "loading" | "locked" | "unlocked";
  key: CryptoKey | null;
  unlock: (code: string) => Promise<boolean>;
  lock: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("loading");

  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const k = await importKey(raw);
          // Kiểm tra khoá còn đúng không (mã có thể đã bị đổi khi deploy lại)
          await fetchDecrypted(k, "index.json");
          setKey(k);
          setStatus("unlocked");
          return;
        }
      } catch {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
      }
      setStatus("locked");
    })();
  }, []);

  const unlock = useCallback(async (code: string) => {
    try {
      const k = await deriveKey(code);
      await fetchDecrypted(k, "index.json");
      try {
        localStorage.setItem(STORAGE_KEY, await exportKey(k));
      } catch {}
      setKey(k);
      setStatus("unlocked");
      return true;
    } catch {
      return false;
    }
  }, []);

  const lock = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setKey(null);
    setStatus("locked");
  }, []);

  return <AuthContext.Provider value={{ status, key, unlock, lock }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải nằm trong AuthProvider");
  return ctx;
}
