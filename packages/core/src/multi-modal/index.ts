/**
 * @module multi-modal
 *
 * Multi-Modal Innovation Input — accepts images (mockups, whiteboard photos),
 * PDFs (research papers), URLs (competitor products), and audio recordings
 * as innovation subjects. Provides parsers, prompt construction, and
 * extended investigate() input types.
 */

export {
  AttachmentTypeSchema,
  AttachmentSchema,
  InvestigationInputSchema,
  ParseResultSchema,
  MultiModalContextSchema,
} from "./types.js";
export type {
  AttachmentType,
  Attachment,
  InvestigationInput,
  ParseResult,
  MultiModalContext,
} from "./types.js";

export {
  validateAttachment,
  parseImage,
  parsePDF,
  parseURL,
  parseAudio,
  parseAttachment,
  buildMultiModalContext,
  buildMultiModalPrompt,
  processMultiModalInput,
} from "./multi-modal.js";

// ---- Batch Processing & Voice Pipeline ----

export {
  type BatchStatus,
  type BatchItem,
  type BatchProgress,
  type BatchResult,
  type BatchConfig,
  type TranscriptionConfig,
  type TranscriptionResult as BatchTranscriptionResult,
  type TranscriptionSegment as BatchTranscriptionSegment,
  processBatch,
  createVoiceAttachment,
  createDocumentAttachment,
  createURLAttachment,
  buildInvestigationInput,
} from "./batch.js";

// ---- Document Extraction ----

export {
  DocumentChunkSchema,
  DocumentMetadataSchema,
  ExtractedDocumentSchema,
  chunkDocument,
  extractDocumentMetadata,
  processDocument,
  documentToInnovationSubject,
} from "./document-extraction.js";
export type { DocumentChunk, DocumentMetadata, ExtractedDocument } from "./document-extraction.js";

// ---- Audio Transcription ----

export {
  TranscriptionSegmentSchema,
  TranscriptionResultSchema,
  TranscriptionProviderSchema,
  transcribeAudio,
  segmentByTopics,
  transcriptionToSubject,
  transcriptionToMarkdown,
} from "./transcription.js";
export type {
  TranscriptionSegment,
  TranscriptionResult,
  TranscriptionProvider,
} from "./transcription.js";

// ---- Extraction Interfaces ----

export {
  ExtractedImageContextSchema,
  ExtractedDocumentContextSchema,
  TranscriptionResultSchema as ExtractorTranscriptionResultSchema,
  EnrichedContextSchema,
  registerImageExtractor,
  registerPDFExtractor,
  registerAudioTranscriber,
  listImageExtractors,
  listPDFExtractors,
  listAudioTranscribers,
  mergeExtractedContexts,
  clearExtractorRegistries,
} from "./extraction-interfaces.js";
export type {
  ImageExtractor,
  PDFExtractor,
  AudioTranscriber,
  ExtractedImageContext,
  ExtractedDocumentContext,
  TranscriptionResult as ExtractorTranscriptionResult,
  EnrichedContext,
} from "./extraction-interfaces.js";

// ---- Vision Model Integration ----

export {
  type VisionAnalysis,
  type WhiteboardSession,
  VisionAnalysisSchema,
  WhiteboardSessionSchema,
  analyzeImage,
  visionToSubject,
  processWhiteboard,
  validateImage,
} from "./vision.js";

// ---- Meeting Workflow ----

export {
  MeetingInputTypeSchema,
  MeetingInputSchema,
  ExtractedTopicSchema,
  MeetingAnalysisSchema,
  VideoFrameSchema,
  analyzeMeeting,
  meetingAnalysisToMarkdown,
  extractKeyFrameTimestamps,
} from "./meeting-workflow.js";
export type {
  MeetingInputType,
  MeetingInput,
  ExtractedTopic,
  MeetingAnalysis,
  VideoFrame,
} from "./meeting-workflow.js";
