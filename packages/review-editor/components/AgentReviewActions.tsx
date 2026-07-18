import React from 'react';
import { Button } from '@plannotator/ui/components/ui/button';
import { Send, RotateCcw } from 'lucide-react';

interface AgentReviewActionsProps {
  totalAnnotationCount: number;
  isSendingFeedback: boolean;
  isApproving: boolean;
  isExiting: boolean;
  hasSubmitted?: boolean;
  onSendFeedback: () => void;
  onApprove: () => void;
  onExit: () => void;
}

/**
 * Toolbar actions for agent review mode (all non-platform origins).
 *
 *   [Reset]  [Submit]
 *
 * - Reset: discard everything and end the review. Grey when there's nothing to
 *   lose, white (outline) when there are comments. The host confirms first when
 *   comments exist.
 * - Submit: single primary action. Green while the agent is waiting and there
 *   are no comments (approve / "no changes"), red when there are comments to
 *   send, grey once the response has been submitted. Routes on annotation count:
 *     has annotations → send the comments to the agent
 *     no annotations  → approve ("no changes needed")
 *   Because Submit only approves when there are zero annotations, comments can
 *   never be silently dropped by submitting; to discard them, use Reset.
 */
export const AgentReviewActions: React.FC<AgentReviewActionsProps> = ({
  totalAnnotationCount,
  isSendingFeedback,
  isApproving,
  isExiting,
  hasSubmitted = false,
  onSendFeedback,
  onApprove,
  onExit,
}) => {
  const busy = isSendingFeedback || isApproving || isExiting;
  const hasAnnotations = totalAnnotationCount > 0;

  return (
    <>
      <Button
        variant={hasAnnotations ? 'outline' : 'ghost'}
        className={hasAnnotations ? undefined : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'}
        size="xs"
        onClick={onExit}
        disabled={busy || hasSubmitted}
        iconLeft={<RotateCcw className="size-3.5" />}
        title={hasAnnotations ? 'Reset — discard your comments and end the review' : 'Reset — end the review'}
      >
        <span className="hidden md:inline">{isExiting ? 'Resetting…' : 'Reset'}</span>
      </Button>

      <Button
        variant={hasSubmitted ? 'ghost' : (hasAnnotations ? 'destructive' : 'success')}
        className={hasSubmitted ? 'bg-muted text-muted-foreground hover:bg-muted border border-border' : undefined}
        size="xs"
        onClick={hasAnnotations ? onSendFeedback : onApprove}
        disabled={busy || hasSubmitted}
        iconLeft={<Send className="size-3.5" />}
        title={hasAnnotations ? 'Submit — send your comments to the agent' : 'Submit — no changes needed'}
      >
        <span className="hidden md:inline">{(isSendingFeedback || isApproving) ? 'Submitting…' : 'Submit'}</span>
        <span className="md:hidden">{(isSendingFeedback || isApproving) ? '…' : 'Submit'}</span>
      </Button>
    </>
  );
};
