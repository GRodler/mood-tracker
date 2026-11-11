// ─── brain.js ─────────────────────────────────────────────────────────
// Visual habit tracking reward: renders a responsive SVG brain in lateral
// profile (side view, facing right) where each active habit is represented
// by a colored neural pathway. Pathway visibility and thickness scale with
// the habit's current streak.
// Pure rendering on existing habit and streak data (NO new Supabase calls).
// ─────────────────────────────────────────────────────────────────────

// ─── Constants & Configuration ─────────────────────────────────────
// Tweak visibility anchors, stroke widths, and colors here.
const BRAIN_CONFIG = {
  // Streak thresholds (in days)
  STREAK_ZERO: 0,
  STREAK_MIN_ACTIVE: 1,
  STREAK_PRE_AUTO: 65,
  STREAK_AUTOMATIC: 66,   // 66 days: average time for habit automaticity
  STREAK_MAX: 100,        // 100+ days: fully established neural pathway

  // Pathway opacity anchor points (linearly interpolated)
  OPACITY_ZERO: 0.06,       // Ghost path: faint reminder of an inactive habit
  OPACITY_MIN_ACTIVE: 0.10, // Just started (1 day)
  OPACITY_PRE_AUTO: 0.55,   // Growing strength (65 days)
  OPACITY_AUTOMATIC: 0.60,  // Established habit (66 days)
  OPACITY_MAX: 1.0,         // Fully lit (100+ days)

  // Stroke width anchors (in pixels)
  STROKE_WIDTH_MIN: 1.5,
  STROKE_WIDTH_MAX: 3.5,

  // Highlight boost when hovering / tapping a legend item
  STROKE_WIDTH_HIGHLIGHT_BOOST: 1.4,
};

// Fixed palette of distinct, color-blind-friendly colors that look clear
// on both light (#faf9f7) and dark (#26262b) surfaces.
const BRAIN_PALETTE = [
  "#2078E5", // royal blue
  "#2B9A66", // emerald green
  "#E5484D", // coral red
  "#E58B00", // warm amber
  "#8E4EC6", // purple
  "#0E9384", // teal
  "#4F5BD5", // indigo / navy
  "#D6407C", // rose
  "#0091B8", // cyan
  "#D9531E", // vibrant orange
  "#6E56CF", // violet
  "#46A758", // leaf green
];

// SVG XML namespace
const SVG_NS = "http://www.w3.org/2000/svg";

// Hand-drawn closed lateral brain boundary path (viewBox 0 0 440 320).
// Profile facing RIGHT:
// - Frontal lobe on the RIGHT (curving forward)
// - Occipital lobe on the LEFT (posterior bulge)
// - Temporal lobe in lower-middle with Sylvian fissure notch
// - Cerebellum tucked under back-left
// - Brain stem descending slightly toward the back
// - Lumpy, wavy cortex edge
const BRAIN_OUTLINE_PATH = [
  "M 196 295",
  // Up anterior edge of brainstem
  "C 197 270, 203 245, 208 226",
  // Underside of temporal lobe
  "C 216 222, 228 221, 240 220",
  // Temporal lobe gyri bumps (bulging down & forward)
  "C 252 222, 266 218, 276 212",
  "C 288 206, 298 196, 306 182",
  "C 310 174, 308 166, 298 162", // Sylvian notch indenting back
  // Frontal lobe base & anterior pole (facing right, with distinct gyri bumps)
  "C 312 162, 326 160, 338 156",
  "C 350 152, 362 146, 370 138",
  "C 378 130, 382 118, 378 108", // Frontal pole tip
  "C 374 98, 366 90, 356 82",
  // Antero-superior frontal crest
  "C 346 74, 336 68, 322 62",
  "C 310 56, 298 52, 284 48",
  // Superior parietal crest (wavy gyri bumps)
  "C 270 44, 256 42, 240 40",
  "C 224 38, 208 40, 192 44",
  "C 176 48, 160 54, 146 62",
  "C 132 70, 118 80, 106 94",
  // Occipital lobe (posterior bumps)
  "C 94 108, 84 122, 80 138",
  "C 76 154, 80 170, 90 184",
  "C 98 194, 110 202, 122 206", // Occipital base
  // Dip above cerebellum
  "C 118 212, 112 218, 108 226",
  // Cerebellum (tucked in bottom-left, distinct lumpy rounded outline)
  "C 102 236, 106 248, 116 256",
  "C 128 266, 146 268, 162 262",
  "C 174 256, 182 246, 184 235", // Cerebellum to stem junction
  // Down posterior edge of brainstem
  "C 182 250, 178 272, 175 295",
  // Brainstem rounded cut at bottom
  "C 175 301, 196 301, 196 295",
  "Z"
].join(" ");

