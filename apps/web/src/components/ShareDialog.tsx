/**
 * @description Share dialog for generating shareable links and configuring access to innovation sessions.
 */
"use client";

import { useState, useCallback } from "react";

interface ShareDialogProps {
  sessionId: string;
  subject: string;
  baseUrl?: string;
  onClose?: () => void;
}

/** Share dialog with copy link, social buttons, embed code, and QR code. */
export function ShareDialog({ sessionId, subject, baseUrl = "", onClose }: ShareDialogProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<"link" | "embed" | "qr">("link");

  const shareUrl = `${baseUrl}/share/${sessionId}`;
  const embedUrl = `${baseUrl}/embed/${sessionId}`;
  const embedCode = `<iframe src="${embedUrl}" width="600" height="400" frameborder="0" style="border:1px solid #e5e5e5;border-radius:8px;" allowfullscreen></iframe>`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}`;

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    }
  }, []);

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`💡 ${subject} — Innovation ideas`)}&url=${encodeURIComponent(shareUrl)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(`Innovation: ${subject}`)}&body=${encodeURIComponent(`Check out this innovation session: ${shareUrl}`)}`;

  const tabs = [
    { id: "link" as const, label: "🔗 Link" },
    { id: "embed" as const, label: "📋 Embed" },
    { id: "qr" as const, label: "📱 QR Code" },
  ];

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900 max-w-md w-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
          Share Session
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition"
          >
            ✕
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-neutral-200 dark:border-neutral-700">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border-b-2 border-indigo-600 text-indigo-600"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Link tab */}
      {tab === "link" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
            />
            <button
              onClick={() => copyToClipboard(shareUrl, "link")}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition"
            >
              {copied === "link" ? "✓ Copied" : "Copy"}
            </button>
          </div>

          <div className="flex gap-2">
            <a
              href={twitterUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-center text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800 transition"
            >
              𝕏 Twitter
            </a>
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-center text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800 transition"
            >
              💼 LinkedIn
            </a>
            <a
              href={emailUrl}
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-center text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800 transition"
            >
              ✉️ Email
            </a>
          </div>
        </div>
      )}

      {/* Embed tab */}
      {tab === "embed" && (
        <div className="space-y-3">
          <textarea
            value={embedCode}
            readOnly
            rows={3}
            className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs font-mono dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
          />
          <button
            onClick={() => copyToClipboard(embedCode, "embed")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition w-full"
          >
            {copied === "embed" ? "✓ Copied" : "Copy Embed Code"}
          </button>
          <p className="text-xs text-neutral-500">
            oEmbed:{" "}
            <code className="bg-neutral-100 px-1 rounded dark:bg-neutral-800">
              /api/oembed?url={shareUrl}
            </code>
          </p>
        </div>
      )}

      {/* QR Code tab */}
      {tab === "qr" && (
        <div className="flex flex-col items-center gap-4">
          <img
            src={qrUrl}
            alt={`QR code for ${subject}`}
            width={200}
            height={200}
            className="rounded-lg border border-neutral-200 dark:border-neutral-700"
          />
          <p className="text-xs text-neutral-500 text-center">
            Scan to open this innovation session
          </p>
          <a
            href={qrUrl}
            download={`innovator-${sessionId}.png`}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800 transition"
          >
            Download QR Code
          </a>
        </div>
      )}
    </div>
  );
}
