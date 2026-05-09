/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { OnboardingWizard } from "../OnboardingWizard";

describe("OnboardingWizard", () => {
  it("renders welcome screen with Get Started and Skip buttons", () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText("Welcome to Innovator")).toBeInstanceOf(HTMLHeadingElement);
    expect(screen.getByText("Get Started")).toBeInstanceOf(HTMLButtonElement);
    expect(screen.getByText("Skip for now")).toBeInstanceOf(HTMLButtonElement);
  });

  it("calls onSkip when Skip button is clicked", () => {
    const onSkip = vi.fn();
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByText("Skip for now"));
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("advances to step 1 (role selection) when Get Started is clicked", () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByText("Get Started"));
    expect(screen.getByText("What best describes you?")).toBeInstanceOf(HTMLHeadingElement);
    expect(screen.getByText("Developer")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Product Manager")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Executive / Leader")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Researcher")).toBeInstanceOf(HTMLElement);
  });

  it("advances to step 2 (subject selection) when a role is selected", () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByText("Get Started"));
    fireEvent.click(screen.getByText("Developer"));
    expect(screen.getByText("What do you want to innovate on?")).toBeInstanceOf(HTMLHeadingElement);
    expect(screen.getByText("AI-assisted code review")).toBeInstanceOf(HTMLButtonElement);
    expect(screen.getByText("Next")).toBeInstanceOf(HTMLButtonElement);
  });

  it("advances to step 3 when a suggested subject is clicked", () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByText("Get Started"));
    fireEvent.click(screen.getByText("Developer"));
    fireEvent.click(screen.getByText("AI-assisted code review"));
    expect(screen.getByText("Ready to innovate!")).toBeInstanceOf(HTMLHeadingElement);
    expect(screen.getByText(/Launch Innovation Session/)).toBeInstanceOf(HTMLButtonElement);
  });

  it("calls onComplete with profile and session when Launch is clicked", () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard onComplete={onComplete} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByText("Get Started"));
    fireEvent.click(screen.getByText("Developer"));
    fireEvent.click(screen.getByText("AI-assisted code review"));
    fireEvent.click(screen.getByText(/Launch Innovation Session/));

    expect(onComplete).toHaveBeenCalledOnce();
    const [profile, session] = onComplete.mock.calls[0];
    expect(profile).toEqual({
      role: "developer",
      experience: "beginner",
      interests: ["first-principles", "constraints", "cross-domain"],
    });
    expect(session).toEqual({
      subject: "AI-assisted code review",
      angles: ["first-principles", "constraints", "cross-domain"],
    });
  });

  it("Back button on step 1 returns to step 0", () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByText("Get Started"));
    expect(screen.getByText("What best describes you?")).toBeInstanceOf(HTMLHeadingElement);
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Welcome to Innovator")).toBeInstanceOf(HTMLHeadingElement);
  });

  it("Back button on step 2 returns to step 1", () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByText("Get Started"));
    fireEvent.click(screen.getByText("Developer"));
    expect(screen.getByText("What do you want to innovate on?")).toBeInstanceOf(HTMLHeadingElement);
    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("What best describes you?")).toBeInstanceOf(HTMLHeadingElement);
  });
});
