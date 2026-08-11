import { createServer, type Server } from "node:http";

function bindServer(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.removeListener("error", onError);
      server.removeListener("listening", onListening);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onListening = () => {
      cleanup();
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    try {
      server.listen(port, host);
    } catch (error: unknown) {
      cleanup();
      reject(error);
    }
  });
}

/** Close a listening test server, or resolve immediately if it is already closed. */
export function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

/**
 * Reserve a contiguous port range for network fallback tests.
 *
 * `host` must match whatever hostname the code under test will actually bind
 * (pass its `getServerHostname()`, not a hardcoded default). On a host with a
 * Tailscale interface, the implementation binds "0.0.0.0" instead of
 * "127.0.0.1" — and on macOS (unlike Linux), binding "0.0.0.0:P" succeeds
 * even while "127.0.0.1:P" is already held, so an occupied-port test that
 * binds the wrong host sees no conflict at all and silently stops testing
 * the fallback it claims to cover. Defaults to loopback for callers using a
 * test double that always binds loopback regardless of environment.
 */
export async function occupyConsecutivePorts(
  count: number,
  host = "127.0.0.1",
): Promise<{
  start: number;
  servers: Server[];
}> {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Test port range length must be a positive integer");
  }

  for (let attempt = 0; attempt < 25; attempt++) {
    const servers: Server[] = [];
    try {
      const first = createServer();
      servers.push(first);
      await bindServer(first, 0, host);
      const address = first.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not expose a TCP port");
      }
      if (address.port + count - 1 > 65535) {
        throw new Error("Ephemeral port is too close to the upper bound");
      }

      for (let offset = 1; offset < count; offset++) {
        const server = createServer();
        servers.push(server);
        await bindServer(server, address.port + offset, host);
      }
      return { start: address.port, servers };
    } catch {
      await Promise.all(servers.map(closeServer));
    }
  }

  throw new Error(`Unable to reserve ${count} consecutive test ports`);
}
