import { themes as prismThemes } from "prism-react-renderer";
import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";

const config: Config = {
  title: "Innovator",
  tagline: "AI-Powered Innovation Engine — Explore any subject from multiple innovation angles",
  favicon: "img/favicon.ico",

  future: {
    v4: true,
  },

  url: "https://josedab.github.io",
  baseUrl: "/innovator/",

  organizationName: "josedab",
  projectName: "innovator",

  onBrokenLinks: "throw",

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  themes: [],

  presets: [
    [
      "classic",
      {
        docs: {
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/josedab/innovator/tree/main/website/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/innovator-social-card.png",
    colorMode: {
      defaultMode: "light",
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: "Innovator",
      logo: {
        alt: "Innovator Logo",
        src: "img/logo.svg",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Docs",
        },
        {
          to: "/docs/api-reference",
          label: "API",
          position: "left",
        },
        {
          href: "https://github.com/josedab/innovator",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Documentation",
          items: [
            { label: "Getting Started", to: "/docs/getting-started" },
            { label: "Core Concepts", to: "/docs/core-concepts" },
            { label: "API Reference", to: "/docs/api-reference" },
          ],
        },
        {
          title: "Community",
          items: [
            { label: "GitHub Issues", href: "https://github.com/josedab/innovator/issues" },
            { label: "Discussions", href: "https://github.com/josedab/innovator/discussions" },
          ],
        },
        {
          title: "More",
          items: [
            { label: "GitHub", href: "https://github.com/josedab/innovator" },
            { label: "Contributing", to: "/docs/contributing" },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Jose David Baena. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ["bash", "json"],
    },
    algolia: {
      appId: process.env.ALGOLIA_APP_ID ?? "PLACEHOLDER",
      apiKey: process.env.ALGOLIA_SEARCH_KEY ?? "PLACEHOLDER",
      indexName: process.env.ALGOLIA_INDEX_NAME ?? "innovator",
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
