import { describe, expect, it } from "vitest";

import {
  chunkDocument,
  documentToInnovationSubject,
  extractDocumentMetadata,
  processDocument,
} from "../document-extraction.js";
import {
  segmentByTopics,
  transcribeAudio,
  transcriptionToMarkdown,
  transcriptionToSubject,
} from "../transcription.js";

describe("multi-modal document extraction", () => {
  const researchText = `SUSTAINABLE BATTERY SWAPPING FOR URBAN MOBILITY
By Alex Rivera

Abstract
Battery swapping can reduce charging downtime for electric delivery fleets in dense cities.

Introduction
Urban operators need faster turnaround, lower infrastructure cost, and predictable asset availability.

Methods
We analyzed depot operations, route variance, and battery health telemetry across 120 vehicles.

Results
Swapping reduced idle time by 34 percent and improved same-day delivery capacity.

Conclusion
A modular battery platform creates new service and partnership opportunities.`;

  it("chunks documents with overlap and section metadata", () => {
    const chunks = chunkDocument(`${researchText}\n\n${researchText}`, { chunkSize: 180, overlap: 40 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].totalChunks).toBe(chunks.length);
    expect(chunks[1].sectionTitle).toBeTruthy();
    expect(chunks[1].metadata).toMatchObject({ startOffset: expect.any(Number) });
  });

  it("extracts document metadata with rule-based inference", () => {
    const metadata = extractDocumentMetadata(researchText, "battery-study.pdf");

    expect(metadata.title).toContain("SUSTAINABLE BATTERY SWAPPING");
    expect(metadata.author).toBe("Alex Rivera");
    expect(metadata.documentType).toBe("research-paper");
    expect(metadata.wordCount).toBeGreaterThan(20);
    expect(metadata.keyTopics).toContain("Battery");
  });

  it("processes documents end to end and creates an innovation subject", () => {
    const document = processDocument("battery-study.pdf", researchText);
    const subject = documentToInnovationSubject(document);

    expect(document.id).toContain("doc-");
    expect(document.chunks.length).toBeGreaterThan(0);
    expect(document.summary).toContain("research-paper");
    expect(subject).toContain("battery-study.pdf");
    expect(subject).toContain("Topics:");
  });
});

describe("multi-modal transcription", () => {
  const transcriptText = `Alice: We should launch a battery subscription for delivery riders.
Bob: The pilot needs route analytics and battery health monitoring.
Alice: Partnerships with convenience stores could reduce swap friction.
Carol: Let's test pricing, operations, and expansion risks.`;

  it("builds a structured transcription from provided text", async () => {
    const transcript = await transcribeAudio({
      fileName: "mobility-meeting.mp3",
      text: transcriptText,
    });

    expect(transcript.fileName).toBe("mobility-meeting.mp3");
    expect(transcript.durationSeconds).toBeGreaterThan(0);
    expect(transcript.segments.length).toBeGreaterThanOrEqual(4);
    expect(transcript.speakers).toEqual(expect.arrayContaining(["Alice", "Bob", "Carol"]));
    expect(transcript.topics.length).toBeGreaterThan(0);
  });

  it("groups segments by topic and formats transcript exports", async () => {
    const transcript = await transcribeAudio({
      fileName: "mobility-meeting.mp3",
      text: transcriptText,
    });

    const topicGroups = segmentByTopics(transcript);
    const subject = transcriptionToSubject(transcript);
    const markdown = transcriptionToMarkdown(transcript);

    expect(topicGroups.length).toBeGreaterThan(0);
    expect(topicGroups[0].segments.length).toBeGreaterThan(0);
    expect(subject).toContain("Audio Transcript");
    expect(subject).toContain("Speakers:");
    expect(markdown).toContain("# 🎧 Transcript: mobility-meeting.mp3");
    expect(markdown).toContain("## Topics");
    expect(markdown).toContain("Alice");
  });
});
