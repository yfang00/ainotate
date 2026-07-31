export type AnnotateFeedbackTarget = {
  fileHeader: "File" | "Folder";
  filePath: string;
};

export type AgentTerminalDeliveryRecord = {
  terminalSessionId: number;
  feedbackKey: string;
  targetPath: string | null;
};

export function textKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length}:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildAgentTerminalDeliveryRecord(options: {
  terminalSessionId: number;
  feedback: string;
  targetPath?: string | null;
}): AgentTerminalDeliveryRecord {
  return {
    terminalSessionId: options.terminalSessionId,
    feedbackKey: textKey(options.feedback),
    targetPath: options.targetPath ?? null,
  };
}

export function isMatchingAgentTerminalDelivery(
  delivered: AgentTerminalDeliveryRecord | null,
  current: AgentTerminalDeliveryRecord | null,
): boolean {
  return !!delivered &&
    !!current &&
    delivered.terminalSessionId === current.terminalSessionId &&
    delivered.feedbackKey === current.feedbackKey &&
    delivered.targetPath === current.targetPath;
}

export function shouldSendAgentTerminalFeedback(
  delivered: AgentTerminalDeliveryRecord | null,
  current: AgentTerminalDeliveryRecord | null,
): boolean {
  return !isMatchingAgentTerminalDelivery(delivered, current);
}
