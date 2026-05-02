import { z } from "zod";

/** Schema for the .innovator.theme.json configuration file. */
export const ThemeConfigSchema = z.object({
  /** Organization or brand name. */
  brandName: z.string().max(100).optional(),
  /** URL to custom logo image. */
  logoUrl: z.string().url().optional(),
  /** URL to custom favicon. */
  faviconUrl: z.string().url().optional(),
  /** Color palette using CSS color values. */
  colors: z
    .object({
      primary: z.string().optional(),
      primaryForeground: z.string().optional(),
      secondary: z.string().optional(),
      secondaryForeground: z.string().optional(),
      background: z.string().optional(),
      foreground: z.string().optional(),
      muted: z.string().optional(),
      mutedForeground: z.string().optional(),
      accent: z.string().optional(),
      accentForeground: z.string().optional(),
      destructive: z.string().optional(),
      border: z.string().optional(),
    })
    .optional(),
  /** Font configuration. */
  fonts: z
    .object({
      heading: z.string().optional(),
      body: z.string().optional(),
      mono: z.string().optional(),
    })
    .optional(),
  /** Border radius values. */
  borderRadius: z
    .object({
      sm: z.string().optional(),
      md: z.string().optional(),
      lg: z.string().optional(),
    })
    .optional(),
  /**
   * Preamble text prepended to all LLM prompts.
   * Use for organizational context, constraints, or persona.
   */
  promptPreamble: z.string().max(2000).optional(),
  /** Custom footer text or HTML. */
  footerText: z.string().max(500).optional(),
  /** Custom domain for the deployment. */
  customDomain: z.string().optional(),
});

export type ThemeConfig = z.infer<typeof ThemeConfigSchema>;

/** Default theme configuration. */
export const DEFAULT_THEME: ThemeConfig = {
  brandName: "Innovator",
  colors: {
    primary: "#2563eb",
    primaryForeground: "#ffffff",
    secondary: "#64748b",
    secondaryForeground: "#ffffff",
    background: "#ffffff",
    foreground: "#0f172a",
    muted: "#f1f5f9",
    mutedForeground: "#64748b",
    accent: "#f59e0b",
    accentForeground: "#0f172a",
    destructive: "#ef4444",
    border: "#e2e8f0",
  },
  fonts: {
    heading: "Inter, system-ui, sans-serif",
    body: "Inter, system-ui, sans-serif",
    mono: "JetBrains Mono, monospace",
  },
  borderRadius: {
    sm: "0.25rem",
    md: "0.5rem",
    lg: "0.75rem",
  },
};
