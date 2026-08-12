/**
 * Remote session detection and port configuration
 *
 * Environment variables:
 *   AINOTATE_REMOTE - Set to "1"/"true" to force remote, "0"/"false" to force local
 *   AINOTATE_PORT   - Fixed port or inclusive range (default: random locally, 19432 for remote)
 *
 * Legacy (still supported): SSH_TTY, SSH_CONNECTION
 */

import os from "node:os";
import { parsePortSelection } from "@ainotate/shared/port-range";

const DEFAULT_REMOTE_PORT = 19432;
const LOOPBACK_HOST = "127.0.0.1";
const MAX_FIXED_PORT_RETRIES = 5;
const PORT_RETRY_DELAY_MS = 500;

/**
 * Sandboxes that deny network access refuse bind(2) outright, and both Bun and
 * Node report that denial with code EADDRINUSE — indistinguishable from a real
 * port conflict at the call site. Explain the difference instead of claiming a
 * conflict the user cannot find.
 */
const BIND_DENIED_NOTE =
  "No local port could be bound at all, so this is not a port conflict. " +
  "Sandboxes that block network access report the denial as EADDRINUSE " +
  '(e.g. Codex with sandbox_mode = "workspace-write" and no ' +
  "[sandbox_workspace_write] network_access = true). Allow network access for " +
  "the sandbox, or run ainotate outside it.";

/** Return whether a runtime listen failure represents an occupied address. */
export function isAddressInUseError(err: unknown): boolean {
  return err instanceof Error && (
    (err as NodeJS.ErrnoException).code === "EADDRINUSE" ||
    err.message.includes("EADDRINUSE")
  );
}

function getRemoteOverride(): boolean | null {
  const remote = process.env.AINOTATE_REMOTE;
  if (remote === undefined) {
    return null;
  }

  if (remote === "1" || remote?.toLowerCase() === "true") {
    return true;
  }

  if (remote === "0" || remote?.toLowerCase() === "false") {
    return false;
  }

  return null;
}

/**
 * Check if running in a remote session (SSH, devcontainer, cloud workspace, etc.)
 */
export function isRemoteSession(): boolean {
  const remoteOverride = getRemoteOverride();
  if (remoteOverride !== null) {
    return remoteOverride;
  }

  // SSH sessions (SSH_TTY, SSH_CONNECTION, SSH_CLIENT) or container/cloud environments
  if (
    process.env.SSH_TTY ||
    process.env.SSH_CONNECTION ||
    process.env.SSH_CLIENT ||
    process.env.HERDR_SESSION ||
    process.env.HERDR_REMOTE ||
    process.env.HERDR_CLIENT ||
    process.env.REMOTE_CONTAINERS ||
    process.env.DEVCONTAINER ||
    process.env.CODESPACES ||
    process.env.GITPOD_WORKSPACE_ID
  ) {
    return true;
  }

  return false;
}

/**
 * Get the server ports to try, in order.
 */
export function getServerPorts(): number[] {
  return getServerPortConfiguration().ports;
}

function getServerPortConfiguration(): {
  ports: number[];
  isRange: boolean;
} {
  const envPort = process.env.AINOTATE_PORT;
  if (envPort) {
    const parsed = parsePortSelection(envPort);
    if (parsed) {
      return { ports: parsed.ports, isRange: parsed.kind === "range" };
    }
    console.error(
      `[Ainotate] Warning: Invalid AINOTATE_PORT "${envPort}", using default`
    );
  }

  // Remote sessions use fixed port for port forwarding; local uses random
  return {
    ports: [isRemoteSession() ? DEFAULT_REMOTE_PORT : 0],
    isRange: false,
  };
}

/**
 * Get the first configured server port.
 */
export function getServerPort(): number {
  return getServerPorts()[0];
}

/** Whether this process is permitted to bind a listening socket at all. */
function canBindLocalPort(): boolean {
  try {
    const probe = Bun.listen({
      hostname: getServerHostname(),
      port: 0,
      socket: { data() {} },
    });
    probe.stop(true);
    return true;
  } catch {
    return false;
  }
}

/**
 * Start a Bun server on the first available configured port.
 *
 * Bounded ranges advance immediately after EADDRINUSE. A fixed port retains
 * the existing five-attempt retry behavior for transient conflicts. Port 0 is
 * never retried: the OS picks the port, so a failure there is a refused bind
 * rather than a conflict that could clear.
 */
export async function startBunServerOnAvailablePort<TServer>(
  startServer: (port: number) => TServer,
): Promise<TServer> {
  const { ports: configuredPorts, isRange } = getServerPortConfiguration();
  const isEphemeral = !isRange && configuredPorts[0] === 0;
  const portsToTry = isRange
    ? configuredPorts
    : Array(isEphemeral ? 1 : MAX_FIXED_PORT_RETRIES).fill(configuredPorts[0]);

  for (const [index, port] of portsToTry.entries()) {
    try {
      return startServer(port);
    } catch (error: unknown) {
      if (!isAddressInUseError(error)) {
        throw error;
      }

      if (index < portsToTry.length - 1) {
        if (!isRange) {
          await Bun.sleep(PORT_RETRY_DELAY_MS);
        }
        continue;
      }

      if (isEphemeral) {
        throw new Error(
          `Failed to bind an ephemeral port. ${BIND_DENIED_NOTE}`,
        );
      }

      if (!canBindLocalPort()) {
        const configured = isRange
          ? `port selection ${configuredPorts[0]}-${configuredPorts.at(-1)}`
          : `port ${port}`;
        throw new Error(`Failed to bind ${configured}. ${BIND_DENIED_NOTE}`);
      }

      if (!isRange) {
        const hint = isRemoteSession()
          ? " (set AINOTATE_PORT to use different port)"
          : "";
        throw new Error(
          `Port ${port} in use after ${MAX_FIXED_PORT_RETRIES} retries${hint}`,
        );
      }

      const configured = `${configuredPorts[0]}-${configuredPorts.at(-1)}`;
      const hint = isRemoteSession()
        ? " (set AINOTATE_PORT to use a different port or range)"
        : "";
      throw new Error(`Port selection ${configured} exhausted${hint}`);
    }
  }

  throw new Error("Failed to start server");
}

/**
 * Detect the local machine's Tailscale IPv4 address if available.
 * Tailscale uses CGNAT range 100.64.0.0/10 (100.64.0.0 to 100.127.255.255).
 */
export function getTailscaleIp(): string | null {
  try {
    const interfaces = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === "IPv4" && !addr.internal) {
          const parts = addr.address.split(".").map(Number);
          if (parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) {
            return addr.address;
          }
          if (name.toLowerCase().includes("tailscale")) {
            return addr.address;
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Format a server URL for display in remote/SSH terminal sessions.
 * Replaces loopback/0.0.0.0 with the machine's Tailscale IPv4 address if available.
 */
export function getRemoteDisplayUrl(url: string, isRemote: boolean): string {
  if (!isRemote) return url;
  const tailscaleIp = getTailscaleIp();
  if (!tailscaleIp) return url;
  return url.replace(/localhost|127\.0\.0\.1|0\.0\.0\.0/, tailscaleIp);
}

/**
 * Bind local sessions to loopback, but keep remote sessions reachable via the
 * container or host network interface for SSH/devcontainer/Docker forwarding.
 */
export function getServerHostname(): string {
  return isRemoteSession() || getTailscaleIp() !== null ? "0.0.0.0" : LOOPBACK_HOST;
}

