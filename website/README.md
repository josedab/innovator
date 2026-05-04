# Website

This website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.

## Installation

```bash
npm install
```

## Local Development

```bash
npm start
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

## Build

```bash
npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

## Deployment

Using SSH:

```bash
USE_SSH=true npx docusaurus deploy
```

Not using SSH:

```bash
GIT_USER=<Your GitHub username> npx docusaurus deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.

## Environment Variables

The documentation site uses [Algolia DocSearch](https://docsearch.algolia.com/) for full-text search. Set these environment variables before building for production:

| Variable             | Description                      | Default       |
| -------------------- | -------------------------------- | ------------- |
| `ALGOLIA_APP_ID`     | Algolia application ID           | `PLACEHOLDER` |
| `ALGOLIA_SEARCH_KEY` | Algolia search-only API key      | `PLACEHOLDER` |
| `ALGOLIA_INDEX_NAME` | Algolia index name for this site | `innovator`   |

For local development, the defaults are fine — search will be non-functional but the site will build and run normally. For production, apply for [Algolia DocSearch](https://docsearch.algolia.com/apply/) or configure your own Algolia account and set these variables in your deployment environment.
