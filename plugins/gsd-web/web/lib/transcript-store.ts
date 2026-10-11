export {
  MAX_TRANSCRIPT_TURNS,
  appendToolSegment,
  applyTextDelta,
  applyThinkingDelta,
  completeTurn,
  createInitialTranscriptState,
  finalizeThinkingStream,
  getFlatTranscript,
  pushPendingUserMessage,
  resetActiveTurn,
  pickTranscriptState,
  type CompletedToolExecution,
  type CompletedTurn,
  type TranscriptState,
  type TurnSegment,
} from "../server/vendor-gsd-core/agent-core/transcript-store.ts"

export {
  applyExtensionUiSnapshotToWebFields,
  createEmptyExtensionUiSnapshot,
  extensionUiSnapshotFromWebFields,
  type ExtensionUiSnapshot,
  type WebExtensionUiFields,
} from "../server/vendor-gsd-core/agent-core/extension-ui-snapshot.ts"
