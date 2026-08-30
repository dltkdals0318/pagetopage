let canvas;

let shapes = [];

const shadowPalette = ["#73BFB6", "#E74B70", "#EB8347", "#BD6FC3"];

const SHAPE_COUNT = 14;

const SHAPE_SCALE = 1.5;

const SHAPE_OPACITY = 1;

const GLOW_OPACITY = 0.6;
const GLOW_OPACITY_ACTIVE = 1;

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const SHAPE_TYPES = ["circle", "rect", "ellipse", "semicircle", "cove"];
const RECT_STYLES = ["rounded", "sharp"];

const CIRCLE_RADIUS_RANGE = [60, 175];
const RECT_W_RANGE = [100, 150];
const RECT_H_RANGE = [100, 175];
const ELLIPSE_W_RANGE = [100, 175];
const ELLIPSE_H_RANGE = [100, 150];
const COVE_SIZE_RANGE = [100, 190];
function randomShapeDef() {
  const type = random(SHAPE_TYPES);

  if (type === "circle" || type === "semicircle") {
    return {
      type,
      radius: random(CIRCLE_RADIUS_RANGE[0], CIRCLE_RADIUS_RANGE[1]),
    };
  }

  if (type === "ellipse") {
    return {
      type,
      w: random(ELLIPSE_W_RANGE[0], ELLIPSE_W_RANGE[1]),
      h: random(ELLIPSE_H_RANGE[0], ELLIPSE_H_RANGE[1]),
    };
  }

  if (type === "cove") {
    return {
      type,
      size: random(COVE_SIZE_RANGE[0], COVE_SIZE_RANGE[1]),
      // which corner of the square stays solid — the other three quadrants
      // get carved away by the inscribed-circle cutout
      sx: random([-1, 1]),
      sy: random([-1, 1]),
    };
  }

  return {
    type,
    style: random(RECT_STYLES),
    w: random(RECT_W_RANGE[0], RECT_W_RANGE[1]),
    h: random(RECT_H_RANGE[0], RECT_H_RANGE[1]),
  };
}

// Even color mix: build a bag with each palette color repeated an equal
// number of times (as equal as SHAPE_COUNT allows), then shuffle it, so the
// palette is used in balanced proportions instead of drifting unevenly like
// independent per-shape random picks would.
function balancedShadowIndices(count) {
  const indices = [];
  for (let i = 0; i < count; i++) {
    indices.push(i % shadowPalette.length);
  }
  return shuffle(indices);
}

function cornerRadiiFor(style, w, h) {
  const round = Math.min(w, h) * 0.22;

  switch (style) {
    case "rounded":
      return [round, round, round, round];
    case "sharp":
    default:
      return [0, 0, 0, 0];
  }
}

let draggedShape = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

function setup() {
  canvas = createCanvas(windowWidth, windowHeight);

  pixelDensity(1);

  const container = document.getElementById("intro-canvas");
  if (container) {
    canvas.parent(container);
  } else {
    canvas.position(0, 0);
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.backgroundColor = "#ffffff";
    document.documentElement.style.margin = "0";
    document.documentElement.style.padding = "0";
  }

  canvas.elt.addEventListener("mousedown", onPointerDown);
  canvas.elt.addEventListener("touchstart", onPointerDown, {
    passive: false,
  });
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("touchmove", onPointerMove, { passive: false });
  window.addEventListener("mouseup", onPointerUp);
  window.addEventListener("touchend", onPointerUp);

  createShapes();

  // Nothing here animates on its own — only drag, reset, and resize change
  // what's on screen — so stop the default 60fps loop and redraw on demand.
  noLoop();
}

const SCATTER_ATTEMPTS = 40;
const OVERLAP_ALLOWANCE = 0.5; // fraction of combined half-extents shapes may overlap

