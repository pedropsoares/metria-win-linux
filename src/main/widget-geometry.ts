import type { WidgetPosition } from "../shared/types";

export interface Rect { x: number; y: number; width: number; height: number }

/** Rect of the collapsed window: a short peek pill hugging the screen edge, centred on
 * the widget's own extent — not a sliver running the rail's full length. A full-length
 * strip is visually noisy and, on Linux (where it stays clickable), swallows clicks on
 * the scrollbar of any maximised window along that edge. */
export function collapsedWidgetBounds(expanded: Rect, position: WidgetPosition, thickness: number, peekExtent: number): Rect {
  if (position === "left" || position === "right") {
    const height = Math.min(peekExtent, expanded.height);
    const y = expanded.y + Math.round((expanded.height - height) / 2);
    const x = position === "left" ? expanded.x : expanded.x + expanded.width - thickness;
    return { x, y, width: thickness, height };
  }
  const width = Math.min(peekExtent, expanded.width);
  const x = expanded.x + Math.round((expanded.width - width) / 2);
  const y = position === "top" ? expanded.y : expanded.y + expanded.height - thickness;
  return { x, y, width, height: thickness };
}

/** Cursor-sensitive band: the peek grown by `grab` on every side that isn't the screen
 * edge, so the reveal target isn't pixel-perfect. It never grows past the edge itself. */
export function autoHideHotZone(collapsed: Rect, position: WidgetPosition, grab: number): Rect {
  if (position === "left") return { x: collapsed.x, y: collapsed.y - grab, width: collapsed.width + grab, height: collapsed.height + grab * 2 };
  if (position === "right") return { x: collapsed.x - grab, y: collapsed.y - grab, width: collapsed.width + grab, height: collapsed.height + grab * 2 };
  if (position === "top") return { x: collapsed.x - grab, y: collapsed.y, width: collapsed.width + grab * 2, height: collapsed.height + grab };
  return { x: collapsed.x - grab, y: collapsed.y - grab, width: collapsed.width + grab * 2, height: collapsed.height + grab };
}

/** Grows a rect by `margin` on every side. Used to bridge the gap between the revealed
 * widget and its hover card, so crossing it never reads as the cursor leaving. */
export function inflateRect(rect: Rect, margin: number): Rect {
  return { x: rect.x - margin, y: rect.y - margin, width: rect.width + margin * 2, height: rect.height + margin * 2 };
}

export function pointInRect(point: { x: number; y: number }, rect: Rect): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
}

export function pointInAnyRect(point: { x: number; y: number }, rects: (Rect | undefined)[]): boolean {
  return rects.some((rect) => rect !== undefined && pointInRect(point, rect));
}
