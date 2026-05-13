/**
 * @description Multi-modal input component with drag-and-drop upload, voice recording,
 * file previews, and extracted context display.
 */
"use client";

import { useState, useRef, useCallback } from "react";

// ---- Types ----

interface UploadedFileState {
  id: string;
  file: File;
  preview?: string;
  status: "pending" | "processing" | "completed" | "failed";
  extractedContext?: string;
  suggestedSubject?: string;
  error?: string;
}

interface ProcessingResultResponse {
  fileId: string;
  type: string;
  extractedContext: string;
  suggestedSubject: string;
  confidence: number;
}

interface MultiModalInputProps {
  onSubjectExtracted?: (subject: string) => void;
  onContextExtracted?: (context: string) => void;
  maxFiles?: number;
  className?: string;
}

// ---- Constants ----

const ACCEPTED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
];

const FILE_TYPE_ICONS: Record<string, string> = {
  image: "🖼️",
  pdf: "📄",
  audio: "🎵",
  document: "📝",
};

const MAX_FILE_SIZE_DISPLAY = {
  image: "10 MB",
  pdf: "25 MB",
  audio: "50 MB",
};

function getFileCategory(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("audio/")) return "audio";
  return "document";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- Component ----

export function MultiModalInput({
  onSubjectExtracted,
  onContextExtracted,
  maxFiles = 5,
  className = "",
}: MultiModalInputProps) {
  const [files, setFiles] = useState<UploadedFileState[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [processingAll, setProcessingAll] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- File handling ----

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const fileArray = Array.from(newFiles).slice(0, maxFiles - files.length);

      const newStates: UploadedFileState[] = fileArray
        .filter((f) => ACCEPTED_TYPES.includes(f.type))
        .map((f) => ({
          id: `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          file: f,
          preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
          status: "pending" as const,
        }));

      setFiles((prev) => [...prev, ...newStates]);
    },
    [files.length, maxFiles]
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) URL.revokeObjectURL(file.preview);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  // ---- Drag and drop ----

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  // ---- Voice recording ----

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `recording-${Date.now()}.webm`, {
          type: "audio/webm",
        });
        addFiles([file]);
        stream.getTracks().forEach((t) => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch {
      // Microphone access denied or unavailable
    }
  }, [addFiles]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setRecordingTime(0);
  }, []);

  // ---- Processing ----

  const processFiles = useCallback(async () => {
    const pending = files.filter((f) => f.status === "pending");
    if (pending.length === 0) return;

    setProcessingAll(true);

    for (const fileState of pending) {
      setFiles((prev) =>
        prev.map((f) => (f.id === fileState.id ? { ...f, status: "processing" as const } : f))
      );

      try {
        const buffer = await fileState.file.arrayBuffer();
        const base64Content = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );

        const response = await fetch("/api/upload/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: [
              {
                id: fileState.id,
                filename: fileState.file.name,
                mimeType: fileState.file.type,
                sizeBytes: fileState.file.size,
                base64Content,
                uploadedAt: new Date().toISOString(),
              },
            ],
          }),
        });

        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`);
        }

        const data = (await response.json()) as {
          results: ProcessingResultResponse[];
        };
        const result = data.results?.[0];

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileState.id
              ? {
                  ...f,
                  status: "completed" as const,
                  extractedContext: result?.extractedContext,
                  suggestedSubject: result?.suggestedSubject,
                }
              : f
          )
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileState.id
              ? {
                  ...f,
                  status: "failed" as const,
                  error: err instanceof Error ? err.message : "Processing failed",
                }
              : f
          )
        );
      }
    }

    setProcessingAll(false);
  }, [files]);

  // ---- Use as subject ----

  const useAsSubject = useCallback(
    (subject: string) => {
      onSubjectExtracted?.(subject);
    },
    [onSubjectExtracted]
  );

  const useAllContext = useCallback(() => {
    const context = files
      .filter((f) => f.extractedContext)
      .map((f) => f.extractedContext)
      .join("\n\n---\n\n");
    onContextExtracted?.(context);
  }, [files, onContextExtracted]);

  // ---- Render ----

  const completedFiles = files.filter((f) => f.status === "completed");

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all
          ${
            isDragOver
              ? "border-purple-500 bg-purple-50 dark:bg-purple-950/20"
              : "border-neutral-300 dark:border-neutral-600 hover:border-purple-400 dark:hover:border-purple-500"
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          onChange={(e) => e.target.files && addFiles(e.target.files)}
          className="hidden"
          aria-label="Upload files"
        />
        <div className="text-4xl mb-2">📁</div>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Drop files here or click to upload
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Images ({MAX_FILE_SIZE_DISPLAY.image}), PDFs ({MAX_FILE_SIZE_DISPLAY.pdf}), Audio (
          {MAX_FILE_SIZE_DISPLAY.audio})
        </p>
      </div>

      {/* Voice recording */}
      <div className="flex items-center gap-3">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`
            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
            ${
              isRecording
                ? "bg-red-500 text-white hover:bg-red-600"
                : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }
          `}
          aria-label={isRecording ? "Stop recording" : "Start voice recording"}
        >
          {isRecording ? "⏹️" : "🎙️"}
          {isRecording ? "Stop Recording" : "Voice Record"}
        </button>

        {isRecording && (
          <div className="flex items-center gap-2">
            {/* Simple waveform visualization */}
            <div className="flex items-center gap-0.5 h-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-red-500 rounded-full animate-pulse"
                  style={{
                    height: `${8 + Math.sin(Date.now() / 200 + i) * 12}px`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                />
              ))}
            </div>
            <span className="text-sm text-red-500 font-mono tabular-nums">
              {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, "0")}
            </span>
          </div>
        )}
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              Files ({files.length})
            </h4>
            <div className="flex gap-2">
              {files.some((f) => f.status === "pending") && (
                <button
                  onClick={processFiles}
                  disabled={processingAll}
                  className="px-3 py-1 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  {processingAll ? "Processing…" : "🔍 Process All"}
                </button>
              )}
              {completedFiles.length > 0 && onContextExtracted && (
                <button
                  onClick={useAllContext}
                  className="px-3 py-1 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
                >
                  📋 Use All Context
                </button>
              )}
            </div>
          </div>

          {files.map((fileState) => {
            const category = getFileCategory(fileState.file.type);
            const icon = FILE_TYPE_ICONS[category] ?? "📎";

            return (
              <div
                key={fileState.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50"
              >
                {/* Preview / Icon */}
                <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center">
                  {fileState.preview ? (
                    <img
                      src={fileState.preview}
                      alt={fileState.file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl">{icon}</span>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                    {fileState.file.name}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {formatFileSize(fileState.file.size)} · {category}
                  </p>

                  {/* Status */}
                  <div className="mt-1">
                    {fileState.status === "pending" && (
                      <span className="text-xs text-neutral-400">Pending</span>
                    )}
                    {fileState.status === "processing" && (
                      <span className="text-xs text-purple-500 animate-pulse">
                        ⏳ Processing…
                      </span>
                    )}
                    {fileState.status === "completed" && (
                      <span className="text-xs text-green-600 dark:text-green-400">
                        ✅ Processed
                      </span>
                    )}
                    {fileState.status === "failed" && (
                      <span className="text-xs text-red-500">
                        ❌ {fileState.error ?? "Failed"}
                      </span>
                    )}
                  </div>

                  {/* Extracted context */}
                  {fileState.extractedContext && (
                    <div className="mt-2 p-2 rounded bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 max-h-24 overflow-y-auto">
                      {fileState.extractedContext.slice(0, 300)}
                      {fileState.extractedContext.length > 300 && "…"}
                    </div>
                  )}

                  {/* Use as subject button */}
                  {fileState.suggestedSubject && onSubjectExtracted && (
                    <button
                      onClick={() => useAsSubject(fileState.suggestedSubject!)}
                      className="mt-2 px-3 py-1 text-xs font-medium rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 transition"
                    >
                      🎯 Use as Investigation Subject
                    </button>
                  )}
                </div>

                {/* Remove button */}
                <button
                  onClick={() => removeFile(fileState.id)}
                  className="flex-shrink-0 p-1 text-neutral-400 hover:text-red-500 transition"
                  aria-label={`Remove ${fileState.file.name}`}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