// Internal anatomical sulci & gyri folds for visual structure in lateral view.
// Light pink, purely decorative, faint (opacity ~0.25-0.35).
const BRAIN_INTERNAL_FOLDS = [
  // Sylvian (lateral) fissure groove
  "M 298 162 C 285 160, 260 155, 235 145 C 215 138, 195 142, 180 152",
  // Superior temporal sulcus
  "M 285 188 C 265 192, 242 190, 222 178 C 205 168, 185 174, 170 185",
  // Central sulcus of Rolando
  "M 240 42 C 238 68, 246 95, 238 120 C 235 132, 240 140, 245 144",
  // Precentral sulcus (frontal)
  "M 284 50 C 280 75, 290 98, 282 125 C 280 135, 288 145, 295 152",
  // Superior frontal sulcus
  "M 356 84 C 335 88, 312 85, 292 92",
  // Inferior frontal sulcus
  "M 368 120 C 350 126, 332 122, 314 130",
  // Postcentral sulcus (parietal)
  "M 192 46 C 196 72, 188 98, 192 122",
  // Intraparietal sulcus
  "M 185 92 C 160 96, 138 108, 118 124",
  // Occipital lateral sulcus
  "M 125 152 C 105 154, 90 162, 85 172",
  // Cerebellar boundary groove
  "M 112 210 C 132 216, 156 225, 182 234",
  // Cerebellar horizontal folia lines
  "M 116 230 C 132 232, 152 235, 172 236",
  "M 112 244 C 128 246, 148 248, 168 246",
  "M 124 256 C 138 258, 152 257, 162 252"
];

// Spatially distributed anchor regions across the lateral profile:
// Frontal, parietal, occipital, temporal, deep central, and cerebellum.
const BRAIN_REGIONS = [
  { x: 345, y: 110, dx: -0.85, dy:  0.35 }, // Frontal pole (anterior)
  { x: 310, y:  75, dx: -0.70, dy:  0.70 }, // Superior frontal
  { x: 330, y: 145, dx: -0.80, dy: -0.35 }, // Prefrontal inferior
  { x: 250, y:  65, dx: -0.35, dy:  0.90 }, // Anterior parietal (crest)
  { x: 195, y:  70, dx:  0.45, dy:  0.85 }, // Posterior parietal
  { x: 140, y:  95, dx:  0.85, dy:  0.50 }, // Upper occipital
  { x:  95, y: 155, dx:  0.95, dy: -0.20 }, // Occipital pole (posterior)
  { x: 285, y: 180, dx: -0.85, dy: -0.50 }, // Temporal pole
  { x: 235, y: 195, dx: -0.35, dy: -0.90 }, // Mid-temporal
  { x: 175, y: 160, dx:  0.70, dy: -0.65 }, // Temporo-occipital junction
  { x: 230, y: 125, dx:  0.75, dy:  0.60 }, // Deep central insula
  { x: 135, y: 240, dx:  0.80, dy: -0.55 }, // Cerebellum
];

// Session-level persistent color cache so existing habits keep their assigned
// color even if another habit is archived or added.
const sessionColorCache = new Map();

// Track current interactive highlight state
let activeHighlightedHabitId = null;

