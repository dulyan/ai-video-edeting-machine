import { apiHeaders } from "../shared/http.ts";
export let backendURL = (
  localStorage.getItem("avem.backend") ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://127.0.0.1:3001" : "")
).replace(/\/$/, "");
let token = sessionStorage.getItem("avem.token") || "";
export function configureBackend(url: string, nextToken?: string) {
  backendURL = url.replace(/\/$/, "");
  localStorage.setItem("avem.backend", backendURL);
  if (nextToken !== undefined) {
    token = nextToken;
    sessionStorage.setItem("avem.token", token);
  }
}
export async function request<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!backendURL)
    throw new Error(
      "Connect your backend in Settings to generate, upload, or render. Your project draft is saved in this browser.",
    );
  const response = await fetch(`${backendURL}/api${path}`, {
    ...options,
    headers: apiHeaders(options, token),
  });
  if (!response.ok) {
    let error;
    try {
      error = (await response.json()).error;
    } catch {
      error = `Server returned ${response.status}`;
    }
    throw new Error(error);
  }
  if (response.headers.get("content-type")?.includes("application/zip"))
    return (await response.blob()) as T;
  return response.json();
}
export async function watchState(
  onState: (state: import("../shared/types.ts").AppState) => void,
  signal: AbortSignal,
) {
  const response = await fetch(`${backendURL}/api/events`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Sign in to your workspace"
        : "Live updates unavailable",
    );
  if (!response.body) throw new Error("Live updates unavailable");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = event
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (data) onState(JSON.parse(data));
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
const mediaCache = new Map<string, { url: string; expires: number }>();
export async function mediaURL(id: string) {
  const cached = mediaCache.get(`${backendURL}:${id}`);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { url } = await request(`/assets/${encodeURIComponent(id)}/url`);
  mediaCache.set(`${backendURL}:${id}`, { url, expires: Date.now() + 3000000 });
  return url;
}
