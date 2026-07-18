import React from 'react';
import { ApproveButton, ExitButton } from '@plannotator/ui/components/ToolbarButtons';

interface AgentReviewActionsProps {
  totalAnnotationCount: number;
  isSendingFeedback: boolean;
  isApproving: boolean;
  isExiting: boolean;
  onSendFeedback: () => void;
  onApprove: () => void;
  onExit: () => void;
}

/**
 * Toolbar actions for agent review mode (all non-platform origins).
 *
 *   [Close]  [Submit]
 *
 * - Close (Exit): aborts — closes the session without sending anything. The
 *   host warns first if there are unsent annotations.
 * - Submit: single primary action. Routes on annotation count —
 *     has annotations → send the comments to the agent
 *     no annotations  → approve ("no changes needed")
 *   Because Submit only approves when there are zero annotations, comments can
 *   never be silently dropped by submitting; to discard them, use Close.
 */
export const AgentReviewActions: React.FC<AgentReviewActionsProps> = ({
  totalAnnotationCount,
  isSendingFeedback,
  isApproving,
  isExiting,
  onSendFeedback,
  onApprove,
  onExit,
}) => {
  const busy = isSendingFeedback || isApproving || isExiting;
  const hasAnnotations = totalAnnotationCount > 0;

  return (
    <>
      <ExitButton
        onClick={onExit}
        disabled={busy}
        isLoading={isExiting}
      />

      <ApproveButton
        onClick={hasAnnotations ? onSendFeedback : onApprove}
        disabled={busy}
        isLoading={hasAnnotations ? isSendingFeedback : isApproving}
        label="Submit"
        mobileLabel="Submit"
        title={hasAnnotations ? 'Submit — send your comments to the agent' : 'Submit — no changes needed'}
      />
    </>
  );
};
