import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'getting-started',
    'core-concepts',
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/web-app',
        'guides/cli',
        'guides/auto-mode',
        'guides/custom-models',
      ],
    },
    'api-reference',
    'architecture',
    'troubleshooting',
    'contributing',
  ],
};

export default sidebars;
