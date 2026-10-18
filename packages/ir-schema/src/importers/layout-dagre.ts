import dagre from "@dagrejs/dagre";
import type { CanvasLayout, Entity, Relation } from "../types.js";

export const COLOR_PALETTE = ["lime", "coral", "teal", "amber", "violet", "sky"] as const;
export type PaletteColor = (typeof COLOR_PALETTE)[number];

export interface DagreLayoutOptions {
  rankdir?: "LR" | "TB" | "BT" | "RL";
  nodesep?: number;
  ranksep?: number;
  nodeWidth?: number;
  baseNodeHeight?: number;
  fieldRowHeight?: number;
}

export function computeDagreLayout(
  entities: Entity[],
  relations: Relation[],
  options?: DagreLayoutOptions
): CanvasLayout {
  const rankdir = options?.rankdir ?? "LR";
  const nodesep = options?.nodesep ?? 80;
  const ranksep = options?.ranksep ?? 140;
  const defaultWidth = options?.nodeWidth ?? 260;
  const baseHeight = options?.baseNodeHeight ?? 80;
  const rowHeight = options?.fieldRowHeight ?? 28;

  // Handle dagre default or named export compatibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dagreLib: any = dagre.graphlib ? dagre : (dagre as any).default ?? dagre;
  const g = new dagreLib.graphlib.Graph();
  g.setGraph({
    rankdir,
    nodesep,
    ranksep,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const entity of entities) {
    const height = baseHeight + Math.max(1, entity.fields.length) * rowHeight;
    g.setNode(entity.id, {
      width: defaultWidth,
      height,
    });
  }

  for (const rel of relations) {
    if (g.hasNode(rel.fromEntityId) && g.hasNode(rel.toEntityId)) {
      g.setEdge(rel.fromEntityId, rel.toEntityId);
    }
  }

  dagreLib.layout(g);

  const nodes: CanvasLayout["nodes"] = {};

  let minX = Infinity;
  let minY = Infinity;

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]!;
    const nodeData = g.node(entity.id) as { x: number; y: number; width: number; height: number };
    if (nodeData) {
      const x = Math.round(nodeData.x - nodeData.width / 2);
      const y = Math.round(nodeData.y - nodeData.height / 2);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
    }
  }

  const offsetX = minX < 40 ? 40 - minX : 0;
  const offsetY = minY < 40 ? 40 - minY : 0;

  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]!;
    const nodeData = g.node(entity.id) as { x: number; y: number; width: number; height: number };
    const color = COLOR_PALETTE[i % COLOR_PALETTE.length];

    if (nodeData) {
      const x = Math.round(nodeData.x - nodeData.width / 2) + offsetX;
      const y = Math.round(nodeData.y - nodeData.height / 2) + offsetY;
      nodes[entity.id] = {
        x,
        y,
        color,
      };
    } else {
      nodes[entity.id] = {
        x: 40 + i * 300,
        y: 40,
        color,
      };
    }
  }

  return { nodes };
}
