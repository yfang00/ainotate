import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const helper = resolve(import.meta.dir, "plannotator-review");
const tempDirs: string[] = [];

function createHarness(delaySeconds = 0) {
  const root = mkdtempSync(join(tmpdir(), "plannotator-review-"));
  tempDirs.push(root);
  const binDir = join(root, "bin");
  const logPath = join(root, "launches.log");
  mkdirSync(binDir);
  const mockPlannotator = join(binDir, "plannotator");
  writeFileSync(
    mockPlannotator,
    `#!/bin/sh
printf '%s|%s\\n' "$PLANNOTATOR_PORT" "\${PLANNOTATOR_BROWSER:-}" >> "$HELPER_LOG"
sleep "\${HELPER_DELAY:-0}"
printf '%s\\n' '{"decision":{"approved":true}}'
`,
  );
  chmodSync(mockPlannotator, 0o755);

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    HELPER_LOG: logPath,
    HELPER_DELAY: String(delaySeconds),
    PLANNOTATOR_DATA_DIR: join(root, "data"),
    PLANNOTATOR_REVIEW_OWNER: "test-session",
  };
  return { env, logPath };
}

function invoke(args: string[], env: Record<string, string | undefined>) {
  return Bun.spawnSync([helper, ...args], { env });
}

afterEach(() => {
  for (const root of tempDirs.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("plannotator-review", () => {
  test("run reuses one port and suppresses later browser opens", () => {
    const { env, logPath } = createHarness();

    const first = invoke(["run", "review"], env);
    const second = invoke(["run", "review"], env);

    expect(first.exitCode).toBe(0);
    expect(second.exitCode).toBe(0);
    expect(first.stdout.toString()).toContain('"decision":{"approved":true}');
    expect(second.stdout.toString()).toContain('"decision":{"approved":true}');

    const launches = readFileSync(logPath, "utf-8").trim().split("\n");
    expect(launches).toHaveLength(2);
    const [firstPort, firstBrowser] = launches[0].split("|");
    const [secondPort, secondBrowser] = launches[1].split("|");
    expect(firstPort).toBe(secondPort);
    expect(firstBrowser).toBe("");
    expect(secondBrowser).toBe("none");
  });

  test("continues a bounded wait without restarting the review", () => {
    const { env, logPath } = createHarness(2);
    const shortWaitEnv = { ...env, PLANNOTATOR_POLL_BUDGET: "1" };

    const initial = invoke(["run", "review"], shortWaitEnv);
    expect(initial.exitCode).toBe(0);
    expect(initial.stdout.toString()).toContain("PLANNOTATOR_STILL_WAITING");

    const resumed = invoke(["wait"], { ...env, PLANNOTATOR_POLL_BUDGET: "5" });
    expect(resumed.exitCode).toBe(0);
    expect(resumed.stdout.toString()).toContain('"decision":{"approved":true}');
    expect(readFileSync(logPath, "utf-8").trim().split("\n")).toHaveLength(1);
  });
});
