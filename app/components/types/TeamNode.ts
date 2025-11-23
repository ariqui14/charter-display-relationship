import type { Deliverable } from "./Deliverable";

export type TeamNode = {
  id: string;
  position: { x: number; y: number };
  data: { label: string; deliverables?: Deliverable[] };
  type?: string;
  draggable?: boolean;
  style?: React.CSSProperties;
};