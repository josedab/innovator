import { describe, expect, it } from "vitest";
import { createPipelineProgressParser, isValidPipelineProgress } from "../auto-mode-sse";

const encoder = new TextEncoder();
const completeProgress = {
  stage: "complete",
  completedAngles: ["scamper"],
  totalAngles: 8,
  angleResults: [{ angleId: "scamper", angleName: "SCAMPER", ideas: [] }],
};

describe("createPipelineProgressParser", () => {
  it("buffers chunks until a double-newline frame boundary", () => {
    const parser = createPipelineProgressParser();
    const frame = `data: ${JSON.stringify(completeProgress)}\n\n`;
    const splitAt = Math.floor(frame.length / 2);

    expect(parser.push(encoder.encode(frame.slice(0, splitAt)))).toEqual([]);
    expect(parser.push(encoder.encode(frame.slice(splitAt)))).toEqual([completeProgress]);
  });

  it("decodes split UTF-8 characters and returns multiple valid frames", () => {
    const parser = createPipelineProgressParser();
    const first = {
      stage: "generating",
      completedAngles: [],
      totalAngles: 8,
      angleResults: [],
      partialIdea: { angleName: "SCAMPER", content: "Idea 💡" },
    };
    const payload = `data: ${JSON.stringify(first)}\n\ndata: ${JSON.stringify(completeProgress)}\n\n`;
    const bytes = encoder.encode(payload);
    const emojiStart = bytes.findIndex((value) => value === 0xf0);

    expect(parser.push(bytes.slice(0, emojiStart + 2))).toEqual([]);
    expect(parser.push(bytes.slice(emojiStart + 2))).toEqual([first, completeProgress]);
  });

  it("accepts only data-space frames and ignores heartbeats and invalid frames", () => {
    const parser = createPipelineProgressParser();
    const payload = [
      ": heartbeat",
      `data:${JSON.stringify(completeProgress)}`,
      "data: not-json",
      'data: {"stage":"generating"}',
      'data: {"stage":"heartbeat","completedAngles":[],"totalAngles":8,"angleResults":[]}',
      `data: ${JSON.stringify(completeProgress)}`,
    ].join("\n\n");

    expect(parser.push(encoder.encode(`${payload}\n\n`))).toEqual([completeProgress]);
  });

  it("keeps a trailing frame buffered when there is no double newline", () => {
    const parser = createPipelineProgressParser();

    expect(parser.push(encoder.encode(`data: ${JSON.stringify(completeProgress)}`))).toEqual([]);
    expect(parser.push(new Uint8Array())).toEqual([]);
  });
});

describe("isValidPipelineProgress", () => {
  it("preserves the current shallow shape validation", () => {
    expect(isValidPipelineProgress(completeProgress)).toBe(true);
    expect(
      isValidPipelineProgress({
        ...completeProgress,
        completedAngles: [123],
        angleResults: ["unvalidated"],
      })
    ).toBe(true);
  });

  it.each([
    null,
    {},
    { ...completeProgress, stage: "heartbeat" },
    { ...completeProgress, completedAngles: null },
    { ...completeProgress, totalAngles: "8" },
    { ...completeProgress, angleResults: null },
  ])("rejects an invalid progress shape", (value) => {
    expect(isValidPipelineProgress(value)).toBe(false);
  });
});
