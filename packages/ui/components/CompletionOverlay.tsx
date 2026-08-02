import { useAutoClose } from '../hooks/useAutoClose';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

const CheckIcon = () => (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const ChatBubbleIcon = () => (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
    />
  </svg>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CompletionOverlayProps {
  submitted: 'approved' | 'denied' | 'feedback' | 'exited' | null | false;
  title: string;
  subtitle: string;
  agentLabel: string;
}

export function CompletionOverlay({ submitted, title, subtitle, agentLabel }: CompletionOverlayProps) {
  const { state, enableAndStart } = useAutoClose(!!submitted);

  if (!submitted) return null;

  const isApproved = submitted === 'approved';

  return (
    <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-8">
        <div
          className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${
            isApproved ? 'bg-success/20 text-success' : 'bg-accent/20 text-accent'
          }`}
        >
          {isApproved ? <CheckIcon /> : <ChatBubbleIcon />}
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>

        <div className="pt-4 border-t border-border space-y-2">
          {state.phase === 'counting' ? (
            <>
              <p className="text-sm text-muted-foreground">
                This tab will close in <span className="text-foreground font-medium">{state.remaining}</span> second
                {state.remaining !== 1 ? 's' : ''}...
              </p>
              <p className="text-xs text-muted-foreground/60">You can change this in Settings.</p>
            </>
          ) : state.phase === 'closeFailed' ? (
            <div className="space-y-3 pt-1">
              <p className="text-sm text-muted-foreground">
                Your browser blocked auto-closing this tab.
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    try {
                      (window as unknown as Record<string, unknown>).opener = window;
                      window.close();
                    } catch {}
                    try {
                      window.open('', '_self', '');
                      window.close();
                    } catch {}
                    if (!window.closed) {
                      window.location.href = 'about:blank';
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
                >
                  Close Tab Now
                </button>
              </div>
              <p className="text-xs text-muted-foreground/60">
                Or press <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px] font-mono">⌘W</kbd> / <kbd className="px-1.5 py-0.5 bg-muted rounded border text-[10px] font-mono">Ctrl+W</kbd> to close.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                You can close this tab and return to <span className="text-foreground font-medium">{agentLabel}</span>.
              </p>
              {state.phase === 'prompt' ? (
                <>
                  <label className="flex items-center justify-center gap-2 cursor-pointer group">
                    <input type="checkbox" checked={false} onChange={enableAndStart} className="accent-primary" />
                    <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                      Auto-close this tab after 3 seconds
                    </span>
                  </label>
                  <p className="text-xs text-muted-foreground/60">You can change the delay in Settings.</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground/60">Your response has been sent.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
