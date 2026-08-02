/**
 * Remote Detection & Port Config Tests
 *
 * Run: bun test packages/server/remote.test.ts
 */

import { afterEach, describe, expect, test } from "bun:test";
import { closeServer, occupyConsecutivePorts } from "../../tests/helpers/ports";
import {
  isAddressInUseError,
  isRemoteSession,
  getServerHostname,
  getServerPort,
  getServerPorts,
  startBunServerOnAvailablePort,
  getTailscaleIp,
  getRemoteDisplayUrl,
} from "./remote";

// Save and restore env between tests
const savedEnv: Record<string, string | undefined> = {};
const envKeys = [
  "AINOTATE_REMOTE",
  "AINOTATE_PORT",
  "SSH_TTY",
  "SSH_CONNECTION",
  "SSH_CLIENT",
  "REMOTE_CONTAINERS",
  "DEVCONTAINER",
  "CODESPACES",
  "GITPOD_WORKSPACE_ID",
];

function clearEnv() {
  for (const key of envKeys) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
}

function startTestBunServer(port: number): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: () => new Response("ok"),
  });
}

afterEach(() => {
  for (const key of envKeys) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
});

describe("isRemoteSession", () => {
  test("false by default (no env vars)", () => {
    clearEnv();
    expect(isRemoteSession()).toBe(false);
  });

  test("true when AINOTATE_REMOTE=1", () => {
    clearEnv();
    process.env.AINOTATE_REMOTE = "1";
    expect(isRemoteSession()).toBe(true);
  });

  test("true when AINOTATE_REMOTE=true", () => {
    clearEnv();
    process.env.AINOTATE_REMOTE = "true";
    expect(isRemoteSession()).toBe(true);
  });

  test("false when AINOTATE_REMOTE=0", () => {
    clearEnv();
    process.env.AINOTATE_REMOTE = "0";
    expect(isRemoteSession()).toBe(false);
  });

  test("false when AINOTATE_REMOTE=false", () => {
    clearEnv();
    process.env.AINOTATE_REMOTE = "false";
    expect(isRemoteSession()).toBe(false);
  });

  test("AINOTATE_REMOTE=false overrides SSH_TTY", () => {
    clearEnv();
    process.env.AINOTATE_REMOTE = "false";
    process.env.SSH_TTY = "/dev/pts/0";
    expect(isRemoteSession()).toBe(false);
  });

  test("AINOTATE_REMOTE=0 overrides SSH_CONNECTION", () => {
    clearEnv();
    process.env.AINOTATE_REMOTE = "0";
    process.env.SSH_CONNECTION = "192.168.1.1 12345 192.168.1.2 22";
    expect(isRemoteSession()).toBe(false);
  });

  test("true when SSH_TTY is set (legacy)", () => {
    clearEnv();
    process.env.SSH_TTY = "/dev/pts/0";
    expect(isRemoteSession()).toBe(true);
  });

  test("true when SSH_CONNECTION is set (legacy)", () => {
    clearEnv();
    process.env.SSH_CONNECTION = "192.168.1.1 12345 192.168.1.2 22";
    expect(isRemoteSession()).toBe(true);
  });

  test("true when SSH_CLIENT is set", () => {
    clearEnv();
    process.env.SSH_CLIENT = "192.168.1.1 12345 22";
    expect(isRemoteSession()).toBe(true);
  });

  test("true when DEVCONTAINER or CODESPACES is set", () => {
    clearEnv();
    process.env.DEVCONTAINER = "true";
    expect(isRemoteSession()).toBe(true);
  });
});

describe("isAddressInUseError", () => {
  test("recognizes Bun errors by code", () => {
    expect(isAddressInUseError(Object.assign(new Error("listen failed"), { code: "EADDRINUSE" }))).toBe(true);
  });
});

