import { describe, expect, test } from "bun:test";
import {
  buildAgentTerminalDeliveryRecord,
  isMatchingAgentTerminalDelivery,
  shouldSendAgentTerminalFeedback,
} from "./agentTerminalIntegration";

describe("agent terminal integration helpers", () => {
  test("delivery records match only for the same session, feedback body, and target", () => {
    const delivered = buildAgentTerminalDeliveryRecord({
      terminalSessionId: 1,
      feedback: "Fix this section",
      targetPath: "/repo/a.md",
    });

    expect(isMatchingAgentTerminalDelivery(delivered, buildAgentTerminalDeliveryRecord({
      terminalSessionId: 1,
      feedback: "Fix this section",
      targetPath: "/repo/a.md",
    }))).toBe(true);
    expect(isMatchingAgentTerminalDelivery(delivered, buildAgentTerminalDeliveryRecord({
      terminalSessionId: 2,
      feedback: "Fix this section",
      targetPath: "/repo/a.md",
    }))).toBe(false);
    expect(isMatchingAgentTerminalDelivery(delivered, buildAgentTerminalDeliveryRecord({
      terminalSessionId: 1,
      feedback: "Fix this other section",
      targetPath: "/repo/a.md",
    }))).toBe(false);
    expect(isMatchingAgentTerminalDelivery(delivered, buildAgentTerminalDeliveryRecord({
      terminalSessionId: 1,
      feedback: "Fix this section",
      targetPath: "/repo/b.md",
    }))).toBe(false);
  });

  test("duplicate terminal feedback sends are blocked for an already delivered record", () => {
    const delivered = buildAgentTerminalDeliveryRecord({
      terminalSessionId: 1,
      feedback: "Fix this section",
      targetPath: "/repo/a.md",
    });

    expect(shouldSendAgentTerminalFeedback(delivered, buildAgentTerminalDeliveryRecord({
      terminalSessionId: 1,
      feedback: "Fix this section",
      targetPath: "/repo/a.md",
    }))).toBe(false);
    expect(shouldSendAgentTerminalFeedback(delivered, buildAgentTerminalDeliveryRecord({
      terminalSessionId: 1,
      feedback: "Fix this section",
      targetPath: "/repo/b.md",
    }))).toBe(true);
  });
});
