import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { DiffType, VcsSelection } from "./server.js";
import {
	getLastAssistantMessageText,
	getRecentAssistantMessages,
} from "./assistant-message.js";
import {
	getStartupErrorMessage,
	hasPlanBrowserHtml,
	hasReviewBrowserHtml,
	loadAinotateBrowser,
} from "./ainotate-browser-runtime.js";

type AinotateBrowserModule = typeof import("./ainotate-browser.js");

/** Start a plan-review browser session after loading the browser/server graph on demand. */
export function startPlanReviewBrowserSession(
	...args: Parameters<AinotateBrowserModule["startPlanReviewBrowserSession"]>
): ReturnType<AinotateBrowserModule["startPlanReviewBrowserSession"]> {
	return loadAinotateBrowser().then((browser) => browser.startPlanReviewBrowserSession(...args));
}

/** Open a plan review after loading the browser/server graph on demand. */
export function openPlanReviewBrowser(
	...args: Parameters<AinotateBrowserModule["openPlanReviewBrowser"]>
): ReturnType<AinotateBrowserModule["openPlanReviewBrowser"]> {
	return loadAinotateBrowser().then((browser) => browser.openPlanReviewBrowser(...args));
}

/** Start a code-review browser session after loading the browser/server graph on demand. */
export function startCodeReviewBrowserSession(
	...args: Parameters<AinotateBrowserModule["startCodeReviewBrowserSession"]>
): ReturnType<AinotateBrowserModule["startCodeReviewBrowserSession"]> {
	return loadAinotateBrowser().then((browser) => browser.startCodeReviewBrowserSession(...args));
}

/** Open a code review after loading the browser/server graph on demand. */
export function openCodeReview(
	...args: Parameters<AinotateBrowserModule["openCodeReview"]>
): ReturnType<AinotateBrowserModule["openCodeReview"]> {
	return loadAinotateBrowser().then((browser) => browser.openCodeReview(...args));
}

/** Start a markdown-annotation session after loading the browser/server graph on demand. */
export function startMarkdownAnnotationSession(
	...args: Parameters<AinotateBrowserModule["startMarkdownAnnotationSession"]>
): ReturnType<AinotateBrowserModule["startMarkdownAnnotationSession"]> {
	return loadAinotateBrowser().then((browser) => browser.startMarkdownAnnotationSession(...args));
}

/** Open a markdown annotation after loading the browser/server graph on demand. */
export function openMarkdownAnnotation(
	...args: Parameters<AinotateBrowserModule["openMarkdownAnnotation"]>
): ReturnType<AinotateBrowserModule["openMarkdownAnnotation"]> {
	return loadAinotateBrowser().then((browser) => browser.openMarkdownAnnotation(...args));
}

/** Start a last-message annotation session after loading the browser/server graph on demand. */
export function startLastMessageAnnotationSession(
	...args: Parameters<AinotateBrowserModule["startLastMessageAnnotationSession"]>
): ReturnType<AinotateBrowserModule["startLastMessageAnnotationSession"]> {
	return loadAinotateBrowser().then((browser) => browser.startLastMessageAnnotationSession(...args));
}

/** Open a last-message annotation after loading the browser/server graph on demand. */
export function openLastMessageAnnotation(
	...args: Parameters<AinotateBrowserModule["openLastMessageAnnotation"]>
): ReturnType<AinotateBrowserModule["openLastMessageAnnotation"]> {
	return loadAinotateBrowser().then((browser) => browser.openLastMessageAnnotation(...args));
}

/** Open the plan archive after loading the browser/server graph on demand. */
export function openArchiveBrowserAction(
	...args: Parameters<AinotateBrowserModule["openArchiveBrowserAction"]>
): ReturnType<AinotateBrowserModule["openArchiveBrowserAction"]> {
	return loadAinotateBrowser().then((browser) => browser.openArchiveBrowserAction(...args));
}

export const AINOTATE_REQUEST_CHANNEL = "ainotate:request" as const;
export const AINOTATE_REVIEW_RESULT_CHANNEL = "ainotate:review-result" as const;
export const AINOTATE_TIMEOUT_MS = 5_000;

export type AinotateAction =
	| "plan-mode"
	| "plan-review"
	| "review-status"
	| "code-review"
	| "annotate"
	| "annotate-last"
	| "archive";

export interface AinotateHandledResponse<T> {
	status: "handled";
	result: T;
}

export interface AinotateUnavailableResponse {
	status: "unavailable";
	error?: string;
}

export interface AinotateErrorResponse {
	status: "error";
	error: string;
}

export type AinotateResponse<T> =
	| AinotateHandledResponse<T>
	| AinotateUnavailableResponse
	| AinotateErrorResponse;

export interface AinotateRequestBase<A extends AinotateAction, P, R> {
	requestId: string;
	action: A;
	payload: P;
	respond: (response: AinotateResponse<R>) => void;
}

export interface AinotatePlanModePayload {
	mode?: "enter" | "exit" | "toggle" | "status";
}

export interface AinotatePlanModeResult {
	phase: "idle" | "planning" | "executing";
}

