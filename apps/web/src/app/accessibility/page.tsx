export const metadata = {
  title: "Accessibility Statement — Innovator",
  description: "Innovator's commitment to digital accessibility and WCAG 2.2 AA compliance.",
};

export default function AccessibilityStatementPage() {
  return (
    <main
      id="main-content"
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "2rem 1rem",
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.7,
      }}
    >
      <h1>Accessibility Statement</h1>
      <p>
        <strong>Innovator</strong> is committed to ensuring digital accessibility for people with
        disabilities. We are continually improving the user experience for everyone and applying the
        relevant accessibility standards.
      </p>

      <h2>Conformance Status</h2>
      <p>
        We aim to conform to the{" "}
        <a href="https://www.w3.org/TR/WCAG22/" target="_blank" rel="noopener noreferrer">
          Web Content Accessibility Guidelines (WCAG) 2.2 Level AA
        </a>
        . These guidelines explain how to make web content more accessible to people with a wide
        range of disabilities.
      </p>

      <h2>Accessibility Features</h2>
      <ul>
        <li>
          <strong>Keyboard Navigation:</strong> All interactive elements are reachable and operable
          via keyboard alone. Use <kbd>Tab</kbd> to navigate and <kbd>Enter</kbd>/<kbd>Space</kbd>{" "}
          to activate.
        </li>
        <li>
          <strong>Screen Reader Support:</strong> ARIA landmarks, labels, and live regions provide
          context for assistive technologies. Streaming updates are announced as they occur.
        </li>
        <li>
          <strong>High Contrast Mode:</strong> Increase color contrast for better visibility via the
          accessibility settings panel.
        </li>
        <li>
          <strong>Dyslexia-Friendly Font:</strong> Switch to OpenDyslexic for easier reading.
        </li>
        <li>
          <strong>Reduced Motion:</strong> Honors the <code>prefers-reduced-motion</code> system
          setting and provides a manual toggle to minimize animations.
        </li>
        <li>
          <strong>Large Text:</strong> Increase base font size for improved readability.
        </li>
        <li>
          <strong>Cognitive Load Reduction:</strong> Simplified layouts with a step-by-step wizard
          mode for users who benefit from reduced information density.
        </li>
        <li>
          <strong>Skip Links:</strong> A &ldquo;Skip to main content&rdquo; link is provided for
          keyboard and screen reader users.
        </li>
        <li>
          <strong>Focus Indicators:</strong> Enhanced visible focus outlines on all interactive
          elements.
        </li>
      </ul>

      <h2>Accessing Accessibility Settings</h2>
      <p>
        Click the <strong>accessibility icon</strong> (♿) in the bottom-right corner of any page to
        open the accessibility settings panel. All preferences are saved locally and persist across
        sessions.
      </p>

      <h2>Known Limitations</h2>
      <ul>
        <li>
          Some data visualizations (idea maps, priority matrices) may have limited screen reader
          support. Text alternatives are provided where possible.
        </li>
        <li>Third-party embedded content may not meet our accessibility standards.</li>
      </ul>

      <h2>Feedback</h2>
      <p>
        We welcome your feedback on the accessibility of Innovator. If you encounter barriers or
        have suggestions, please{" "}
        <a
          href="https://github.com/josedab/innovator/issues"
          target="_blank"
          rel="noopener noreferrer"
        >
          open a GitHub issue
        </a>{" "}
        with the label <code>accessibility</code>.
      </p>

      <h2>Assessment Approach</h2>
      <p>
        Innovator assesses accessibility through a combination of automated testing (axe-core),
        manual keyboard testing, and screen reader testing with VoiceOver and NVDA.
      </p>

      <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "2rem" }}>
        This statement was last updated on {new Date().toISOString().slice(0, 10)}.
      </p>
    </main>
  );
}