// ─── Pure Functions ────────────────────────────────────────────────

/**
 * 32-bit FNV-1a string hash. Deterministic across all environments.
 * @param {string} str
 * @returns {number} positive integer
 */
function hashString(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/**
 * Mulberry32 PRNG. Produces a deterministic pseudo-random number generator
 * function seeded by a 32-bit integer.
 * @param {number} seed
 * @returns {() => number} returns random floats in [0, 1)
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pure function: converts current streak days into a normalized intensity number in [0, 1].
 *
 * Anchor points:
 * - 0 days    → 0.0 (barely visible ghost path)
 * - 1–65 days → grows smoothly from 0.10 up to 0.55
 * - 66 days   → 0.60 (habit automaticity threshold)
 * - 100+ days → 1.0 (fully established / maximum intensity)
 *
 * @param {number} days
 * @returns {number} number between 0 and 1
 */
function streakToIntensity(days) {
  const d = Math.max(0, Number(days) || 0);

  if (d <= BRAIN_CONFIG.STREAK_ZERO) {
    return 0;
  }
  if (d >= BRAIN_CONFIG.STREAK_MAX) {
    return 1;
  }
  if (d === BRAIN_CONFIG.STREAK_MIN_ACTIVE) {
    return BRAIN_CONFIG.OPACITY_MIN_ACTIVE;
  }
  if (d <= BRAIN_CONFIG.STREAK_PRE_AUTO) {
    const span = BRAIN_CONFIG.STREAK_PRE_AUTO - BRAIN_CONFIG.STREAK_MIN_ACTIVE;
    const progress = (d - BRAIN_CONFIG.STREAK_MIN_ACTIVE) / (span || 1);
    return (
      BRAIN_CONFIG.OPACITY_MIN_ACTIVE +
      progress * (BRAIN_CONFIG.OPACITY_PRE_AUTO - BRAIN_CONFIG.OPACITY_MIN_ACTIVE)
    );
  }
  if (d === BRAIN_CONFIG.STREAK_AUTOMATIC) {
    return BRAIN_CONFIG.OPACITY_AUTOMATIC;
  }

  // 66 to 100 days
  const span = BRAIN_CONFIG.STREAK_MAX - BRAIN_CONFIG.STREAK_AUTOMATIC;
  const progress = (d - BRAIN_CONFIG.STREAK_AUTOMATIC) / (span || 1);
  return (
    BRAIN_CONFIG.OPACITY_AUTOMATIC +
    progress * (BRAIN_CONFIG.OPACITY_MAX - BRAIN_CONFIG.OPACITY_AUTOMATIC)
  );
}

/**
 * Pure function: converts an intensity number t in [0, 1] into styling properties:
 * - opacity: scales from 0.06 (at t=0) up to 1.0 (at t=1.0)
 * - strokeWidth: scales from 1.5 up to 3.5
 * - glow: boolean flag, active ONLY at 100+ days (t >= 1.0)
 *
 * @param {number} t - intensity in [0, 1]
 * @returns {{ opacity: number, strokeWidth: number, glow: boolean }}
 */
function intensityToStyle(t) {
  const clampedT = Math.max(0, Math.min(1, Number(t) || 0));

  let opacity;
  if (clampedT <= 0) {
    opacity = BRAIN_CONFIG.OPACITY_ZERO;
  } else if (clampedT < BRAIN_CONFIG.OPACITY_MIN_ACTIVE) {
    const ratio = clampedT / BRAIN_CONFIG.OPACITY_MIN_ACTIVE;
    opacity =
      BRAIN_CONFIG.OPACITY_ZERO +
      ratio * (BRAIN_CONFIG.OPACITY_MIN_ACTIVE - BRAIN_CONFIG.OPACITY_ZERO);
  } else {
    opacity = clampedT;
  }

  const strokeWidth =
    BRAIN_CONFIG.STROKE_WIDTH_MIN +
    clampedT * (BRAIN_CONFIG.STROKE_WIDTH_MAX - BRAIN_CONFIG.STROKE_WIDTH_MIN);
  const glow = clampedT >= 1.0;

  return {
    opacity: Math.round(opacity * 1000) / 1000,
    strokeWidth: Math.round(strokeWidth * 100) / 100,
    glow,
  };
}

/**
 * Assign each habit a color deterministically from its id hash.
 * If two habits collide on a slot, resolves the collision deterministically
 * using linear probing to the next free slot.
 * Retains assignments in sessionColorCache so archiving one habit never changes
 * the colors of others.
 *
 * @param {Array<{ id: string, name: string }>} habitsList
 * @returns {Map<string, string>} habitId -> hex color
 */
function assignHabitColors(habitsList) {
  const usedColors = new Set();
  const colorMap = new Map();

  // First, preserve any previously cached assignments for currently active habits
  for (const habit of habitsList) {
    if (sessionColorCache.has(habit.id)) {
      const cached = sessionColorCache.get(habit.id);
      usedColors.add(cached);
      colorMap.set(habit.id, cached);
    }
  }

  // Sort habits without cached colors deterministically by id
  const unassigned = habitsList
    .filter(h => !colorMap.has(h.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const habit of unassigned) {
    const hash = hashString(habit.id);
    let slot = hash % BRAIN_PALETTE.length;
    let attempts = 0;

    // Deterministic linear probe
    while (usedColors.has(BRAIN_PALETTE[slot]) && attempts < BRAIN_PALETTE.length) {
      slot = (slot + 1) % BRAIN_PALETTE.length;
      attempts++;
    }

    const assignedColor = BRAIN_PALETTE[slot];
    usedColors.add(assignedColor);
    colorMap.set(habit.id, assignedColor);
    sessionColorCache.set(habit.id, assignedColor);
  }

  return colorMap;
}

// ─── Deterministic Pathway Generation ──────────────────────────────

/**
 * Generate SVG path data and synapse node coordinates deterministically for a habit.
 *
 * @param {string} habitId
 * @param {number} habitIndex
 * @param {number} streak
 * @param {number} totalHabits
 * @returns {{ mainPathD: string, branches: string[], nodes: Array<{x: number, y: number}> }}
 */
function generatePathwayData(habitId, habitIndex, streak, totalHabits) {
  const hash = hashString(habitId);
  const rng = mulberry32(hash);

  // Spread start regions evenly across the lateral lobes
  const regionIndex = (hash + habitIndex) % BRAIN_REGIONS.length;
  const region = BRAIN_REGIONS[regionIndex];

  // Starting coordinates with subtle deterministic jitter
  const x0 = region.x + (rng() - 0.5) * 14;
  const y0 = region.y + (rng() - 0.5) * 14;

  let curX = x0;
  let curY = y0;
  const waypoints = [{ x: curX, y: curY }];
  const segCommands = [];

  // Chain of 3 cubic Bézier segments meandering through the lateral cortex
  const stepCount = 3;
  for (let s = 0; s < stepCount; s++) {
    const stepLength = 32 + rng() * 26;
    const baseAngle = Math.atan2(region.dy, region.dx);
    const angleJitter = (rng() - 0.5) * 1.1;
    const angle = baseAngle + angleJitter;

    const nextX = curX + Math.cos(angle) * stepLength;
    const nextY = curY + Math.sin(angle) * stepLength;

    const ctrl1Dist = stepLength * 0.44;
    const ctrl2Dist = stepLength * 0.44;
    const c1Angle = angle + (rng() - 0.5) * 0.7;
    const c2Angle = angle + (rng() - 0.5) * 0.7;

    const c1x = curX + Math.cos(c1Angle) * ctrl1Dist;
    const c1y = curY + Math.sin(c1Angle) * ctrl1Dist;
    const c2x = nextX - Math.cos(c2Angle) * ctrl2Dist;
    const c2y = nextY - Math.sin(c2Angle) * ctrl2Dist;

    segCommands.push(
      `C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${nextX.toFixed(1)} ${nextY.toFixed(1)}`
    );

    curX = nextX;
    curY = nextY;
    waypoints.push({ x: curX, y: curY });
  }

  const mainPathD = `M ${x0.toFixed(1)} ${y0.toFixed(1)} ${segCommands.join(" ")}`;

  // Side branch count scales with streak
  let branchCount = 1;
  if (streak >= BRAIN_CONFIG.STREAK_AUTOMATIC) {
    branchCount = 3;
  } else if (streak >= 30) {
    branchCount = 2;
  }

  // If there are many active habits, keep drawing clean
  if (totalHabits > 12) {
    branchCount = Math.min(1, branchCount);
  }

  const branches = [];
  const nodes = [];

  // Terminal node of the main trunk
  nodes.push({ x: curX, y: curY, isMainTerminus: true });

  // Generate side branches from intermediate waypoints
  for (let b = 0; b < branchCount; b++) {
    const attachIdx = 1 + (b % 2);
    const basePoint = waypoints[attachIdx] || waypoints[1];

    const branchDirection = b % 2 === 0 ? 1 : -1;
    const branchAngle =
      Math.atan2(region.dy, region.dx) +
      branchDirection * (1.1 + rng() * 0.6);

    const branchLength = 20 + rng() * 24;
    const endX = basePoint.x + Math.cos(branchAngle) * branchLength;
    const endY = basePoint.y + Math.sin(branchAngle) * branchLength;

    const midCtrlX =
      basePoint.x +
      Math.cos(branchAngle) * (branchLength * 0.5) +
      (rng() - 0.5) * 8;
    const midCtrlY =
      basePoint.y +
      Math.sin(branchAngle) * (branchLength * 0.5) +
      (rng() - 0.5) * 8;

    branches.push(
      `M ${basePoint.x.toFixed(1)} ${basePoint.y.toFixed(1)} Q ${midCtrlX.toFixed(1)} ${midCtrlY.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`
    );

    nodes.push({ x: endX, y: endY, isMainTerminus: false });
  }

  return { mainPathD, branches, nodes };
}

// ─── Highlight & Interactivity Helpers ─────────────────────────────

/**
 * Highlight a specific habit's pathway and legend entry, dimming all others.
 * @param {string} habitId
 */
function setHabitHighlight(habitId) {
  activeHighlightedHabitId = habitId;

  const svgWrap = document.getElementById("brain-svg-container");
  const legendWrap = document.getElementById("brain-legend");
  if (!svgWrap || !legendWrap) return;

  svgWrap.classList.add("has-highlight");
  legendWrap.classList.add("has-highlight");

  const allPathwayGroups = svgWrap.querySelectorAll(".neural-pathway-group");
  allPathwayGroups.forEach(g => {
    const isTarget = g.getAttribute("data-habit-id") === habitId;
    g.classList.toggle("is-highlighted", isTarget);
    g.classList.toggle("is-dimmed", !isTarget);
  });

  const allLegendRows = legendWrap.querySelectorAll(".brain-legend-row");
  allLegendRows.forEach(row => {
    const isTarget = row.getAttribute("data-habit-id") === habitId;
    row.classList.toggle("is-active", isTarget);
    row.classList.toggle("is-dimmed", !isTarget);
  });
}

/**
 * Clear any active highlight and restore all pathways to standard styles.
 */
function clearHabitHighlight() {
  activeHighlightedHabitId = null;

  const svgWrap = document.getElementById("brain-svg-container");
  const legendWrap = document.getElementById("brain-legend");
  if (!svgWrap || !legendWrap) return;

  svgWrap.classList.remove("has-highlight");
  legendWrap.classList.remove("has-highlight");

  const allPathwayGroups = svgWrap.querySelectorAll(".neural-pathway-group");
  allPathwayGroups.forEach(g => {
    g.classList.remove("is-highlighted", "is-dimmed");
  });

  const allLegendRows = legendWrap.querySelectorAll(".brain-legend-row");
  allLegendRows.forEach(row => {
    row.classList.remove("is-active", "is-dimmed");
  });
}

/**
 * Toggle highlight state on click/tap.
 * @param {string} habitId
 */
function toggleHabitHighlight(habitId) {
  if (activeHighlightedHabitId === habitId) {
    clearHabitHighlight();
  } else {
    setHabitHighlight(habitId);
  }
}

// ─── DOM Building (Safe, createElementNS & textContent) ────────────

/**
 * Construct the static SVG lateral brain: outline, filter definitions,
 * clipPath, and internal gyri/sulci folds.
 *
 * @returns {{ svg: SVGSVGElement, pathwaysContainer: SVGGElement }}
 */
function createBrainSvgElement() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 440 320");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "auto");
  svg.setAttribute("role", "img");
  svg.setAttribute("class", "brain-svg");

  // Defs: clipPath and glow filter
  const defs = document.createElementNS(SVG_NS, "defs");

  // Neural glow filter (active at 100+ days)
  const filter = document.createElementNS(SVG_NS, "filter");
  filter.setAttribute("id", "brain-neural-glow");
  filter.setAttribute("x", "-40%");
  filter.setAttribute("y", "-40%");
  filter.setAttribute("width", "180%");
  filter.setAttribute("height", "180%");

  const feBlur = document.createElementNS(SVG_NS, "feGaussianBlur");
  feBlur.setAttribute("stdDeviation", "3");
  feBlur.setAttribute("result", "blur");

  const feMerge = document.createElementNS(SVG_NS, "feMerge");
  const feNode1 = document.createElementNS(SVG_NS, "feMergeNode");
  feNode1.setAttribute("in", "blur");
  const feNode2 = document.createElementNS(SVG_NS, "feMergeNode");
  feNode2.setAttribute("in", "SourceGraphic");

  feMerge.appendChild(feNode1);
  feMerge.appendChild(feNode2);
  filter.appendChild(feBlur);
  filter.appendChild(feMerge);
  defs.appendChild(filter);

  // ClipPath using the lateral brain outline so pathways never leak outside
  const clipPath = document.createElementNS(SVG_NS, "clipPath");
  clipPath.setAttribute("id", "brain-cortex-clip");

  const clipPathShape = document.createElementNS(SVG_NS, "path");
  clipPathShape.setAttribute("d", BRAIN_OUTLINE_PATH);
  clipPath.appendChild(clipPathShape);
  defs.appendChild(clipPath);

  svg.appendChild(defs);

  // Background brain outline & faint tint
  const outlinePath = document.createElementNS(SVG_NS, "path");
  outlinePath.setAttribute("d", BRAIN_OUTLINE_PATH);
  outlinePath.setAttribute("class", "brain-cortex-outline");
  svg.appendChild(outlinePath);

  // Anatomical internal folds & gyri (light pink, decorative)
  const foldsGroup = document.createElementNS(SVG_NS, "g");
  foldsGroup.setAttribute("class", "brain-cortex-folds");
  for (const foldD of BRAIN_INTERNAL_FOLDS) {
    const foldPath = document.createElementNS(SVG_NS, "path");
    foldPath.setAttribute("d", foldD);
    foldsGroup.appendChild(foldPath);
  }
  svg.appendChild(foldsGroup);

  // Neural pathways group (strictly clipped to cortex)
  const pathwaysContainer = document.createElementNS(SVG_NS, "g");
  pathwaysContainer.setAttribute("clip-path", "url(#brain-cortex-clip)");
  pathwaysContainer.setAttribute("class", "brain-pathways-container");
  svg.appendChild(pathwaysContainer);

  return { svg, pathwaysContainer };
}

/**
 * Build SVG elements for a single habit's neural pathway.
 *
 * @param {Object} habit
 * @param {number} habitIndex
 * @param {number} streak
 * @param {string} color
 * @param {number} totalHabits
 * @returns {SVGGElement}
 */
function createPathwayGroup(habit, habitIndex, streak, color, totalHabits) {
  const intensity = streakToIntensity(streak);
  const style = intensityToStyle(intensity);
  const data = generatePathwayData(habit.id, habitIndex, streak, totalHabits);

  const group = document.createElementNS(SVG_NS, "g");
  group.setAttribute("class", "neural-pathway-group" + (style.glow ? " is-glowing" : ""));
  group.setAttribute("data-habit-id", habit.id);
  group.setAttribute("data-base-opacity", String(style.opacity));
  group.setAttribute("data-base-width", String(style.strokeWidth));
  group.style.opacity = style.opacity;

  // Main axon pathway
  const mainPath = document.createElementNS(SVG_NS, "path");
  mainPath.setAttribute("d", data.mainPathD);
  mainPath.setAttribute("class", "neural-line neural-main");
  mainPath.setAttribute("stroke", color);
  mainPath.setAttribute("stroke-width", String(style.strokeWidth));
  mainPath.setAttribute("stroke-linecap", "round");
  mainPath.setAttribute("stroke-linejoin", "round");
  mainPath.setAttribute("fill", "none");
  if (style.glow) {
    mainPath.setAttribute("filter", "url(#brain-neural-glow)");
  }
  group.appendChild(mainPath);

  // Dendrite branches
  for (const branchD of data.branches) {
    const branchPath = document.createElementNS(SVG_NS, "path");
    branchPath.setAttribute("d", branchD);
    branchPath.setAttribute("class", "neural-line neural-branch");
    branchPath.setAttribute("stroke", color);
    branchPath.setAttribute("stroke-width", String(Math.max(1, style.strokeWidth * 0.75)));
    branchPath.setAttribute("stroke-linecap", "round");
    branchPath.setAttribute("stroke-linejoin", "round");
    branchPath.setAttribute("fill", "none");
    if (style.glow) {
      branchPath.setAttribute("filter", "url(#brain-neural-glow)");
    }
    group.appendChild(branchPath);
  }

  // Synapse nodes / terminal dots
  const nodeRadius = Math.max(2, style.strokeWidth * 0.9);
  for (const node of data.nodes) {
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("cx", node.x.toFixed(1));
    circle.setAttribute("cy", node.y.toFixed(1));
    circle.setAttribute("r", nodeRadius.toFixed(1));
    circle.setAttribute("fill", color);
    circle.setAttribute(
      "class",
      "neural-node" + (style.glow ? " synapse-pulse" : "")
    );
    if (style.glow) {
      circle.setAttribute("filter", "url(#brain-neural-glow)");
    }
    group.appendChild(circle);
  }

  return group;
}

/**
 * Build one legend row. Habit name is set with textContent (XSS-safe).
 *
 * @param {Object} habit
 * @param {number} streak
 * @param {string} color
 * @returns {HTMLDivElement}
 */
function createLegendRow(habit, streak, color) {
  const row = document.createElement("div");
  row.className = "brain-legend-row";
  row.setAttribute("role", "button");
  row.setAttribute("tabindex", "0");
  row.setAttribute("data-habit-id", habit.id);
  row.setAttribute(
    "aria-label",
    `${habit.name}, current streak ${streak} ${streak === 1 ? "day" : "days"}`
  );

  // Colored dot
  const dot = document.createElement("span");
  dot.className = "brain-legend-dot";
  dot.style.backgroundColor = color;

  // Habit name (using textContent, NEVER innerHTML)
  const nameEl = document.createElement("span");
  nameEl.className = "brain-legend-name";
  nameEl.textContent = habit.name;

  // Streak number badge
  const streakEl = document.createElement("span");
  streakEl.className = "brain-legend-streak";
  streakEl.textContent = String(streak);
  if (streak >= BRAIN_CONFIG.STREAK_MAX) {
    streakEl.title = "Fully lit (100+ days)";
  }

  row.appendChild(dot);
  row.appendChild(nameEl);
  row.appendChild(streakEl);

  // Interactivity: hover & tap highlights
  row.addEventListener("mouseenter", () => setHabitHighlight(habit.id));
  row.addEventListener("mouseleave", () => clearHabitHighlight());
  row.addEventListener("click", () => toggleHabitHighlight(habit.id));
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleHabitHighlight(habit.id);
    }
  });

  return row;
}

