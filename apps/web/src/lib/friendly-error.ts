export interface FriendlyError {
  title: string;
  message: string;
  hint?: string;
}

export function friendlyError(raw: string): FriendlyError {
  const lower = raw.toLowerCase();
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("too many"))
    return {
      title: "Too many requests",
      message: "You're sending requests too quickly. Please wait a moment and try again.",
      hint: "Rate limits reset after 60 seconds.",
    };
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted"))
    return {
      title: "Request timed out",
      message: "The AI took too long to respond. Try a shorter or simpler subject.",
      hint: "Complex topics may need multiple shorter sessions.",
    };
  if (
    lower.includes("401") ||
    lower.includes("unauthorized") ||
    lower.includes("auth") ||
    lower.includes("token")
  )
    return {
      title: "Authentication error",
      message: "Could not authenticate with the AI provider.",
      hint: "Run `gh auth login` and verify your Copilot subscription is active.",
    };
  if (lower.includes("model") && (lower.includes("not found") || lower.includes("not available")))
    return {
      title: "Model unavailable",
      message: "The requested AI model is not available. Try a different model or use the default.",
      hint: "Check INNOVATOR_DEFAULT_MODEL in your .env.local file.",
    };
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("econnrefused"))
    return {
      title: "Network error",
      message: "Could not connect to the server. Check your internet connection.",
      hint: "If running locally, make sure the dev server is running.",
    };
  return {
    title: "Something went wrong",
    message: raw.length > 200 ? raw.slice(0, 200) + "…" : raw,
  };
}
