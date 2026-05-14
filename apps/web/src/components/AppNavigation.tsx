/**
 * @description Collapsible sidebar navigation linking all application pages.
 * Groups routes into logical categories: Create, Explore, Analyze, Tools.
 */
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Create",
    items: [
      { href: "/", label: "Innovate", icon: "💡" },
      { href: "/workflows", label: "Workflows", icon: "⚙️" },
      { href: "/voice", label: "Voice", icon: "🎙️" },
    ],
  },
  {
    label: "Explore",
    items: [
      { href: "/search", label: "Search", icon: "🔍" },
      { href: "/knowledge-graph", label: "Knowledge Graph", icon: "🕸️" },
      { href: "/replay", label: "Replay", icon: "⏪" },
    ],
  },
  {
    label: "Analyze",
    items: [
      { href: "/analytics", label: "Analytics", icon: "📊" },
      { href: "/dashboard", label: "Dashboard", icon: "📈" },
      { href: "/admin", label: "Admin", icon: "🛡️" },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/playground", label: "API Playground", icon: "🧪" },
      { href: "/micro-apps", label: "Micro Apps", icon: "📦" },
      { href: "/try", label: "Try Online", icon: "🌐" },
    ],
  },
];

const STORAGE_KEY = "innovator-nav-collapsed";

export function AppNavigation() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "false") setCollapsed(false);
    } catch {
      // Ignore
    }
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const navContent = (
    <nav aria-label="Main navigation" className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-neutral-200 dark:border-neutral-800">
        {!collapsed && (
          <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
            Navigation
          </span>
        )}
        <button
          onClick={toggleCollapse}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-neutral-500 hidden md:block"
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-3">
            {!collapsed && (
              <p className="px-3 py-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-2.5 px-3 py-2 mx-1 rounded-lg text-sm transition-colors
                    ${
                      active
                        ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium"
                        : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    }
                    ${collapsed ? "justify-center" : ""}
                  `}
                >
                  <span className="text-base flex-shrink-0" aria-hidden="true">
                    {item.icon}
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-800 p-2">
        <Link
          href="/accessibility"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition ${collapsed ? "justify-center" : ""}`}
        >
          <span aria-hidden="true">♿</span>
          {!collapsed && <span>Accessibility</span>}
        </Link>
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle navigation menu"
        aria-expanded={mobileOpen}
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-sm"
      >
        {mobileOpen ? "✕" : "☰"}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:sticky top-0 left-0 z-40 h-screen
          bg-white dark:bg-neutral-950
          border-r border-neutral-200 dark:border-neutral-800
          transition-all duration-200
          ${collapsed ? "w-14" : "w-52"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {navContent}
      </aside>
    </>
  );
}