function createShapes() {
  // Fully free scatter (no grid): each shape gets a random spot in the area,
  // trying several candidates and keeping the one with the least overlap.
  // Kept a bit inside the canvas edges so shapes don't feel clipped by it.
  const areaW = width * 0.85;
  const areaH = height * 0.62;

  const startX = width / 2 - areaW / 2;
  const startY = height * 0.4 - areaH / 2;

  const shadowIndices = balancedShadowIndices(SHAPE_COUNT);

  for (let i = 0; i < SHAPE_COUNT; i++) {
    const def = randomShapeDef();

    const shape = {
      type: def.type,
      angle: 0,
      shadowColor: shadowPalette[shadowIndices[i]],
      shadowBlur: 18,
    };

    if (def.type === "circle" || def.type === "semicircle") {
      shape.radius = def.radius * SHAPE_SCALE;
    } else if (def.type === "cove") {
      // Square bounding box (w === h) so it reuses the same bounds/overlap
      // math as rect/ellipse below.
      shape.w = def.size * SHAPE_SCALE;
      shape.h = shape.w;
      shape.sx = def.sx;
      shape.sy = def.sy;
    } else {
      shape.w = def.w * SHAPE_SCALE;
      shape.h = def.h * SHAPE_SCALE;
      if (def.type === "rect") {
        shape.radii = cornerRadiiFor(def.style, shape.w, shape.h);
      }
    }

    const half = getHalfExtent(shape);
    const b = getShapeBounds(shape);

    let bestX = width / 2;
    let bestY = height / 2;
    let bestScore = -Infinity;

    for (let attempt = 0; attempt < SCATTER_ATTEMPTS; attempt++) {
      const x = constrain(startX + random(areaW), b.left, width - b.right);
      const y = constrain(startY + random(areaH), b.top, height - b.bottom);

      let score = Infinity;
      for (const other of shapes) {
        const allowed = (half + getHalfExtent(other)) * OVERLAP_ALLOWANCE;
        score = Math.min(score, dist(x, y, other.x, other.y) - allowed);
      }

      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestY = y;
      }

      if (score > 0) break;
    }

    shape.x = bestX;
    shape.y = bestY;

    shapes.push(shape);
  }
}

function resetShapes() {
  shapes = [];
  draggedShape = null;
  createShapes();
  redraw();
}

// ---- pointer / drag handling ----

function getCanvasPoint(clientX, clientY) {
  const rect = canvas.elt.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function eventPoint(e) {
  const point = e.touches && e.touches.length > 0 ? e.touches[0] : e;
  return getCanvasPoint(point.clientX, point.clientY);
}

function onPointerDown(e) {
  const { x, y } = eventPoint(e);
  startDrag(x, y);
  if (draggedShape) {
    if (e.cancelable) e.preventDefault();
    redraw(); // z-order/glow change even before any movement
  }
}

function onPointerMove(e) {
  if (!draggedShape) return;
  const { x, y } = eventPoint(e);
  updateDrag(x, y);
  if (e.cancelable) e.preventDefault();
  redraw();
}

function onPointerUp() {
  if (!draggedShape) return;
  draggedShape = null;
  redraw(); // clear the active-drag glow
}

function startDrag(px, py) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (pointInShape(px, py, shapes[i])) {
      const shape = shapes[i];
      shapes.splice(i, 1);
      shapes.push(shape);

      draggedShape = shape;
      dragOffsetX = px - shape.x;
      dragOffsetY = py - shape.y;
      return;
    }
  }
}

function updateDrag(px, py) {
  const b = getShapeBounds(draggedShape);
  draggedShape.x = constrain(px - dragOffsetX, b.left, width - b.right);
  draggedShape.y = constrain(py - dragOffsetY, b.top, height - b.bottom);
}

// ---- geometry helpers ----

function getHalfExtent(shape) {
  if (shape.type === "circle" || shape.type === "semicircle") {
    return shape.radius;
  }
  return Math.max(shape.w, shape.h) / 2;
}

// Directional bounding box from the shape's center — unlike getHalfExtent,
// this accounts for the semicircle's flat (cut) edge having no extent above
// its center, so it isn't kept away from the canvas edge as if it were a
// full circle.
function getShapeBounds(shape) {
  if (shape.type === "circle") {
    return {
      left: shape.radius,
      right: shape.radius,
      top: shape.radius,
      bottom: shape.radius,
    };
  }
  if (shape.type === "semicircle") {
    return {
      left: shape.radius,
      right: shape.radius,
      top: 0,
      bottom: shape.radius,
    };
  }
  const halfW = shape.w / 2;
  const halfH = shape.h / 2;
  return { left: halfW, right: halfW, top: halfH, bottom: halfH };
}

