"use client";

import { useState } from "react";

interface SubjectInputProps {
  onSubmit: (subject: string) => void;
  onAutoMode: (subject: string) => void;
}

export function SubjectInput({ onSubmit, onAutoMode }: SubjectInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  };

  const handleAuto = () => {
    const trimmed = value.trim();
    if (trimmed) onAutoMode(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder='e.g., "Code review processes" or "Home automation"'
          className="w-full px-5 py-4 text-lg rounded-xl border-2 border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 transition placeholder:text-neutral-400"
          autoFocus
        />
      </div>
      <div className="flex gap-3 mt-4 justify-center">
        <button
          type="submit"
          disabled={!value.trim()}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          🔍 Investigate
        </button>
        <button
          type="button"
          onClick={handleAuto}
          disabled={!value.trim()}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-pink-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          🚀 Auto Mode
        </button>
      </div>
      <p className="text-center text-sm text-neutral-500 mt-3">
        <strong>Investigate</strong> lets you choose angles •{" "}
        <strong>Auto Mode</strong> runs all angles automatically
      </p>
    </form>
  );
}
