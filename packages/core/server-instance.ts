/**
 * Opaque identity for one running Plannotator server instance.
 *
 * A stable port can be reused across sequential reviews, so the browser needs
 * an identity that changes on every server start (including starts within the
 * same long-lived Node process).
 */
export function createServerInstanceId(
  randomUUID: () => string = () => globalThis.crypto.randomUUID(),
): string {
  return randomUUID();
}

export function readServerInstanceId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as { serverInstanceId?: unknown }).serverInstanceId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function hasServerInstanceChanged(
  currentServerInstanceId: string | null | undefined,
  payload: unknown,
): boolean {
  if (!currentServerInstanceId) return false;
  const nextServerInstanceId = readServerInstanceId(payload);
  return nextServerInstanceId !== null && nextServerInstanceId !== currentServerInstanceId;
}