export interface AinotatePlanReviewPayload {
	planFilePath?: string;
	planContent: string;
	origin?: string;
}

export interface AinotatePlanReviewStartResult {
	status: "pending";
	reviewId: string;
}

export interface AinotateReviewResultEvent {
	reviewId: string;
	approved: boolean;
	feedback?: string;
	savedPath?: string;
	agentSwitch?: string;
	permissionMode?: string;
}

export interface AinotateReviewStatusPayload {
	reviewId: string;
}

export type AinotateReviewStatusResult =
	| { status: "pending" }
	| ({ status: "completed" } & AinotateReviewResultEvent)
	| { status: "missing" };

export interface AinotateCodeReviewPayload {
	diffType?: DiffType;
	defaultBranch?: string;
	vcsType?: VcsSelection;
	useLocal?: boolean;
	cwd?: string;
	prUrl?: string;
}

export interface AinotateCodeReviewResult {
	approved: boolean;
	feedback?: string;
	annotations?: unknown[];
	agentSwitch?: string;
}

export interface AinotateAnnotatePayload {
	filePath: string;
	markdown?: string;
	mode?: "annotate" | "annotate-folder" | "annotate-last";
	folderPath?: string;
	/** Enable review-gate UX (Approve / Annotate / Close). */
	gate?: boolean;
}

export interface AinotateAnnotationResult {
	feedback: string;
	/** True when the reviewer closed the session without providing feedback. */
	exit?: boolean;
	/** True when the reviewer clicked Approve in review-gate mode. */
	approved?: boolean;
}

export interface AinotateArchivePayload {
	customPlanPath?: string;
}

export interface AinotateArchiveResult {
	opened: boolean;
}

export type AinotateRequestMap = {
	"plan-mode": AinotateRequestBase<"plan-mode", AinotatePlanModePayload, AinotatePlanModeResult>;
	"plan-review": AinotateRequestBase<"plan-review", AinotatePlanReviewPayload, AinotatePlanReviewStartResult>;
	"review-status": AinotateRequestBase<"review-status", AinotateReviewStatusPayload, AinotateReviewStatusResult>;
	"code-review": AinotateRequestBase<"code-review", AinotateCodeReviewPayload, AinotateCodeReviewResult>;
	annotate: AinotateRequestBase<"annotate", AinotateAnnotatePayload, AinotateAnnotationResult>;
	"annotate-last": AinotateRequestBase<"annotate-last", AinotateAnnotatePayload, AinotateAnnotationResult>;
	archive: AinotateRequestBase<"archive", AinotateArchivePayload, AinotateArchiveResult>;
};
export type AinotateRequest = AinotateRequestMap[AinotateAction];
export type AinotateResponseMap = {
	"plan-mode": AinotateResponse<AinotatePlanModeResult>;
	"plan-review": AinotateResponse<AinotatePlanReviewStartResult>;
	"review-status": AinotateResponse<AinotateReviewStatusResult>;
	"code-review": AinotateResponse<AinotateCodeReviewResult>;
	annotate: AinotateResponse<AinotateAnnotationResult>;
	"annotate-last": AinotateResponse<AinotateAnnotationResult>;
	archive: AinotateResponse<AinotateArchiveResult>;
};
function isAinotateAction(value: unknown): value is AinotateAction {
	return (
		value === "plan-mode" ||
		value === "plan-review" ||
		value === "review-status" ||
		value === "code-review" ||
		value === "annotate" ||
		value === "annotate-last" ||
		value === "archive"
	);
}

const REVIEW_STATUS_PATH = join(homedir(), ".pi", "ainotate-review-status.json");

type StoredReviewStatus = Record<string, AinotateReviewStatusResult>;

