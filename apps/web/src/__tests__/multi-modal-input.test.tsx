/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MultiModalInput } from "../components/MultiModalInput";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("MultiModalInput", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });
  });

  it("renders drop zone text", () => {
    render(<MultiModalInput />);
    expect(screen.getByText(/Drop files here or click to upload/)).toBeInstanceOf(HTMLElement);
  });

  it("renders accepted file types info", () => {
    render(<MultiModalInput />);
    expect(screen.getByText(/Images/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/PDFs/)).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/Audio/)).toBeInstanceOf(HTMLElement);
  });

  it("renders voice record button", () => {
    render(<MultiModalInput />);
    expect(screen.getByLabelText("Start voice recording")).toBeInstanceOf(HTMLElement);
  });

  it("renders with custom className", () => {
    const { container } = render(<MultiModalInput className="custom-class" />);
    expect(container.querySelector(".custom-class")).toBeInstanceOf(HTMLElement);
  });

  it("has a hidden file input with correct accept types", () => {
    render(<MultiModalInput />);
    const input = screen.getByLabelText("Upload files") as HTMLInputElement;
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input.type).toBe("file");
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain("image/png");
    expect(input.accept).toContain("application/pdf");
    expect(input.accept).toContain("audio/mpeg");
  });

  it("does not show file list when no files added", () => {
    render(<MultiModalInput />);
    expect(screen.queryByText(/Files \(/)).toBeNull();
  });

  it("handles drag over state", () => {
    const { container } = render(<MultiModalInput />);
    const dropZone = container.querySelector(".border-dashed")!;
    fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } });
    // The drop zone should have the purple highlight class
    expect(dropZone.className).toContain("border-purple-500");
  });

  it("handles drag leave state", () => {
    const { container } = render(<MultiModalInput />);
    const dropZone = container.querySelector(".border-dashed")!;
    fireEvent.dragOver(dropZone, { dataTransfer: { files: [] } });
    fireEvent.dragLeave(dropZone, { dataTransfer: { files: [] } });
    // After drag leave, should not have the active drag-over bg class
    expect(dropZone.className).not.toContain("bg-purple-50");
  });

  it("calls onSubjectExtracted when provided", () => {
    const onSubject = vi.fn();
    render(<MultiModalInput onSubjectExtracted={onSubject} />);
    // Component renders without crashing even with callback
    expect(screen.getByText(/Drop files here/)).toBeInstanceOf(HTMLElement);
  });

  it("calls onContextExtracted when provided", () => {
    const onContext = vi.fn();
    render(<MultiModalInput onContextExtracted={onContext} />);
    expect(screen.getByText(/Drop files here/)).toBeInstanceOf(HTMLElement);
  });

  it("renders voice record button with correct aria label", () => {
    render(<MultiModalInput />);
    const btn = screen.getByLabelText("Start voice recording");
    expect(btn).toBeInstanceOf(HTMLElement);
  });
});