function pointInShape(px, py, shape) {
  const dx = px - shape.x;
  const dy = py - shape.y;

  if (shape.type === "circle") {
    return dx * dx + dy * dy <= shape.radius * shape.radius;
  }

  const cosA = Math.cos(-shape.angle);
  const sinA = Math.sin(-shape.angle);
  const lx = dx * cosA - dy * sinA;
  const ly = dx * sinA + dy * cosA;

  if (shape.type === "semicircle") {
    return lx * lx + ly * ly <= shape.radius * shape.radius && ly >= 0;
  }

  if (shape.type === "ellipse") {
    const rx = shape.w / 2;
    const ry = shape.h / 2;
    return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
  }

  if (shape.type === "cove") {
    const half = shape.w / 2;
    if (Math.abs(lx) > half || Math.abs(ly) > half) return false;
    // Outside the inscribed-circle cutout (radius = full side, centered on
    // the corner opposite the one that stays solid).
    const ox = -shape.sx * half;
    const oy = -shape.sy * half;
    const ddx = lx - ox;
    const ddy = ly - oy;
    return ddx * ddx + ddy * ddy >= shape.w * shape.w;
  }

  return Math.abs(lx) <= shape.w / 2 && Math.abs(ly) <= shape.h / 2;
}

// ---- drawing ----

function drawSolidShape(shape) {
  if (!shape) return;

  push();
  translate(shape.x, shape.y);
  rotate(shape.angle);
  rectMode(CENTER);
  ellipseMode(CENTER);
  noStroke();
  fill(255, 255 * SHAPE_OPACITY);
  if (shape.type === "circle") {
    ellipse(0, 0, shape.radius * 2, shape.radius * 2);
  } else if (shape.type === "semicircle") {
    arc(0, 0, shape.radius * 2, shape.radius * 2, 0, PI, PIE);
  } else if (shape.type === "ellipse") {
    ellipse(0, 0, shape.w, shape.h);
  } else if (shape.type === "cove") {
    // Square corner left over after cutting out a circle inscribed in the
    // full square (a skateboard-ramp / quarter-pipe profile): two straight
    // edges from the solid corner (c) to its neighbors (a, b), closed off by
    // the cutout's arc, centered on the opposite corner (o).
    const half = shape.w / 2;
    const cx = shape.sx * half;
    const cy = shape.sy * half;
    const ax = shape.sx * half;
    const ay = -shape.sy * half;
    const bx = -shape.sx * half;
    const by = shape.sy * half;
    const ox = -shape.sx * half;
    const oy = -shape.sy * half;

    const angleA = Math.atan2(ay - oy, ax - ox);
    const angleB = Math.atan2(by - oy, bx - ox);
    const anticlockwise =
      ((angleB - angleA + Math.PI * 2) % (Math.PI * 2)) > Math.PI;

    drawingContext.beginPath();
    drawingContext.moveTo(cx, cy);
    drawingContext.lineTo(ax, ay);
    drawingContext.arc(ox, oy, shape.w, angleA, angleB, anticlockwise);
    drawingContext.closePath();
    drawingContext.fill();
  } else {
    const r = shape.radii || [0, 0, 0, 0];
    rect(0, 0, shape.w, shape.h, r[0], r[1], r[2], r[3]);
  }
  pop();
}

function drawShapeWithShadow(shape) {
  if (!shape) return;

  const isDragging = shape === draggedShape;
  const glowOpacity = isDragging ? GLOW_OPACITY_ACTIVE : GLOW_OPACITY;

  drawingContext.save();
  drawingContext.shadowColor = hexToRgba(
    shape.shadowColor || shadowPalette[0],
    glowOpacity,
  );
  drawingContext.shadowBlur = shape.shadowBlur || 18;
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 0;

  drawSolidShape(shape);

  drawingContext.restore();
}

function draw() {
  background(255);
  for (let i = 0; i < shapes.length; i++) {
    drawShapeWithShadow(shapes[i]);
  }
}

function keyPressed() {
  if (key === " ") {
    resetShapes();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  const container = document.getElementById("intro-canvas");
  if (!container) {
    canvas.position(0, 0);
    document.body.style.margin = "0";
    document.body.style.padding = "0";
    document.body.style.backgroundColor = "#ffffff";
    document.documentElement.style.margin = "0";
    document.documentElement.style.padding = "0";
  }

  resetShapes();
}
