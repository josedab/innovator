import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
              <span className="text-2xl">💡</span>
              <span className="text-xl font-bold tracking-tight">Innovator</span>
            </Link>
            <span className="text-sm text-neutral-500 hidden sm:inline">
              AI-Powered Innovation Engine
            </span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-neutral-200 dark:border-neutral-800 py-4">
          <div className="max-w-6xl mx-auto px-4 text-center text-sm text-neutral-500">
            Powered by GitHub Copilot SDK
          </div>
        </footer>
      </body>
    </html>
  );
}
