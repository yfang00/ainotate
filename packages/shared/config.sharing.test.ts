import { afterEach, describe, expect, test } from "bun:test";
import { resolveSharingEnabled } from "./config";

const originalShareEnv = process.env.AINOTATE_SHARE;

afterEach(() => {
  if (originalShareEnv === undefined) delete process.env.AINOTATE_SHARE;
  else process.env.AINOTATE_SHARE = originalShareEnv;
});

describe("local-only sharing policy", () => {
  test("cannot be enabled by environment or config", () => {
    process.env.AINOTATE_SHARE = "enabled";
    const legacyEnabledConfig = { share: "enabled" } as unknown as Parameters<typeof resolveSharingEnabled>[0];
    expect(resolveSharingEnabled(legacyEnabledConfig)).toBe(false);
    expect(resolveSharingEnabled({ share: "disabled" } as never)).toBe(false);
    expect(resolveSharingEnabled({})).toBe(false);
  });
});
