import React from 'react';
import type { Origin } from '@ainotate/shared/agents';
import type { Agent } from '@ainotate/ui/hooks/useAgents';
import type { UpdateInfo } from '@ainotate/ui/hooks/useUpdateCheck';
import { FeedbackButton, ApproveButton, ExitButton } from '@ainotate/ui/components/ToolbarButtons';
import { Button } from '@ainotate/ui/components/ui/button';
import { Check, RotateCcw, Send, X } from 'lucide-react';
import { ApproveDropdown } from '@ainotate/ui/components/ApproveDropdown';
import { Settings } from '@ainotate/ui/components/Settings';
import { PlanHeaderMenu } from '@ainotate/ui/components/PlanHeaderMenu';
import type { CallbackConfig } from '@ainotate/ui/utils/callback';
import type { UIPreferences } from '@ainotate/ui/utils/uiPreferences';
import { SparklesIcon } from '@ainotate/ui/components/SparklesIcon';

interface AppHeaderProps {
  /** HTML annotate surface: show a Hide/Show annotation-tools toggle in the header,
   *  so hiding leaves the rendered HTML completely free of overlay controls. */
  htmlSurface?: boolean;
  htmlToolsHidden?: boolean;
  onToggleHtmlTools?: () => void;
  // Mode flags (stable after mount)
  isApiMode: boolean;
  annotateMode: boolean;
  archiveMode: boolean;
  isSharedSession: boolean;
  origin: Origin | null;

  // Dynamic state
  isSubmitting: boolean;
  isExiting: boolean;
  isPanelOpen: boolean;
  aiAvailable: boolean;
  isAIChatOpen: boolean;
  aiHasMessages: boolean;
  hasAnyAnnotations: boolean;
  hasSubmitted: boolean;
  annotationCount: number;
  linkedDocIsActive: boolean;
  callbackShareUrlReady: boolean;
  canShareCurrentSession: boolean;
  agentName: string;
  availableAgents: Agent[];
  showAnnotationsWarning: boolean;

  // Callback config (null when no bot callback)
  callbackConfig: CallbackConfig | null;

  // Settings props
  taterMode: boolean;
  mobileSettingsOpen: boolean;
  gitUser: string | undefined;

  // Handlers — App owns all decision logic, header just calls these
  onCallbackFeedback: () => void;
  onCallbackApprove: () => void;
  onAnnotateExit: () => void;
  onAnnotateReset: () => void;
  onAnnotateFeedback: () => void;
  onAnnotateApprove: () => void;
  onFeedback: () => void;
  onApprove: () => void;
  onAnnotationPanelToggle: () => void;
  onAIChatToggle: () => void;
  onArchiveCopy: () => void;
  onArchiveDone: () => void;
  onTaterModeChange: (enabled: boolean) => void;
  onIdentityChange: (oldId: string, newId: string) => void;
  onUIPreferencesChange: (prefs: UIPreferences) => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onOpenExport: () => void;
  onCopyAgentInstructions: () => void;
  onDownloadAnnotations: () => void;
  onPrint: () => void;
  onCopyShareLink: () => void;
  onOpenImport: () => void;
  onSaveToObsidian: () => void;
  onSaveToBear: () => void;
  onSaveToOctarine: () => void;

  // PlanHeaderMenu config
  appVersion: string;
  updateInfo?: UpdateInfo | null;
  isWSL?: boolean;
  agentInstructionsEnabled: boolean;
  obsidianConfigured: boolean;
  bearConfigured: boolean;
  octarineConfigured: boolean;
}

export const getAnnotateHeaderActions = (hasFeedback: boolean) => ({
  secondary: hasFeedback ? 'Reset' : 'Close',
  primary: hasFeedback ? 'Submit' : 'Approve',
});

