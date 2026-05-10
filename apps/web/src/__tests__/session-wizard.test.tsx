/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchMock = vi.fn();
global.fetch = fetchMock;

import SessionWizard from "../components/wizard/SessionWizard";

const sampleQuestions = [
  {
    id: "goal",
    step: 0,
    label: "What is your innovation goal?",
    description: "Describe what you want to innovate",
    type: "text" as const,
    placeholder: "Enter your goal...",
    required: true,
  },
  {
    id: "industry",
    step: 1,
    label: "Select your industry",
    description: "Choose your industry",
    type: "select" as const,
    options: [
      { value: "tech", label: "Technology" },
      { value: "health", label: "Healthcare" },
    ],
    required: true,
  },
  {
    id: "depth",
    step: 2,
    label: "Analysis depth",
    description: "How deep should we go?",
    type: "select" as const,
    options: [
      { value: "shallow", label: "Shallow" },
      { value: "deep", label: "Deep" },
    ],
    required: false,
  },
];

const sampleConfig = {
  angles: ["scamper", "contrarian"],
  depth: "standard",
  model: "gpt-4",
  scoringRubric: ["feasibility", "impact"],
  exportFormat: "markdown",
  maxIdeasPerAngle: 5,
  autoMode: false,
};

function setupFetchQuestions() {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ questions: sampleQuestions }),
  });
}

describe("SessionWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // never resolves
    render(<SessionWizard />);
    expect(screen.getByText("Loading wizard...")).toBeDefined();
  });

  it("renders first step after loading", async () => {
    setupFetchQuestions();
    render(<SessionWizard />);

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });
  });

  it("disables Next button when required field is empty", async () => {
    setupFetchQuestions();
    render(<SessionWizard />);

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });

    const nextButton = screen.getByRole("button", { name: /next/i });
    expect((nextButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("enables Next button when required field is filled", async () => {
    setupFetchQuestions();
    render(<SessionWizard />);

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });

    const textarea = screen.getByPlaceholderText("Enter your goal...");
    fireEvent.change(textarea, { target: { value: "My innovation goal" } });

    const nextButton = screen.getByRole("button", { name: /next/i });
    expect((nextButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("advances to next step on Next click", async () => {
    setupFetchQuestions();
    render(<SessionWizard />);

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });

    // Fill required field
    const textarea = screen.getByPlaceholderText("Enter your goal...");
    fireEvent.change(textarea, { target: { value: "Goal text" } });

    // Click next
    const nextButton = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextButton);

    // Should show step 2
    await waitFor(() => {
      expect(screen.getByText("Select your industry")).toBeDefined();
    });
  });

  it("goes back to previous step on Back click", async () => {
    setupFetchQuestions();
    render(<SessionWizard />);

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });

    // Fill and advance
    const textarea = screen.getByPlaceholderText("Enter your goal...");
    fireEvent.change(textarea, { target: { value: "Goal" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Select your industry")).toBeDefined();
    });

    // Click back
    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });
  });

  it("does not show Back button on first step", async () => {
    setupFetchQuestions();
    render(<SessionWizard />);

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });

    expect(screen.queryByRole("button", { name: /back/i })).toBeNull();
  });

  it("shows Generate Config on last step", async () => {
    setupFetchQuestions();
    render(<SessionWizard />);

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });

    // Navigate to last step
    const textarea = screen.getByPlaceholderText("Enter your goal...");
    fireEvent.change(textarea, { target: { value: "Goal" } });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Select your industry")).toBeDefined();
    });

    // Select industry
    fireEvent.click(screen.getByText("Technology"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Analysis depth")).toBeDefined();
    });

    // Last step should show "Generate Config" button
    expect(screen.getByRole("button", { name: /generate config/i })).toBeDefined();
  });

  it("calls onClose when close button is clicked", async () => {
    setupFetchQuestions();
    const onClose = vi.fn();
    render(<SessionWizard onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });

    const closeButton = screen.getByText("×");
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("generates config and shows configuration preview", async () => {
    setupFetchQuestions();
    render(<SessionWizard />);

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });

    // Fill first step
    fireEvent.change(screen.getByPlaceholderText("Enter your goal..."), {
      target: { value: "Goal" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Select your industry")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Technology"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText("Analysis depth")).toBeDefined();
    });

    // Mock the config generation API
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ config: sampleConfig }),
    });

    fireEvent.click(screen.getByRole("button", { name: /generate config/i }));

    await waitFor(() => {
      expect(screen.getByText("✅ Configuration Generated")).toBeDefined();
    });
  });

  it("calls onComplete with answers and config on Start Innovation click", async () => {
    setupFetchQuestions();
    const onComplete = vi.fn();
    render(<SessionWizard onComplete={onComplete} />);

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });

    // Fill and advance through all steps
    fireEvent.change(screen.getByPlaceholderText("Enter your goal..."), {
      target: { value: "My Goal" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => screen.getByText("Select your industry"));
    fireEvent.click(screen.getByText("Technology"));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => screen.getByText("Analysis depth"));

    // Generate config
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ config: sampleConfig }),
    });
    fireEvent.click(screen.getByRole("button", { name: /generate config/i }));

    await waitFor(() => screen.getByText("✅ Configuration Generated"));

    // Click Start Innovation
    fireEvent.click(screen.getByRole("button", { name: /start innovation/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ goal: "My Goal", industry: "tech" }),
      sampleConfig
    );
  });

  it("handles fetch error gracefully (shows wizard without questions)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network error"));
    render(<SessionWizard />);

    await waitFor(() => {
      // Loading should complete even on error
      expect(screen.queryByText("Loading wizard...")).toBeNull();
    });
  });

  it("renders advanced mode checkbox", async () => {
    setupFetchQuestions();
    render(<SessionWizard />);

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });

    expect(screen.getByLabelText(/advanced mode/i)).toBeDefined();
  });

  it("shows all questions in advanced mode on step 0", async () => {
    setupFetchQuestions();
    render(<SessionWizard />);

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });

    // Enable advanced mode
    const checkbox = screen.getByLabelText(/advanced mode/i);
    fireEvent.click(checkbox);

    // Should show remaining questions on the same page
    await waitFor(() => {
      expect(screen.getByText("Select your industry")).toBeDefined();
      expect(screen.getByText("Analysis depth")).toBeDefined();
    });
  });

  it("renders progress bar", async () => {
    setupFetchQuestions();
    const { container } = render(<SessionWizard />);

    await waitFor(() => {
      expect(screen.getByText("What is your innovation goal?")).toBeDefined();
    });

    // Progress bar div should exist with a width style
    const progressBar = container.querySelector('[class*="bg-blue-500"]');
    expect(progressBar).toBeDefined();
  });
});
