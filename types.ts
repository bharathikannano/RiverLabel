
export interface Point {
  x: number;
  y: number;
}

export type Polygon = Point[];

export interface RiverData {
  id: string;
  name: string;
  label: string;
  polygon: Polygon;
}

export interface LabelBounds {
  min: Point;
  max: Point;
  center: Point;
  radius: number; // For fast circle-based collision check
}

export interface LabelPlacement {
  center: Point;
  angle: number;
  score: number;
  width: number;
  height: number;
  clearance: number;
  path?: string; // SVG path string for curved text
  bounds?: LabelBounds;
  collisionPoints?: Point[]; // Points on the path that are close to edges
}

export interface LabelingResult {
  placed: LabelPlacement | null;
  candidates: LabelPlacement[];
  centroid: Point;
  bounds: {
    min: Point;
    max: Point;
  };
}
