export interface CanvasPosition {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

/** A node on the canvas representing an idea. */
export interface CanvasNode {
  id: string;
  type: "idea" | "annotation" | "cluster-label";
  /** Source angle for color-coding. */
  angleId?: string;
  title: string;
  description: string;
  position: CanvasPosition;
  size: CanvasSize;
  /** Color override (hex). */
  color?: string;
  /** Parent cluster ID. */
  clusterId?: string;
  metadata?: Record<string, unknown>;
}

/** An edge connecting two nodes. */
export interface CanvasEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  type: "related" | "enables" | "conflicts" | "derives" | "synergy";
  /** Edge style. */
  style?: "solid" | "dashed" | "dotted";
}

/** A cluster grouping multiple nodes. */
export interface CanvasCluster {
  id: string;
  label: string;
  color: string;
  nodeIds: string[];
  position: CanvasPosition;
  size: CanvasSize;
}

/** An annotation (sticky note) on the canvas. */
export interface CanvasAnnotation {
  id: string;
  content: string;
  position: CanvasPosition;
  color: string;
  author?: string;
  createdAt: string;
}

/** Full canvas state. */
export interface InnovationCanvas {
  id: string;
  title: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  clusters: CanvasCluster[];
  annotations: CanvasAnnotation[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  createdAt: string;
  updatedAt: string;
}