export const AppHeader = React.memo<AppHeaderProps>(({
  htmlSurface,
  htmlToolsHidden,
  onToggleHtmlTools,
  isApiMode,
  annotateMode,
  archiveMode,
  isSharedSession,
  origin,
  isSubmitting,
  isExiting,
  isPanelOpen,
  aiAvailable,
  isAIChatOpen,
  aiHasMessages,
  hasAnyAnnotations,
  hasSubmitted,
  annotationCount,
  linkedDocIsActive,
  callbackShareUrlReady,
  canShareCurrentSession,
  agentName,
  availableAgents,
  showAnnotationsWarning,
  callbackConfig,
  taterMode,
  mobileSettingsOpen,
  gitUser,
  onCallbackFeedback,
  onCallbackApprove,
  onAnnotateExit,
  onAnnotateReset,
  onAnnotateFeedback,
  onAnnotateApprove,
  onFeedback,
  onApprove,
  onAnnotationPanelToggle,
  onAIChatToggle,
  onArchiveCopy,
  onArchiveDone,
  onTaterModeChange,
  onIdentityChange,
  onUIPreferencesChange,
  onOpenSettings,
  onCloseSettings,
  onOpenExport,
  onCopyAgentInstructions,
  onDownloadAnnotations,
  onPrint,
  onCopyShareLink,
  onOpenImport,
  onSaveToObsidian,
  onSaveToBear,
  onSaveToOctarine,
  appVersion,
  updateInfo,
  isWSL,
  agentInstructionsEnabled,
  obsidianConfigured,
  bearConfigured,
  octarineConfigured,
}) => {
  const annotateActions = getAnnotateHeaderActions(hasAnyAnnotations);

  return (
    <header data-app-header="true" className="h-12 flex items-center justify-between px-2 md:px-4 border-b border-border/50 bg-card/50 backdrop-blur-xl sticky top-0 z-[50]">
      <div className="flex items-center gap-2">
        <AppHeaderLogo />
        {htmlSurface && onToggleHtmlTools && (
          <button
            type="button"
            onClick={onToggleHtmlTools}
            className="ml-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded cursor-pointer"
            title={htmlToolsHidden ? 'Show annotation tools' : 'Hide annotation tools'}
          >
            {htmlToolsHidden ? 'Show tools' : 'Hide tools'}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        {/* Bot callback buttons — only shown when ?cb=&ct= params are present */}
        {callbackConfig && !isApiMode && isSharedSession && (
          <>
            <div className="w-px h-5 bg-border/50 mx-1 hidden md:block" />
            <FeedbackButton
              onClick={onCallbackFeedback}
              disabled={isSubmitting || !callbackShareUrlReady}
              isLoading={isSubmitting}
              title="Send"
            />
            <ApproveButton
              onClick={onCallbackApprove}
              disabled={isSubmitting || !callbackShareUrlReady}
              isLoading={isSubmitting}
              title="Approve design and notify bot"
            />
          </>
        )}

        {isApiMode && !linkedDocIsActive && archiveMode && (
          <>
            <button
              onClick={onArchiveCopy}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-all bg-muted text-foreground hover:bg-muted/80 border border-border"
              title="Copy plan content"
            >
              <span className="hidden md:inline">Copy</span>
              <svg className="w-4 h-4 md:hidden" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              onClick={onArchiveDone}
              className="px-2.5 py-1 rounded-md text-xs font-medium transition-all bg-success text-success-foreground hover:opacity-90"
              title="Close archive"
            >
              Done
            </button>
          </>
        )}

        {isApiMode && (!linkedDocIsActive || annotateMode) && !archiveMode && (
          <>
            {annotateMode ? (
              <>
                {/* Clean sessions can be closed without a decision. Once feedback
                    exists, this action becomes Reset and clears it in place. */}
                <Button
                  variant={hasAnyAnnotations ? 'outline' : 'ghost'}
                  className={hasAnyAnnotations ? undefined : 'bg-muted text-muted-foreground hover:bg-muted/80 border border-border'}
                  size="xs"
                  onClick={hasAnyAnnotations ? onAnnotateReset : onAnnotateExit}
                  disabled={isSubmitting || isExiting || hasSubmitted}
                  iconLeft={hasAnyAnnotations ? <RotateCcw className="size-3.5" /> : <X className="size-3.5" />}
                  title={hasAnyAnnotations ? 'Reset — clear pending feedback' : 'Close — end without a decision'}
                >
                  <span className="hidden md:inline">
                    {isExiting ? 'Closing…' : annotateActions.secondary}
                  </span>
                </Button>
                {/* A clean review is approved; feedback changes the same primary
                    action into Submit. */}
                <Button
                  variant={hasSubmitted ? 'ghost' : (hasAnyAnnotations ? 'destructive' : 'success')}
                  className={hasSubmitted ? 'bg-muted text-muted-foreground hover:bg-muted border border-border' : undefined}
                  size="xs"
                  onClick={hasAnyAnnotations ? onAnnotateFeedback : onAnnotateApprove}
                  disabled={isSubmitting || isExiting || hasSubmitted}
                  iconLeft={hasAnyAnnotations ? <Send className="size-3.5" /> : <Check className="size-3.5" />}
                  title={hasAnyAnnotations ? 'Submit — send feedback to the agent' : 'Approve — no changes requested'}
                >
                  <span className="hidden md:inline">
                    {isSubmitting ? (hasAnyAnnotations ? 'Submitting…' : 'Approving…') : annotateActions.primary}
                  </span>
                  <span className="md:hidden">{isSubmitting ? '…' : annotateActions.primary}</span>
                </Button>
              </>
            ) : (
              <FeedbackButton
                onClick={onFeedback}
                disabled={isSubmitting}
                isLoading={isSubmitting}
                label="Send"
                title="Send"
              />
            )}

            {!annotateMode && (
              origin === 'opencode' && !annotateMode && availableAgents.length > 0 ? (
                <ApproveDropdown
                  onApprove={onApprove}
                  agents={availableAgents}
                  disabled={isSubmitting}
                  isLoading={isSubmitting}
                />
              ) : (
                <div className="relative group/approve">
                  <ApproveButton
                    onClick={onApprove}
                    disabled={isSubmitting || (annotateMode && isExiting)}
                    isLoading={isSubmitting}
                    dimmed={!annotateMode && (origin === 'claude-code' || origin === 'gemini-cli') && showAnnotationsWarning}
                    title={annotateMode ? 'Approve — no changes requested' : undefined}
                  />
                  {!annotateMode && (origin === 'claude-code' || origin === 'gemini-cli') && showAnnotationsWarning && (
                    <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-popover border border-border rounded-lg shadow-xl text-xs text-foreground w-56 text-center opacity-0 invisible group-hover/approve:opacity-100 group-hover/approve:visible transition-all pointer-events-none z-50">
                      <div className="absolute bottom-full right-4 border-4 border-transparent border-b-border" />
                      <div className="absolute bottom-full right-4 mt-px border-4 border-transparent border-b-popover" />
                      {agentName} doesn't support feedback on approval. Your feedback won't be seen.
                    </div>
                  )}
                </div>
              )
            )}

            <div className="w-px h-5 bg-border/50 mx-1 hidden md:block" />
          </>
        )}

        {/* Annotations panel toggle */}
        <button
            onClick={onAnnotationPanelToggle}
            className={`relative p-1.5 rounded-md text-xs font-medium transition-all ${
              isPanelOpen
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            title={isPanelOpen ? 'Hide annotations' : 'Show annotations'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            {annotationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground px-0.5">
                {annotationCount > 99 ? '99+' : annotationCount}
              </span>
            )}
          </button>
        {aiAvailable && (
          <button
            onClick={onAIChatToggle}
            className={`relative p-1.5 rounded-md text-xs font-medium transition-all ${
              isAIChatOpen
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            title={isAIChatOpen ? 'Hide AI chat' : 'Show AI chat'}
            aria-label={isAIChatOpen ? 'Hide AI chat' : 'Show AI chat'}
          >
            <SparklesIcon className="w-4 h-4" />
            {aiHasMessages && !isAIChatOpen && (
              <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </button>
        )}

        {/* Settings dialog (controlled, button hidden — opened from PlanHeaderMenu) */}
        <div className="hidden">
          <Settings
            taterMode={taterMode}
            onTaterModeChange={onTaterModeChange}
            onIdentityChange={onIdentityChange}
            origin={origin}
            mode={annotateMode ? 'annotate' : 'plan'}
            onUIPreferencesChange={onUIPreferencesChange}
            externalOpen={mobileSettingsOpen}
            onExternalClose={onCloseSettings}
            gitUser={gitUser}
          />
        </div>

        <PlanHeaderMenu
          appVersion={appVersion}
          updateInfo={updateInfo}
          origin={origin}
          isWSL={isWSL}
          onOpenSettings={onOpenSettings}
          onOpenExport={onOpenExport}
          onCopyAgentInstructions={onCopyAgentInstructions}
          onDownloadAnnotations={onDownloadAnnotations}
          onPrint={onPrint}
          onCopyShareLink={onCopyShareLink}
          onOpenImport={onOpenImport}
          onSaveToObsidian={onSaveToObsidian}
          onSaveToBear={onSaveToBear}
          onSaveToOctarine={onSaveToOctarine}
          sharingEnabled={canShareCurrentSession}
          isApiMode={isApiMode}
          agentInstructionsEnabled={agentInstructionsEnabled}
          obsidianConfigured={obsidianConfigured}
          bearConfigured={bearConfigured}
          octarineConfigured={octarineConfigured}
        />
      </div>
    </header>
  );
});

const AppHeaderLogo = () => (
  <div className="flex items-center gap-2 md:gap-3">
    <a
      href="https://ainotate.ai"
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 md:gap-2 hover:opacity-80 transition-opacity"
    >
      <span className="text-sm font-semibold tracking-tight">Ainotate</span>
    </a>
  </div>
);
