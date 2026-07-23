import { describe, expect, mock, test } from "bun:test";
import { decompress } from "@ainotate/shared/compress";
import { generateRemoteShareUrl, writeRemoteShareLink } from "./share-url";

describe("generateRemoteShareUrl", () => {
  test("keeps markdown remote shares hash-based", async () => {
    const url = await generateRemoteShareUrl("# Plan", "https://share.example.test");
    expect(url.startsWith("https://share.example.test/#")).toBe(true);

    const payload = await decompress(url.split("#")[1]) as { p: string; a: unknown[] };
    expect(payload).toEqual({ p: "# Plan", a: [] });
  });

  test("refuses raw HTML paste uploads in the local-only fork", async () => {
    const fetchImpl = mock(async () => new Response()) as typeof fetch;

    await expect(generateRemoteShareUrl("", "https://share.example.test", {
      rawHtml: "<!doctype html><h1>Hello</h1>",
      pasteApiUrl: "https://paste.example.test",
      fetchImpl,
    })).rejects.toThrow("Remote share/paste upload is disabled in this build.");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("warns without contacting the paste service for raw HTML", async () => {
    const fetchImpl = mock(async () => new Response()) as typeof fetch;
    const originalWrite = process.stderr.write;
    let stderr = "";
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    }) as typeof process.stderr.write;

    try {
      await writeRemoteShareLink("", "https://share.example.test", "annotate", "HTML document only", {
        rawHtml: "<!doctype html><h1>Hello</h1>",
        pasteApiUrl: "https://paste.example.test",
        fetchImpl,
      });
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(stderr).toContain("Warning: could not create remote share link for HTML document only.");
    expect(stderr).toContain("Remote share/paste upload is disabled in this build.");
    expect(stderr).toContain("HTML sharing uses the paste service");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
