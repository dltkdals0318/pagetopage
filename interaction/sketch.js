let canvas;

let shapes = [];

const shadowPalette = ["#73BFB6", "#E74B70", "#EB8347", "#BD6FC3"];

const SHAPE_COUNT = 14;

const SHAPE_SCALE = 1.5;

const SHAPE_OPACITY = 1;

const GLOW_OPACITY = 0.6;
const GLOW_OPACITY_ACTIVE = 1;

const SHADOW_BLUR = 18;

// Shape sizes were tuned on a laptop viewport. On bigger displays (iMac,
// external monitors) they'd look tiny, so ramp the multiplier up with the
// viewport WIDTH — height is an unreliable signal on desktops because browser
// chrome eats a variable chunk of it. Stays at 1x for every MacBook width,
// reaching AUTO_SCALE_MAX at a 27" iMac's 2560 CSS px. SHAPE_MAX_EXTENT_RATIO
// then caps any single shape to a fraction of the short side so the scatter
// grid always has room.
const AUTO_SCALE_BASE_WIDTH = 1800;
const AUTO_SCALE_FULL_WIDTH = 2560;
const AUTO_SCALE_MAX = 2.4;
const SHAPE_MAX_EXTENT_RATIO = 0.3;

const DEBUG = /[?&]debug\b/.test(window.location.search);

function autoScale() {
  const t = constrain(
    (width - AUTO_SCALE_BASE_WIDTH) /
      (AUTO_SCALE_FULL_WIDTH - AUTO_SCALE_BASE_WIDTH),
    0,
    1,
  );
  return lerp(1, AUTO_SCALE_MAX, t);
}

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

  noLoop();
}

// Shapes are kept out of the bottom strip so the fixed footer text stays clear.
const SCATTER_BOTTOM = 0.82;
// How far a shape may wander from its grid-cell centre, as a fraction of the
// cell. Keeps the layout organic without ever letting shapes pile up.
const CELL_JITTER = 0.7;

// A shuffled, jittered grid of positions covering the scatter area. This can't
// collapse the way best-of-N random placement did on large canvases — every
// shape lands in its own cell, so all SHAPE_COUNT stay visible and clickable.
function scatterPositions(count, inset) {
  const areaX = inset;
  const areaY = inset;
  const areaW = width - inset * 2;
  const areaH = height * SCATTER_BOTTOM - inset;

  const cols = Math.max(1, Math.round(Math.sqrt((count * areaW) / areaH)));
  const rows = Math.ceil(count / cols);

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push([c, r]);
  }
  shuffle(cells, true);

  const cellW = areaW / cols;
  const cellH = areaH / rows;

  return cells.slice(0, count).map(([c, r]) => ({
    x: areaX + (c + 0.5) * cellW + random(-0.5, 0.5) * cellW * CELL_JITTER,
    y: areaY + (r + 0.5) * cellH + random(-0.5, 0.5) * cellH * CELL_JITTER,
  }));
}

function createShapes() {
  const shadowIndices = balancedShadowIndices(SHAPE_COUNT);

  const vScale = autoScale();
  const shapeScale = SHAPE_SCALE * vScale;

  const inset = Math.min(width, height) * 0.03;
  const maxExtent = Math.min(width, height) * SHAPE_MAX_EXTENT_RATIO;
  const positions = scatterPositions(SHAPE_COUNT, inset);

  for (let i = 0; i < SHAPE_COUNT; i++) {
    const def = randomShapeDef();

    const shape = {
      type: def.type,
      angle: 0,
      shadowColor: shadowPalette[shadowIndices[i]],
      shadowBlur: SHADOW_BLUR * vScale,
    };

    if (def.type === "circle" || def.type === "semicircle") {
      shape.radius = Math.min(def.radius * shapeScale, maxExtent);
    } else if (def.type === "cove") {
      shape.w = Math.min(def.size * shapeScale, maxExtent * 2);
      shape.h = shape.w;
      shape.sx = def.sx;
      shape.sy = def.sy;
    } else {
      shape.w = Math.min(def.w * shapeScale, maxExtent * 2);
      shape.h = Math.min(def.h * shapeScale, maxExtent * 2);
      if (def.type === "rect") {
        shape.radii = cornerRadiiFor(def.style, shape.w, shape.h);
      }
    }

    const b = getShapeBounds(shape);

    // Pull the cell position in so the whole shape stays on-canvas, above the
    // footer. The extent cap above guarantees lo < hi on every axis.
    shape.x = constrain(
      positions[i].x,
      b.left + inset,
      width - b.right - inset,
    );
    shape.y = constrain(
      positions[i].y,
      b.top + inset,
      height * SCATTER_BOTTOM - b.bottom,
    );

    shapes.push(shape);
  }
}

function resetShapes() {
  shapes = [];
  draggedShape = null;
  createShapes();
  redraw();
}

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
    redraw();
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
  redraw();
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
    const ox = -shape.sx * half;
    const oy = -shape.sy * half;
    const ddx = lx - ox;
    const ddy = ly - oy;
    return ddx * ddx + ddy * ddy >= shape.w * shape.w;
  }

  return Math.abs(lx) <= shape.w / 2 && Math.abs(ly) <= shape.h / 2;
}

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
      (angleB - angleA + Math.PI * 2) % (Math.PI * 2) > Math.PI;

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
  drawingContext.shadowBlur = shape.shadowBlur || SHADOW_BLUR;
  drawingContext.shadowOffsetX = 0;
  drawingContext.shadowOffsetY = 0;

  drawSolidShape(shape);

  drawingContext.restore();
}

function draw() {
  background(255);
  for (let i = 0; i < shapes.length; i++) {
    try {
      drawShapeWithShadow(shapes[i]);
    } catch (err) {
      if (DEBUG) console.warn("draw failed for shape", i, shapes[i], err);
    }
  }
  if (DEBUG) drawDebug();
}

// Load the page with ?debug to overlay the numbers needed to diagnose
// placement / hit-testing on a specific machine.
function drawDebug() {
  const r = canvas.elt.getBoundingClientRect();
  drawingContext.save();
  drawingContext.shadowColor = "transparent";
  noStroke();
  fill(0);
  textFont("monospace");
  textSize(13);
  const lines = [
    `canvas ${width}x${height}  window ${windowWidth}x${windowHeight}  dpr ${window.devicePixelRatio}`,
    `rect  left ${r.left.toFixed(1)}  top ${r.top.toFixed(1)}  ${r.width.toFixed(1)}x${r.height.toFixed(1)}`,
    `autoScale ${autoScale().toFixed(2)}  shapeScale ${(SHAPE_SCALE * autoScale()).toFixed(2)}  shapes ${shapes.length}`,
  ];
  lines.forEach((t, i) => text(t, 14, 22 + i * 18));
  noFill();
  stroke(255, 0, 0);
  for (const s of shapes) {
    const b = getShapeBounds(s);
    rect(s.x - b.left, s.y - b.top, b.left + b.right, b.top + b.bottom);
  }
  drawingContext.restore();
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
