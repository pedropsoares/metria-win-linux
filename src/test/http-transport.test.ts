import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { httpFetch, resetHttpTransport, setHttpTransport } from "../main/http-transport";
import { ProviderService } from "../main/providers";
import type { AppSettings } from "../shared/types";
import type { ProviderPaths } from "../main/provider-paths";
import type { WslShell } from "../main/wsl";

const noWsl: WslShell = {
  distros: async () => [],
  presence: async () => ({ claude: false, codex: false, openCode: false, cursor: false }),
  readFile: async () => "",
  newestJsonl: async () => undefined
};

/** Anthropic's OAuth usage payload, trimmed to the two windows Metria reads. */
const claudeUsage = JSON.stringify({
  five_hour: { utilization: 19, resets_at: "2026-09-03T15:40:00Z" },
  seven_day: { utilization: 12, resets_at: "2026-09-08T18:00:00Z" }
});

function claudePaths(): ProviderPaths {
  const home = mkdtempSync(join(tmpdir(), "metria-claude-"));
  const credentials = join(home, ".credentials.json");
  writeFileSync(credentials, JSON.stringify({ claudeAiOauth: { accessToken: "token", email: "user@example.test" } }));
  return { codexAuth: join(home, "none"), codexSessions: join(home, "none"), openCodeAuth: join(home, "none"), claudeCredentials: credentials, cursorState: join(home, "none") };
}

test("httpFetch sends every request through the installed transport", async () => {
  const seen: { url: string; method?: string }[] = [];
  setHttpTransport(async (input, init) => { seen.push({ url: input, method: init?.method }); return new Response("ok"); });
  try {
    const response = await httpFetch(new URL("https://example.test/usage"), { method: "POST" });
    assert.equal(await response.text(), "ok");
    assert.deepEqual(seen, [{ url: "https://example.test/usage", method: "POST" }]);
  } finally {
    resetHttpTransport();
  }
});

test("resetHttpTransport restores the default transport", () => {
  setHttpTransport(async () => new Response("stub"));
  resetHttpTransport();
  // The default delegates to Node's global fetch, which rejects an unsupported scheme
  // rather than answering "stub".
  return assert.rejects(() => httpFetch("not-a-url"));
});

test("the Claude provider reads its usage through the transport", async () => {
  const requests: { url: string; authorization?: string }[] = [];
  setHttpTransport(async (input, init) => {
    requests.push({ url: input, authorization: init?.headers?.Authorization });
    return new Response(claudeUsage);
  });
  try {
    const settings = { providerSource: { Claude: { location: "host" as const } } } as AppSettings;
    const usage = await new ProviderService(() => settings, noWsl, claudePaths()).fetch(["Claude"]);
    assert.equal(usage[0].error, null);
    assert.deepEqual(usage[0].windows, [
      { title: "Current session", percent: 19, resetDate: "2026-09-03T15:40:00Z" },
      { title: "All models", percent: 12, resetDate: "2026-09-08T18:00:00Z" }
    ]);
    assert.equal(usage[0].accountLabel, "user@example.test");
    assert.deepEqual(requests, [{ url: "https://api.anthropic.com/api/oauth/usage", authorization: "Bearer token" }]);
  } finally {
    resetHttpTransport();
  }
});
