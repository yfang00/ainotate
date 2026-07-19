import { describe, expect, test } from "bun:test";
import {
  createServerInstanceId,
  hasServerInstanceChanged,
  readServerInstanceId,
} from "./server-instance";

describe("server instance identity", () => {
  test("uses the supplied UUID source for a fresh server identity", () => {
    expect(createServerInstanceId(() => "server-a")).toBe("server-a");
  });

  test("reads only non-empty string identities", () => {
    expect(readServerInstanceId({ serverInstanceId: "server-a" })).toBe("server-a");
    expect(readServerInstanceId({ serverInstanceId: "" })).toBeNull();
    expect(readServerInstanceId({ serverInstanceId: 123 })).toBeNull();
    expect(readServerInstanceId(null)).toBeNull();
  });

  test("reloads only when both valid identities differ", () => {
    expect(hasServerInstanceChanged("server-a", { serverInstanceId: "server-b" })).toBe(true);
    expect(hasServerInstanceChanged("server-a", { serverInstanceId: "server-a" })).toBe(false);
    expect(hasServerInstanceChanged("server-a", {})).toBe(false);
    expect(hasServerInstanceChanged(null, { serverInstanceId: "server-b" })).toBe(false);
  });
});
