/**
 * The HTTP client every outbound provider and relay request goes through.
 *
 * Prefers Electron's Chromium-backed `net.fetch`. It uses the operating system
 * certificate store and the system proxy, so a machine behind a TLS-inspecting
 * proxy — a corporate setup such as Netskope, which reissues every certificate
 * from a root only the OS trusts — still reaches the network. Node's global
 * fetch trusts only its own bundled roots and rejects such a chain with an
 * opaque "fetch failed".
 *
 * Required lazily so modules importing this still load under plain Node in tests.
 */
export type HttpFetch = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

let cache: { fetch: HttpFetch } | undefined;

export function httpFetch(): HttpFetch {
  if (!cache) {
    let electronFetch: HttpFetch | undefined;
    try {
      const net = (require("electron") as { net?: { fetch?: HttpFetch } }).net;
      if (net?.fetch) electronFetch = (url, init) => net.fetch!(url, init);
    } catch { /* Not running inside Electron: fall back to the global fetch. */ }
    cache = { fetch: electronFetch ?? ((url, init) => fetch(url, init)) };
  }
  return cache.fetch;
}

/** `fetch` reports every transport failure as the bare text "fetch failed", which
 * tells a user nothing about what to fix. Surface the underlying cause so a proxy,
 * DNS or certificate problem reads differently from a provider outage. Errors that
 * already carry their own wording pass through unchanged so callers can still
 * inspect them. */
export function asRequestError(error: unknown): Error {
  if (!(error instanceof Error)) return new Error(String(error));
  if (error.name === "AbortError") return new Error("The provider did not respond in time.");
  if (error.message !== "fetch failed") return error;
  const code = (error as { cause?: { code?: string } }).cause?.code;
  return new Error(`Could not reach the provider${code ? ` (${code})` : ""}.`);
}
