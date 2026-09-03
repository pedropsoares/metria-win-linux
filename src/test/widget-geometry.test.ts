import test from "node:test";
import assert from "node:assert/strict";
import { autoHideHotZone, collapsedWidgetBounds, inflateRect, pointInAnyRect, pointInRect } from "../main/widget-geometry";

const expandedRight = { x: 1800, y: 100, width: 88, height: 220 };
const expandedLeft = { x: 0, y: 100, width: 88, height: 220 };
const expandedTop = { x: 400, y: 0, width: 220, height: 88 };
const expandedBottom = { x: 400, y: 812, width: 220, height: 88 };

test("collapsedWidgetBounds hugs the edge and centres a short peek on the rail", () => {
  assert.deepEqual(collapsedWidgetBounds(expandedRight, "right", 14, 80), { x: 1874, y: 170, width: 14, height: 80 });
  assert.deepEqual(collapsedWidgetBounds(expandedLeft, "left", 14, 80), { x: 0, y: 170, width: 14, height: 80 });
  assert.deepEqual(collapsedWidgetBounds(expandedTop, "top", 14, 80), { x: 470, y: 0, width: 80, height: 14 });
  assert.deepEqual(collapsedWidgetBounds(expandedBottom, "bottom", 14, 80), { x: 470, y: 886, width: 80, height: 14 });
});

test("collapsedWidgetBounds never grows past a rail shorter than the peek", () => {
  const single = { x: 1800, y: 100, width: 88, height: 76 };
  assert.deepEqual(collapsedWidgetBounds(single, "right", 14, 80), { x: 1874, y: 100, width: 14, height: 76 });
  const shortBar = { x: 400, y: 0, width: 76, height: 88 };
  assert.deepEqual(collapsedWidgetBounds(shortBar, "top", 14, 80), { x: 400, y: 0, width: 76, height: 14 });
});

test("autoHideHotZone grows on every side but the screen edge", () => {
  assert.deepEqual(autoHideHotZone(collapsedWidgetBounds(expandedRight, "right", 14, 80), "right", 6), { x: 1868, y: 164, width: 20, height: 92 });
  assert.deepEqual(autoHideHotZone(collapsedWidgetBounds(expandedLeft, "left", 14, 80), "left", 6), { x: 0, y: 164, width: 20, height: 92 });
  assert.deepEqual(autoHideHotZone(collapsedWidgetBounds(expandedTop, "top", 14, 80), "top", 6), { x: 464, y: 0, width: 92, height: 20 });
  assert.deepEqual(autoHideHotZone(collapsedWidgetBounds(expandedBottom, "bottom", 14, 80), "bottom", 6), { x: 464, y: 880, width: 92, height: 20 });
});

test("inflateRect bridges the gap between the widget and its card", () => {
  // The card sits CARD_SPACING (12) to the left of the widget; with both grown by the
  // keep-open margin the dead strip between them disappears.
  const widget = inflateRect({ x: 1800, y: 100, width: 88, height: 220 }, 12);
  const card = inflateRect({ x: 1472, y: 120, width: 316, height: 180 }, 12);
  assert.deepEqual(widget, { x: 1788, y: 88, width: 112, height: 244 });
  assert.equal(pointInAnyRect({ x: 1794, y: 200 }, [widget, card]), true);
  assert.equal(pointInAnyRect({ x: 1600, y: 500 }, [widget, card]), false);
});

test("pointInRect is inclusive of the near edge and exclusive of the far edge", () => {
  const rect = { x: 10, y: 10, width: 10, height: 10 };
  assert.equal(pointInRect({ x: 10, y: 10 }, rect), true);
  assert.equal(pointInRect({ x: 19, y: 19 }, rect), true);
  assert.equal(pointInRect({ x: 20, y: 10 }, rect), false);
  assert.equal(pointInRect({ x: 9, y: 10 }, rect), false);
});

test("pointInAnyRect matches any rect and skips undefined entries", () => {
  const a = { x: 0, y: 0, width: 5, height: 5 };
  const b = { x: 100, y: 100, width: 5, height: 5 };
  assert.equal(pointInAnyRect({ x: 2, y: 2 }, [undefined, a, b]), true);
  assert.equal(pointInAnyRect({ x: 102, y: 102 }, [a, undefined, b]), true);
  assert.equal(pointInAnyRect({ x: 50, y: 50 }, [a, b, undefined]), false);
});
