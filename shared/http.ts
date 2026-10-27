export function apiHeaders(options: RequestInit, token: string) {
  const headers = new Headers(options.headers);
  if (!headers.has("Authorization"))
    headers.set("Authorization", `Bearer ${token}`);
  if (
    typeof options.body === "string" &&
    options.body.length &&
    !headers.has("Content-Type")
  )
    headers.set("Content-Type", "application/json");
  return headers;
}
