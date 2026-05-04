import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "@/components/accessibility/accessibility.css";
import { SkipLink } from "@/components/accessibility/SkipLink";
import { AccessibilityPanel } from "@/components/accessibility/AccessibilityPanel";
import { AccessibilityProvider } from "@/components/accessibility/AccessibilityProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Innovator — AI-Powered Innovation Engine",
  description: "Explore any subject from multiple innovation angles using AI",
  manifest: "/manifest.json",
  themeColor: "#2563eb",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Innovator",
  },
  openGraph: {
    title: "Innovator — AI-Powered Innovation Engine",
    description:
      "Explore any subject from 8 innovation angles using AI. SCAMPER, First Principles, Cross-Domain, and more.",
    type: "website",
    siteName: "Innovator",
  },
  twitter: {
    card: "summary_large_image",
    title: "Innovator — AI-Powered Innovation Engine",
    description: "AI-powered innovation from 8 creativity angles",
  },
};

/**
 * Root layout for the Innovator web application.
 *
 * Sets up Geist fonts, global metadata (title, description), and the
 * page shell: a header with the Innovator logo, a flex-grow main content
 * area, and a footer. All pages are rendered as children within this layout.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <AccessibilityProvider>
          <SkipLink />
          <header className="border-b border-neutral-200 dark:border-neutral-800" role="banner">
            <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
              <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
                <span className="text-2xl" aria-hidden="true">
                  💡
                </span>
                <span className="text-xl font-bold tracking-tight">Innovator</span>
              </Link>
              <span className="text-sm text-neutral-500 hidden sm:inline">
                AI-Powered Innovation Engine
              </span>
            </div>
          </header>
          <main id="main-content" className="flex-1" role="main">
            {children}
          </main>
          <footer
            className="border-t border-neutral-200 dark:border-neutral-800 py-4"
            role="contentinfo"
          >
            <div className="max-w-6xl mx-auto px-4 text-center text-sm text-neutral-500">
              Powered by GitHub Copilot SDK
            </div>
          </footer>
          <AccessibilityPanel />
        </AccessibilityProvider>
      </body>
    </html>
  );
}
