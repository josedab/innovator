import { canvasToSvg, type InnovationCanvas } from "./index.js";

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Export the full canvas structure as formatted JSON. */
export function canvasToJson(canvas: InnovationCanvas): string {
  return JSON.stringify(canvas, null, 2);
}

/** Export the canvas as a base64 data URI generated from the SVG rendering. */
export function canvasToPng(canvas: InnovationCanvas): string {
  const svg = canvasToSvg(canvas);
  return `data:image/png;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}

/** Export a canvas as markdown with nodes, edges, and annotations. */
export function canvasToMarkdown(canvas: InnovationCanvas): string {
  const lines: string[] = [
    `# ${escapeMarkdown(canvas.title)}`,
    "",
    `Canvas ID: ${escapeMarkdown(canvas.id)}`,
    `Updated: ${escapeMarkdown(canvas.updatedAt)}`,
    "",
    "## Nodes",
    "",
    "| ID | Type | Title | Description | Position |",
    "| --- | --- | --- | --- | --- |",
    ...canvas.nodes.map(
      (node) =>
        `| ${escapeMarkdown(node.id)} | ${escapeMarkdown(node.type)} | ${escapeMarkdown(node.title)} | ${escapeMarkdown(node.description)} | (${node.position.x}, ${node.position.y}) |`
    ),
    "",
    "## Relationships",
    "",
    "| Source | Target | Type | Label |",
    "| --- | --- | --- | --- |",
    ...canvas.edges.map(
      (edge) =>
        `| ${escapeMarkdown(edge.sourceId)} | ${escapeMarkdown(edge.targetId)} | ${escapeMarkdown(edge.type)} | ${escapeMarkdown(edge.label ?? "")} |`
    ),
  ];

  if (canvas.annotations.length > 0) {
    lines.push(
      "",
      "## Annotations",
      "",
      "| ID | Author | Content | Position |",
      "| --- | --- | --- | --- |",
      ...canvas.annotations.map(
        (annotation) =>
          `| ${escapeMarkdown(annotation.id)} | ${escapeMarkdown(annotation.author ?? "")} | ${escapeMarkdown(annotation.content)} | (${annotation.position.x}, ${annotation.position.y}) |`
      )
    );
  }

  if (canvas.clusters.length > 0) {
    lines.push(
      "",
      "## Clusters",
      "",
      "| ID | Label | Color | Nodes |",
      "| --- | --- | --- | --- |",
      ...canvas.clusters.map(
        (cluster) =>
          `| ${escapeMarkdown(cluster.id)} | ${escapeMarkdown(cluster.label)} | ${escapeMarkdown(cluster.color)} | ${escapeMarkdown(cluster.nodeIds.join(", "))} |`
      )
    );
  }

  return lines.join("\n");
}
