import { Result, type UnhandledException } from "better-result";
import { InvalidSessionPayloadError } from "../errors";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encodeSession(payload: unknown, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decodeSession<T>(payload: string, secret: string): Promise<T> {
  const result = await decodeSessionResult<T>(payload, secret);
  return Result.unwrap(result);
}

export async function decodeSessionResult<T>(
  payload: string,
  secret: string,
): Promise<Result<T, InvalidSessionPayloadError | UnhandledException>> {
  const [ivB64, bodyB64] = payload.split(".");
  if (!ivB64 || !bodyB64) return Result.err(new InvalidSessionPayloadError({ payload }));
  const iv = base64ToBytes(ivB64);
  const body = base64ToBytes(bodyB64);
  return Result.tryPromise(async () => {
    const key = await deriveKey(secret);
    const ciphertext = new Uint8Array(body);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(decrypted)) as T;
  });
}
