/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MultiModalInput } from "../MultiModalInput";

describe("MultiModalInput", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                fileId: "file-1",
                type: "image",
                extractedContext: "A diagram showing system architecture",
                suggestedSubject: "System Architecture",
                confidence: 0.9,
              },
            ],
          }),
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders drop zone with text input", () => {
    render(<MultiModalInput />);
    expect(screen.getByText("Drop files here or click to upload")).toBeInstanceOf(HTMLElement);
  });

  it("renders voice recording button", () => {
    render(<MultiModalInput />);
    expect(screen.getByLabelText("Start voice recording")).toBeInstanceOf(HTMLElement);
  });

  it("renders file upload input", () => {
    render(<MultiModalInput />);
    expect(screen.getByLabelText("Upload files")).toBeInstanceOf(HTMLElement);
  });

  it("adds files via file input change", async () => {
    render(<MultiModalInput />);

    const input = screen.getByLabelText("Upload files") as HTMLInputElement;
    const file = new File(["test content"], "test.png", { type: "image/png" });

    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText("test.png")).toBeInstanceOf(HTMLElement);
    });
  });

  it("removes file when remove button clicked", async () => {
    render(<MultiModalInput />);

    const input = screen.getByLabelText("Upload files") as HTMLInputElement;
    const file = new File(["data"], "removeme.png", { type: "image/png" });

    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText("removeme.png")).toBeInstanceOf(HTMLElement);
    });

    const removeButton = screen.getByLabelText("Remove removeme.png");
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.queryByText("removeme.png")).toBeNull();
    });
  });

  it("calls onSubjectExtracted when subject button is clicked", async () => {
    const onSubjectExtracted = vi.fn();
    render(<MultiModalInput onSubjectExtracted={onSubjectExtracted} />);

    const input = screen.getByLabelText("Upload files") as HTMLInputElement;
    const file = new File(["data"], "photo.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText("photo.png")).toBeInstanceOf(HTMLElement);
    });

    // Click process
    const processButton = screen.getByText("🔍 Process All");
    fireEvent.click(processButton);

    await waitFor(() => {
      expect(screen.getByText(/Processed/)).toBeInstanceOf(HTMLElement);
    });

    const useButton = screen.getByText("🎯 Use as Investigation Subject");
    fireEvent.click(useButton);

    expect(onSubjectExtracted).toHaveBeenCalledWith("System Architecture");
  });

  it("filters out unsupported file types", async () => {
    render(<MultiModalInput />);

    const input = screen.getByLabelText("Upload files") as HTMLInputElement;
    const unsupported = new File(["data"], "script.exe", { type: "application/x-executable" });

    Object.defineProperty(input, "files", { value: [unsupported] });
    fireEvent.change(input);

    // Should not add the unsupported file
    expect(screen.queryByText("script.exe")).toBeNull();
  });

  it("handles processing failure gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Internal Server Error",
      })
    );

    render(<MultiModalInput />);

    const input = screen.getByLabelText("Upload files") as HTMLInputElement;
    const file = new File(["data"], "fail.pdf", { type: "application/pdf" });
    Object.defineProperty(input, "files", { value: [file] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText("fail.pdf")).toBeInstanceOf(HTMLElement);
    });

    fireEvent.click(screen.getByText("🔍 Process All"));

    await waitFor(() => {
      expect(screen.getByText(/Upload failed/)).toBeInstanceOf(HTMLElement);
    });
  });

  it("respects maxFiles limit", async () => {
    render(<MultiModalInput maxFiles={2} />);

    const input = screen.getByLabelText("Upload files") as HTMLInputElement;
    const files = [
      new File(["a"], "a.png", { type: "image/png" }),
      new File(["b"], "b.png", { type: "image/png" }),
      new File(["c"], "c.png", { type: "image/png" }),
    ];

    Object.defineProperty(input, "files", { value: files });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByText("Files (2)")).toBeInstanceOf(HTMLElement);
    });

    // Third file should not appear
    expect(screen.queryByText("c.png")).toBeNull();
  });

  it("applies custom className", () => {
    const { container } = render(<MultiModalInput className="custom-class" />);
    expect(container.firstChild).toHaveProperty("className");
    expect((container.firstChild as HTMLElement).className).toContain("custom-class");
  });
});
