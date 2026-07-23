import {
  canStageFiles,
  detectManagedVcs,
  getVcsContext,
  getVcsDiffFingerprint,
  getVcsFileContentsForDiff,
  runVcsDiff,
  stageFile,
  unstageFile,
} from "./vcs";
import {
  WorkspaceReviewSession,
  type WorkspaceReviewBuildOptions,
} from "@ainotate/shared/review-workspace";

export {
  WorkspaceReviewSession,
  mapRepoDiffTypeToWorkspaceMode,
  mapWorkspaceModeToRepoDiffType,
  resolveWorkspaceInitialDiffType,
  type WorkspaceDiffType,
  type WorkspaceRepoRuntimeState,
  type WorkspaceReviewPromptContext,
} from "@ainotate/shared/review-workspace";

export {
  aggregateWorkspacePatch,
  discoverWorkspaceRepoPaths,
  prefixWorkspacePatchPaths as prefixPatchPaths,
  resolveWorkspaceFilePath,
  type WorkspacePatchAggregate,
} from "@ainotate/shared/review-workspace-node";

export type LocalWorkspaceReview = WorkspaceReviewSession;

const workspaceRuntime = {
  async detectVcsType(cwd?: string) {
    return (await detectManagedVcs(cwd))?.id;
  },
  getVcsContext,
  runVcsDiff,
  getVcsFileContentsForDiff,
  getVcsDiffFingerprint,
  canStageFiles,
  stageFile,
  unstageFile,
};

export async function buildLocalWorkspaceReview(
  root: string,
  options: WorkspaceReviewBuildOptions = {},
): Promise<WorkspaceReviewSession> {
  return WorkspaceReviewSession.create(workspaceRuntime, root, options);
}
