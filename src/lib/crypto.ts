export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

type Encrypted = { iv: string; data: string };

export function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function bytesToB64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < arr.length; i += 0x8000) bin += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function deriveKey(code: string): Promise<CryptoKey> {
  const res = await fetch(`${BASE_PATH}/data/salt.json`, { cache: "no-store" });
  const { salt, iterations } = await res.json();
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function exportKey(key: CryptoKey): Promise<string> {
  return bytesToB64(await crypto.subtle.exportKey("raw", key));
}

export function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", b64ToBytes(raw), "AES-GCM", true, ["encrypt", "decrypt"]);
}

export async function encryptJson(key: CryptoKey, obj: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return JSON.stringify({ iv: bytesToB64(iv), data: bytesToB64(data) });
}

export async function decryptJson<T>(key: CryptoKey, text: string): Promise<T> {
  const { iv, data }: Encrypted = JSON.parse(text);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(iv) }, key, b64ToBytes(data));
  return JSON.parse(new TextDecoder().decode(plain));
}

export async function fetchDecrypted<T>(key: CryptoKey, file: string): Promise<T> {
  const res = await fetch(`${BASE_PATH}/data/${file}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Không tìm thấy dữ liệu (${res.status})`);
  return decryptJson<T>(key, await res.text());
}