function readStoredReviewStatuses(): StoredReviewStatus {
	try {
		if (!existsSync(REVIEW_STATUS_PATH)) return {};
		const raw = readFileSync(REVIEW_STATUS_PATH, "utf-8");
		const parsed = JSON.parse(raw) as StoredReviewStatus;
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}

function writeStoredReviewStatuses(statuses: StoredReviewStatus): void {
	mkdirSync(dirname(REVIEW_STATUS_PATH), { recursive: true });
	writeFileSync(REVIEW_STATUS_PATH, JSON.stringify(statuses, null, 2));
}

function setStoredReviewStatus(reviewId: string, status: AinotateReviewStatusResult): void {
	const statuses = readStoredReviewStatuses();
	statuses[reviewId] = status;
	writeStoredReviewStatuses(statuses);
}

function getStoredReviewStatus(reviewId: string): AinotateReviewStatusResult {
	return readStoredReviewStatuses()[reviewId] ?? { status: "missing" };
}

function createActiveSessionContext() {
	let currentCtx: ExtensionContext | undefined;

	return {
		set(ctx: ExtensionContext): void {
			currentCtx = ctx;
		},
		clear(): void {
			currentCtx = undefined;
		},
		get(): ExtensionContext | undefined {
			return currentCtx;
		},
	};
}

export interface AinotateEventListenerOptions {
	handlePlanMode?: (
		mode: NonNullable<AinotatePlanModePayload["mode"]>,
		ctx: ExtensionContext,
	) => Promise<AinotatePlanModeResult> | AinotatePlanModeResult;
}

export function registerAinotateEventListeners(
	pi: ExtensionAPI,
	options: AinotateEventListenerOptions = {},
): void {
	const activeSessionContext = createActiveSessionContext();

	// Ainotate event requests are handled against the latest active session.
	// The active context is intentionally session-scoped and replaced on each session_start.
	pi.on("session_start", async (_event, ctx) => {
		activeSessionContext.set(ctx);
	});
	pi.events.on(AINOTATE_REQUEST_CHANNEL, async (data) => {
		const request = data as Partial<AinotateRequest> | null;
		const ctx = activeSessionContext.get();

		if (!request || typeof request.respond !== "function" || !isAinotateAction(request.action)) {
			return;
		}

		try {
			if (request.action === "review-status") {
				const reviewId = request.payload?.reviewId;
				if (typeof reviewId !== "string" || !reviewId.trim()) {
					request.respond({ status: "error", error: "Missing reviewId for review-status request." });
					return;
				}
				request.respond({ status: "handled", result: getStoredReviewStatus(reviewId) });
				return;
			}

			if (!ctx) {
				request.respond({ status: "unavailable", error: "Ainotate context is not ready yet." });
				return;
			}

			switch (request.action) {
				case "plan-mode": {
					if (!options.handlePlanMode) {
						request.respond({ status: "unavailable", error: "Plan mode control is not available in this session." });
						return;
					}
					const mode = request.payload?.mode ?? "toggle";
					if (mode !== "enter" && mode !== "exit" && mode !== "toggle" && mode !== "status") {
						request.respond({ status: "error", error: "Invalid plan-mode payload.mode." });
						return;
					}
					const result = await options.handlePlanMode(mode, ctx);
					request.respond({ status: "handled", result });
					return;
				}
				case "plan-review": {
					const planContent = request.payload?.planContent;
					if (typeof planContent !== "string" || !planContent.trim()) {
						request.respond({ status: "error", error: "Missing planContent for plan-review request." });
						return;
					}
					const session = await startPlanReviewBrowserSession(ctx, planContent);
					setStoredReviewStatus(session.reviewId, { status: "pending" });
					session.onDecision((result) => {
						const reviewResult = {
							reviewId: session.reviewId,
							approved: result.approved,
							feedback: result.feedback,
							savedPath: result.savedPath,
							agentSwitch: result.agentSwitch,
							permissionMode: result.permissionMode,
						} satisfies AinotateReviewResultEvent;
						setStoredReviewStatus(session.reviewId, { status: "completed", ...reviewResult });
						pi.events.emit(AINOTATE_REVIEW_RESULT_CHANNEL, reviewResult);
					});
					request.respond({
						status: "handled",
						result: {
							status: "pending",
							reviewId: session.reviewId,
						},
					});
					return;
				}
				case "code-review": {
					const result = await openCodeReview(ctx, {
						cwd: request.payload?.cwd,
						defaultBranch: request.payload?.defaultBranch,
						diffType: request.payload?.diffType,
						vcsType: request.payload?.vcsType,
						useLocal: request.payload?.useLocal,
						prUrl: request.payload?.prUrl,
					});
					request.respond({ status: "handled", result });
					return;
				}
				case "annotate": {
					const payload = request.payload;
					if (!payload?.filePath) {
						request.respond({ status: "error", error: "Missing filePath for annotate request." });
						return;
					}
					const sourceConverted = /\.html?$/i.test(payload.filePath) || /^https?:\/\//i.test(payload.filePath);
					const result = await openMarkdownAnnotation(
						ctx,
						payload.filePath,
						payload.markdown ?? "",
						payload.mode ?? "annotate",
						payload.folderPath,
						undefined,
						sourceConverted,
						payload.gate,
					);
					request.respond({ status: "handled", result });
					return;
				}
				case "annotate-last": {
					const payload = request.payload;
					const usePayloadText = !!payload?.markdown?.trim();
					const lastText = usePayloadText ? payload!.markdown! : getLastAssistantMessageText(ctx);
					if (!lastText) {
						request.respond({ status: "unavailable", error: "No assistant message found in session." });
						return;
					}
					const recent = usePayloadText ? [] : getRecentAssistantMessages(ctx, 25);
					const pickerMessages = recent.length > 1 ? recent : undefined;
					const result = await openLastMessageAnnotation(ctx, lastText, payload?.gate, pickerMessages);
					request.respond({ status: "handled", result });
					return;
				}
				case "archive": {
					const result = await openArchiveBrowserAction(ctx, request.payload?.customPlanPath);
					request.respond({ status: "handled", result });
					return;
				}
			}
		} catch (err) {
			const message = getStartupErrorMessage(err);
			if (/unavailable|not available/i.test(message)) {
				request.respond({ status: "unavailable", error: message });
				return;
			}
			request.respond({ status: "error", error: message });
		}
	});
}

export {
	getLastAssistantMessageText,
	hasPlanBrowserHtml,
	hasReviewBrowserHtml,
	getStartupErrorMessage,
};