// ─── Entry Point ───────────────────────────────────────────────────

/**
 * Render the Brain visualization and habit pathway legend.
 *
 * @param {Array<{ id: string, name: string, archived?: boolean }>} habits
 * @param {Map<string, { current: number, best: number }>} streaksByHabitId
 */
function renderBrain(habits, streaksByHabitId) {
  try {
    const svgWrap = document.getElementById("brain-svg-container");
    const legendWrap = document.getElementById("brain-legend");
    const emptyStateEl = document.getElementById("brain-empty-state");

    if (!svgWrap || !legendWrap) {
      console.warn("Brain DOM containers not found; skipping renderBrain.");
      return;
    }

    svgWrap.innerHTML = "";
    legendWrap.innerHTML = "";
    clearHabitHighlight();

    const activeHabits = (habits || []).filter(h => !h.archived);
    const { svg, pathwaysContainer } = createBrainSvgElement();

    // ─── Empty state: No active habits ───
    if (activeHabits.length === 0) {
      svg.setAttribute("aria-label", "Lateral brain visualization outline. Add a habit to start growing pathways.");
      svgWrap.appendChild(svg);
      if (emptyStateEl) {
        emptyStateEl.style.display = "block";
      }
      return;
    }

    if (emptyStateEl) {
      emptyStateEl.style.display = "none";
    }

    // Accessible description of rendered neural pathways
    svg.setAttribute(
      "aria-label",
      `Lateral brain view with ${activeHabits.length} ${activeHabits.length === 1 ? "habit pathway" : "habit pathways"}`
    );

    // Deterministically assign colors from id hashes
    const colorMap = assignHabitColors(activeHabits);

    // Build neural pathway and legend row for each active habit
    activeHabits.forEach((habit, index) => {
      const streakInfo = streaksByHabitId
        ? streaksByHabitId.get(habit.id) || { current: 0, best: 0 }
        : { current: 0, best: 0 };
      const currentStreak = Math.max(0, streakInfo.current || 0);
      const color = colorMap.get(habit.id) || BRAIN_PALETTE[0];

      // Neural pathway inside lateral brain
      const pathwayGroup = createPathwayGroup(
        habit,
        index,
        currentStreak,
        color,
        activeHabits.length
      );
      pathwaysContainer.appendChild(pathwayGroup);

      // Legend row
      const legendRow = createLegendRow(habit, currentStreak, color);
      legendWrap.appendChild(legendRow);
    });

    svgWrap.appendChild(svg);
  } catch (err) {
    console.error("renderBrain error:", err);
  }
}

/**
 * Pass 1 test renderer: renders the new lateral profile brain with 3 hardcoded
 * test pathways (streaks: 30, 66, 100) for visual review.
 */
function renderBrainPass1Test() {
  const testHabits = [
    { id: "pass1-reading", name: "Read 20 pages" },
    { id: "pass1-meditation", name: "Morning meditation" },
    { id: "pass1-running", name: "Daily run" },
  ];
  const testStreaks = new Map([
    ["pass1-reading", { current: 30, best: 30 }],
    ["pass1-meditation", { current: 66, best: 66 }],
    ["pass1-running", { current: 100, best: 100 }],
  ]);
  renderBrain(testHabits, testStreaks);
}

// ─── Global Exposure & Boot Synchronization ────────────────────────
window.renderBrain = renderBrain;
window.renderBrainPass1Test = renderBrainPass1Test;
window.streakToIntensity = streakToIntensity;
window.intensityToStyle = intensityToStyle;
window.assignHabitColors = assignHabitColors;

// If habits.js has already loaded data before brain.js was parsed,
// trigger the initial render immediately.
if (typeof window.callRenderBrain === "function") {
  window.callRenderBrain();
}
