/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ShareDialog } from "../ShareDialog";

const defaultProps = {
  sessionId: "test-session-123",
  subject: "Test Subject",
  baseUrl: "https://example.com",
};

describe("ShareDialog", () => {
  it("renders share dialog title", () => {
    render(<ShareDialog {...defaultProps} />);
    expect(screen.getByText("Share Session")).toBeInstanceOf(HTMLHeadingElement);
  });

  it("shows share URL in input field", () => {
    render(<ShareDialog {...defaultProps} />);
    const input = screen.getByDisplayValue("https://example.com/share/test-session-123");
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect((input as HTMLInputElement).readOnly).toBe(true);
  });

  it("copy button exists", () => {
    render(<ShareDialog {...defaultProps} />);
    const copyBtn = screen.getByRole("button", { name: /copy/i });
    expect(copyBtn).toBeInstanceOf(HTMLButtonElement);
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render(<ShareDialog {...defaultProps} onClose={onClose} />);
    const closeBtn = screen.getByLabelText("Close");
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("tab switching works", () => {
    render(<ShareDialog {...defaultProps} />);
    const embedTab = screen.getByRole("button", { name: /embed/i });
    fireEvent.click(embedTab);
    const textarea = screen.getByDisplayValue(/iframe/i);
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
  });

  it("QR code tab shows image", () => {
    render(<ShareDialog {...defaultProps} />);
    const qrTab = screen.getByRole("button", { name: /qr code/i });
    fireEvent.click(qrTab);
    const img = screen.getByAltText(/qr code for test subject/i);
    expect(img).toBeInstanceOf(HTMLImageElement);
  });

  it("social buttons render", () => {
    render(<ShareDialog {...defaultProps} />);
    expect(screen.getByText(/twitter/i)).toBeInstanceOf(HTMLAnchorElement);
    expect(screen.getByText(/linkedin/i)).toBeInstanceOf(HTMLAnchorElement);
    expect(screen.getByText(/email/i)).toBeInstanceOf(HTMLAnchorElement);
  });
});