describe("getServerPort", () => {
  test("AINOTATE_PORT unset preserves the random local default", () => {
    clearEnv();
    expect(getServerPort()).toBe(0);
  });

  test("AINOTATE_PORT unset preserves the 19432 remote default", () => {
    clearEnv();
    process.env.AINOTATE_REMOTE = "1";
    expect(getServerPort()).toBe(19432);
  });

  test("returns 0 when AINOTATE_REMOTE=false overrides SSH", () => {
    clearEnv();
    process.env.AINOTATE_REMOTE = "false";
    process.env.SSH_TTY = "/dev/pts/0";
    expect(getServerPort()).toBe(0);
  });

  test("explicit AINOTATE_PORT overrides everything", () => {
    clearEnv();
    process.env.AINOTATE_PORT = "8080";
    expect(getServerPort()).toBe(8080);
  });

  test("explicit port overrides remote default", () => {
    clearEnv();
    process.env.AINOTATE_REMOTE = "1";
    process.env.AINOTATE_PORT = "3000";
    expect(getServerPort()).toBe(3000);
  });

  test("expands an inclusive port range", () => {
    clearEnv();
    process.env.AINOTATE_PORT = "19432-19435";
    expect(getServerPorts()).toEqual([19432, 19433, 19434, 19435]);
    expect(getServerPort()).toBe(19432);
  });

  test("ignores reversed port ranges", () => {
    clearEnv();
    process.env.AINOTATE_PORT = "19435-19432";
    expect(getServerPorts()).toEqual([0]);
  });

  test("ignores ranges containing random port zero", () => {
    clearEnv();
    process.env.AINOTATE_PORT = "0-3";
    expect(getServerPorts()).toEqual([0]);
  });

  test("ignores invalid port (falls back to default)", () => {
    clearEnv();
    process.env.AINOTATE_PORT = "not-a-number";
    expect(getServerPort()).toBe(0);
  });

  test("rejects malformed fixed ports and ranges without accepting numeric prefixes", () => {
    clearEnv();
    for (const value of [
      "19432garbage",
      "19432.5",
      "19432-19435garbage",
      "19432-19435-19436",
    ]) {
      process.env.AINOTATE_PORT = value;
      expect(getServerPorts()).toEqual([0]);
    }
  });

  test("a malformed range follows the existing remote default path", () => {
    clearEnv();
    process.env.AINOTATE_REMOTE = "1";
    process.env.AINOTATE_PORT = "19432-19435garbage";
    expect(getServerPorts()).toEqual([19432]);
  });

  test("ignores out-of-range port", () => {
    clearEnv();
    process.env.AINOTATE_PORT = "99999";
    expect(getServerPort()).toBe(0);
  });

  test("ignores zero port", () => {
    clearEnv();
    process.env.AINOTATE_PORT = "0";
    expect(getServerPort()).toBe(0);
  });
});

describe("Bun port range binding", () => {
  test("binds the next port when the range start is occupied", async () => {
    clearEnv();
    const { start, servers } = await occupyConsecutivePorts(2);
    await closeServer(servers[1]);
    process.env.AINOTATE_PORT = `${start}-${start + 1}`;

    let server: ReturnType<typeof Bun.serve> | undefined;
    try {
      server = await startBunServerOnAvailablePort(startTestBunServer);
      expect(server.port).toBe(start + 1);
    } finally {
      server?.stop(true);
      await closeServer(servers[0]);
    }
  });

  test("reports an exhausted occupied range", async () => {
    clearEnv();
    const { start, servers } = await occupyConsecutivePorts(2);
    process.env.AINOTATE_PORT = `${start}-${start + 1}`;

    try {
      await expect(startBunServerOnAvailablePort(startTestBunServer)).rejects.toThrow(
        new RegExp(`^Port selection ${start}-${start + 1} exhausted$`),
      );
    } finally {
      await Promise.all(servers.map(closeServer));
    }
  });

  test("treats a valid one-port range as range syntax", async () => {
    clearEnv();
    const { start, servers } = await occupyConsecutivePorts(1);
    process.env.AINOTATE_PORT = `${start}-${start}`;

    try {
      await expect(startBunServerOnAvailablePort(startTestBunServer)).rejects.toThrow(
        new RegExp(`^Port selection ${start}-${start} exhausted$`),
      );
    } finally {
      await closeServer(servers[0]);
    }
  });
});

describe("Bun non-range port compatibility", () => {
  test("an occupied fixed port preserves the existing retry error", async () => {
    clearEnv();
    const { start, servers } = await occupyConsecutivePorts(1);
    process.env.AINOTATE_REMOTE = "1";
    process.env.AINOTATE_PORT = String(start);

    try {
      await expect(startBunServerOnAvailablePort(startTestBunServer)).rejects.toThrow(
        new RegExp(
          `^Port ${start} in use after 5 retries \\(set AINOTATE_PORT to use different port\\)$`,
        ),
      );
    } finally {
      await closeServer(servers[0]);
    }
  });
});

describe("getServerHostname", () => {
  test("returns loopback for local sessions", () => {
    clearEnv();
    expect(getServerHostname()).toBe("127.0.0.1");
  });

  test("returns all interfaces for remote sessions", () => {
    clearEnv();
    process.env.AINOTATE_REMOTE = "1";
    expect(getServerHostname()).toBe("0.0.0.0");
  });
});

describe("getRemoteDisplayUrl", () => {
  test("returns original url for local sessions", () => {
    expect(getRemoteDisplayUrl("http://localhost:19432", false)).toBe("http://localhost:19432");
  });

  test("returns original url or tailscale ip url for remote sessions", () => {
    const url = getRemoteDisplayUrl("http://localhost:19432", true);
    const tsIp = getTailscaleIp();
    if (tsIp) {
      expect(url).toBe(`http://${tsIp}:19432`);
    } else {
      expect(url).toBe("http://localhost:19432");
    }
  });
});

