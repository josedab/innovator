import type { InnovationCanvas } from "./types.js";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Export canvas as SVG string. */
export function canvasToSvg(canvas: InnovationCanvas): string {
  const padding = 50;
  const allX = canvas.nodes.map((n) => n.position.x);
  const allY = canvas.nodes.map((n) => n.position.y);
  const minX = Math.min(0, ...allX) - padding;
  const minY = Math.min(0, ...allY) - padding;
  const maxX = Math.max(800, ...canvas.nodes.map((n) => n.position.x + n.size.width)) + padding;
  const maxY = Math.max(600, ...canvas.nodes.map((n) => n.position.y + n.size.height)) + padding;
  const width = maxX - minX;
  const height = maxY - minY;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">`,
    `<style>text { font-family: system-ui, sans-serif; } .node-title { font-weight: 600; font-size: 12px; } .node-desc { font-size: 10px; fill: #666; } .cluster-label { font-size: 14px; font-weight: 700; }</style>`,
  ];

  // Clusters (background)
  for (const cluster of canvas.clusters) {
    parts.push(
      `<rect x="${cluster.position.x}" y="${cluster.position.y}" width="${cluster.size.width}" height="${cluster.size.height}" rx="8" fill="${cluster.color}20" stroke="${cluster.color}" stroke-width="2" />`,
      `<text x="${cluster.position.x + 10}" y="${cluster.position.y + 24}" class="cluster-label" fill="${cluster.color}">${escapeXml(cluster.label)}</text>`
    );
  }

  // Edges
  for (const edge of canvas.edges) {
    const source = canvas.nodes.find((n) => n.id === edge.sourceId);
    const target = canvas.nodes.find((n) => n.id === edge.targetId);
    if (source && target) {
      const sx = source.position.x + source.size.width / 2;
      const sy = source.position.y + source.size.height / 2;
      const tx = target.position.x + target.size.width / 2;
      const ty = target.position.y + target.size.height / 2;
      const dashArray =
        edge.style === "dashed"
          ? ' stroke-dasharray="8,4"'
          : edge.style === "dotted"
            ? ' stroke-dasharray="2,4"'
            : "";
      parts.push(
        `<line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#94a3b8" stroke-width="2"${dashArray} />`
      );
    }
  }

  // Nodes
  for (const node of canvas.nodes) {
    const fill = node.color ?? "#ffffff";
    parts.push(
      `<rect x="${node.position.x}" y="${node.position.y}" width="${node.size.width}" height="${node.size.height}" rx="6" fill="${fill}15" stroke="${fill}" stroke-width="2" />`,
      `<text x="${node.position.x + 8}" y="${node.position.y + 20}" class="node-title" fill="${fill}">${escapeXml(truncate(node.title, 30))}</text>`,
      `<text x="${node.position.x + 8}" y="${node.position.y + 38}" class="node-desc">${escapeXml(truncate(node.description, 50))}</text>`
    );
  }

  // Annotations
  for (const ann of canvas.annotations) {
    parts.push(
      `<rect x="${ann.position.x}" y="${ann.position.y}" width="150" height="80" rx="4" fill="${ann.color}" stroke="#d4a" stroke-width="1" />`,
      `<text x="${ann.position.x + 8}" y="${ann.position.y + 20}" class="node-desc" fill="#333">${escapeXml(truncate(ann.content, 60))}</text>`
    );
  }

  parts.push("</svg>");
  return parts.join("\n");
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
