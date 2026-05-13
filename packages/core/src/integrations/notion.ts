/**
 * @module integrations/notion
 *
 * Notion integration — sync innovation ideas to a Notion database
 * using the Notion API.
 */

import type { IdeaExportPayload, ExportResult } from "./index.js";

export interface NotionConfig {
  apiToken: string;
  databaseId: string;
  statusProperty?: string;
}

export class NotionIntegration {
  /** Sync a list of ideas to a Notion database. */
  async syncToDatabase(
    ideas: IdeaExportPayload[],
    config: NotionConfig
  ): Promise<ExportResult[]> {
    return Promise.all(ideas.map((idea) => this.createPage(idea, config)));
  }

  /** Build Notion page properties for a single idea. */
  buildDatabaseEntry(
    idea: IdeaExportPayload,
    config: NotionConfig
  ): Record<string, unknown> {
    return {
      parent: { database_id: config.databaseId },
      properties: {
        Name: { title: [{ text: { content: `💡 ${idea.title}` } }] },
        ...(idea.sourceAngle
          ? { "Source Angle": { select: { name: idea.sourceAngle } } }
          : {}),
        ...(idea.priority
          ? { Priority: { select: { name: idea.priority } } }
          : {}),
        ...(config.statusProperty
          ? { [config.statusProperty]: { select: { name: "New" } } }
          : {}),
      },
      children: [
        {
          object: "block",
          type: "heading_2",
          heading_2: { rich_text: [{ text: { content: "Description" } }] },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ text: { content: idea.description } }] },
        },
        {
          object: "block",
          type: "heading_2",
          heading_2: { rich_text: [{ text: { content: "Potential Impact" } }] },
        },
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ text: { content: idea.potentialImpact } }],
          },
        },
        ...(idea.implementationHint
          ? [
              {
                object: "block",
                type: "heading_2",
                heading_2: {
                  rich_text: [{ text: { content: "Implementation" } }],
                },
              },
              {
                object: "block",
                type: "paragraph",
                paragraph: {
                  rich_text: [{ text: { content: idea.implementationHint } }],
                },
              },
            ]
          : []),
      ],
    };
  }

  // ---- Internal ----

  private async createPage(
    idea: IdeaExportPayload,
    config: NotionConfig
  ): Promise<ExportResult> {
    const body = this.buildDatabaseEntry(idea, config);

    try {
      const res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiToken}`,
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        return {
          success: false,
          error: `Notion API error: ${err}`,
          integration: "notion",
        };
      }

      const data = (await res.json()) as { id: string; url: string };
      return {
        success: true,
        externalId: data.id,
        externalUrl: data.url,
        integration: "notion",
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Notion sync failed",
        integration: "notion",
      };
    }
  }
}
