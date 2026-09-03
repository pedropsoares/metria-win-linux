/**
 * Single seam for every outbound HTTP call the main process makes (provider usage
 * and the ntfy publish), so the app can hand them Electron's `net.fetch` instead
 * of Node's global `fetch`.
 *
 * The two use different network stacks, and only one of them works behind a
 * TLS-inspecting proxy: Node checks certificates against its own bundled CA list,
 * which does not contain the private root CA such a proxy signs with, so every
 * request dies as `TypeError: fetch failed` with cause `SELF_SIGNED_CERT_IN_CHAIN`
 * — the "providers won't refresh" symptom. Chromium's stack reads the OS trust
 * store, where that CA is installed for the browsers to work, and also honours the
 * system proxy (including PAC scripts).
 *
 * The default stays Node's `fetch` because the tests import these modules outside
 * Electron, where `net` does not exist.
 */
export interface HttpRequestInit {
  method?: string;
  body?: string | Uint8Array;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export type HttpFetch = (input: string, init?: HttpRequestInit) => Promise<Response>;

const nodeFetch: HttpFetch = (input, init) => fetch(input, init as RequestInit);
let transport: HttpFetch = nodeFetch;

/** Installed once from the main process after `app.whenReady()`: `net.fetch` needs a ready app. */
export function setHttpTransport(next: HttpFetch): void { transport = next; }

/** Restores Node's `fetch`; used by tests. */
export function resetHttpTransport(): void { transport = nodeFetch; }

export function httpFetch(input: string | URL, init?: HttpRequestInit): Promise<Response> {
  return transport(String(input), init);
}
