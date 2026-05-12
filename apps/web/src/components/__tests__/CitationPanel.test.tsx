/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CitationPanel from "../CitationPanel";

const sampleCitations = [
  {
    id: "c1",
    sourceId: "s1",
    claim: "AI improves productivity by 40%",
    sourceTitle: "Research Paper",
    sourceUrl: "https://example.com/paper",
    status: "verified" as const,
    confidence: 0.95,
    excerpt: "Studies show a 40% improvement...",
  },
  {
    id: "c2",
    sourceId: "s2",
    claim: "LLMs reduce development time",
    sourceTitle: "Tech Blog",
    status: "unverified" as const,
    confidence: 0.7,
  },
  {
    id: "c3",
    sourceId: "s3",
    claim: "Contradicting claim about costs",
    sourceTitle: "Report",
    status: "contradicted" as const,
    confidence: 0.3,
    excerpt: "Costs actually increased...",
  },
];

const sampleSources = [
  {
    id: "s1",
    type: "url",
    title: "Research Paper",
    url: "https://example.com/paper",
    addedAt: "2025-01-01T00:00:00Z",
  },
  { id: "s2", type: "text", title: "Tech Blog", addedAt: "2025-01-02T00:00:00Z" },
];

describe("CitationPanel Component", () => {
  it("renders citations tab by default", () => {
    render(<CitationPanel sessionId="test" citations={sampleCitations} sources={sampleSources} />);
    expect(screen.getByText(/Citations \(3\)/)).not.toBeNull();
    expect(screen.getByText("AI improves productivity by 40%")).not.toBeNull();
  });

  it("shows citation stats bar with counts", () => {
    render(<CitationPanel sessionId="test" citations={sampleCitations} sources={sampleSources} />);
    expect(screen.getByText("1 verified")).not.toBeNull();
    expect(screen.getByText("1 unverified")).not.toBeNull();
    expect(screen.getByText("1 contradicted")).not.toBeNull();
  });

  it("switches to sources tab", () => {
    render(<CitationPanel sessionId="test" citations={sampleCitations} sources={sampleSources} />);
    fireEvent.click(screen.getByText(/Sources \(2\)/));
    expect(screen.getByText("Research Paper")).not.toBeNull();
    expect(screen.getByText("Tech Blog")).not.toBeNull();
    expect(screen.getByText("➕ Add Source")).not.toBeNull();
  });

  it("expands and collapses citation details", () => {
    render(<CitationPanel sessionId="test" citations={sampleCitations} sources={sampleSources} />);
    const detailsButtons = screen.getAllByText("Details");
    expect(detailsButtons.length).toBeGreaterThanOrEqual(1);

    // Expand first citation
    fireEvent.click(detailsButtons[0]);
    expect(screen.getByText(/Studies show a 40% improvement/)).not.toBeNull();
    expect(screen.getByText("Hide")).not.toBeNull();

    // Collapse
    fireEvent.click(screen.getByText("Hide"));
    expect(screen.queryByText(/Studies show a 40% improvement/)).toBeNull();
  });

  it("calls onVerify when verify button is clicked", () => {
    const onVerify = vi.fn();
    render(
      <CitationPanel
        sessionId="test"
        citations={sampleCitations}
        sources={sampleSources}
        onVerify={onVerify}
      />
    );
    const verifyButtons = screen.getAllByText("Verify");
    fireEvent.click(verifyButtons[0]);
    expect(onVerify).toHaveBeenCalledWith("c1");
  });

  it("shows empty state when no citations", () => {
    render(<CitationPanel sessionId="test" citations={[]} sources={sampleSources} />);
    expect(screen.getByText(/No citations yet/)).not.toBeNull();
  });

  it("add source form requires title and content", () => {
    const onAddSource = vi.fn();
    render(
      <CitationPanel
        sessionId="test"
        citations={sampleCitations}
        sources={sampleSources}
        onAddSource={onAddSource}
      />
    );

    // Switch to sources tab
    fireEvent.click(screen.getByText(/Sources \(/));

    // Add Source button should be disabled
    const addButton = screen.getByText("Add Source");
    expect(addButton).toHaveProperty("disabled", true);

    // Click does nothing when disabled
    fireEvent.click(addButton);
    expect(onAddSource).not.toHaveBeenCalled();
  });

  it("submits source form with title, URL, and content", () => {
    const onAddSource = vi.fn();
    render(
      <CitationPanel
        sessionId="test"
        citations={sampleCitations}
        sources={sampleSources}
        onAddSource={onAddSource}
      />
    );

    fireEvent.click(screen.getByText(/Sources \(/));

    const titleInput = screen.getByPlaceholderText("Source title...");
    const urlInput = screen.getByPlaceholderText("URL (optional)...");
    const contentInput = screen.getByPlaceholderText(/Paste source content/);

    fireEvent.change(titleInput, { target: { value: "New Source" } });
    fireEvent.change(urlInput, { target: { value: "https://new.example.com" } });
    fireEvent.change(contentInput, { target: { value: "Important content" } });

    const addButton = screen.getByText("Add Source");
    expect(addButton).toHaveProperty("disabled", false);
    fireEvent.click(addButton);

    expect(onAddSource).toHaveBeenCalledWith({
      type: "url",
      title: "New Source",
      content: "Important content",
      url: "https://new.example.com",
    });
  });

  it("resets form after submission", () => {
    const onAddSource = vi.fn();
    render(
      <CitationPanel
        sessionId="test"
        citations={sampleCitations}
        sources={sampleSources}
        onAddSource={onAddSource}
      />
    );

    fireEvent.click(screen.getByText(/Sources \(/));

    const titleInput = screen.getByPlaceholderText("Source title...") as HTMLInputElement;
    const contentInput = screen.getByPlaceholderText(/Paste source content/) as HTMLTextAreaElement;

    fireEvent.change(titleInput, { target: { value: "Title" } });
    fireEvent.change(contentInput, { target: { value: "Content" } });
    fireEvent.click(screen.getByText("Add Source"));

    expect(titleInput.value).toBe("");
    expect(contentInput.value).toBe("");
  });

  it("submits source with type 'text' when no URL provided", () => {
    const onAddSource = vi.fn();
    render(
      <CitationPanel
        sessionId="test"
        citations={sampleCitations}
        sources={sampleSources}
        onAddSource={onAddSource}
      />
    );

    fireEvent.click(screen.getByText(/Sources \(/));

    fireEvent.change(screen.getByPlaceholderText("Source title..."), {
      target: { value: "Text Source" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Paste source content/), {
      target: { value: "Some text" },
    });
    fireEvent.click(screen.getByText("Add Source"));

    expect(onAddSource).toHaveBeenCalledWith({
      type: "text",
      title: "Text Source",
      content: "Some text",
      url: undefined,
    });
  });

  it("shows confidence percentage for citations", () => {
    render(<CitationPanel sessionId="test" citations={sampleCitations} sources={sampleSources} />);
    expect(screen.getByText("95% confidence")).not.toBeNull();
    expect(screen.getByText("70% confidence")).not.toBeNull();
  });

  it("shows source URL link when available", () => {
    render(<CitationPanel sessionId="test" citations={sampleCitations} sources={sampleSources} />);
    const links = screen.getAllByText("↗");
    expect(links.length).toBeGreaterThanOrEqual(1);
  });

  it("renders status icons and labels", () => {
    render(<CitationPanel sessionId="test" citations={sampleCitations} sources={sampleSources} />);
    expect(screen.getByText(/✅ Verified/)).not.toBeNull();
    expect(screen.getByText(/❓ Unverified/)).not.toBeNull();
    expect(screen.getByText(/❌ Contradicted/)).not.toBeNull();
  });

  it("does not show contradicted count in stats when zero", () => {
    const citations = [sampleCitations[0], sampleCitations[1]]; // no contradicted
    const { container } = render(
      <CitationPanel sessionId="test" citations={citations} sources={sampleSources} />
    );
    expect(screen.queryByText(/contradicted/)).toBeNull();
  });
});
