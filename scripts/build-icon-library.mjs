#!/usr/bin/env node
/**
 * Generates `icons-library.js` — a single-file, canvas-ready subset of the
 * Lucide icon set tailored to the "tech / business / IA" niche.
 *
 * It reads each icon's compiled ESM module from lucide-react and extracts
 * the `__iconNode` array (mix of path / rect / circle / line / polyline /
 * polygon primitives) so the canvas drawer renders them identically.
 *
 * Run from the dashboard/ dir:  node scripts/build-icon-library.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const DASHBOARD_DIR = path.resolve(path.dirname(__filename), "..");
const APP_ROOT = path.resolve(DASHBOARD_DIR, "..");
const LUCIDE_DIR = path.join(DASHBOARD_DIR, "node_modules", "lucide-react", "dist", "esm", "icons");

const OUTPUTS = [
  path.join(APP_ROOT, "davinci-addon", "icons-library.js"),
  path.join(DASHBOARD_DIR, "motion-template", "icons-library.js"),
];
const TS_OUTPUT = path.join(DASHBOARD_DIR, "src", "lib", "lucide-icons.ts");

const ICONS = [
  // persona / perfil
  "user", "users", "circle-user", "user-round",
  // IA / robot / magic
  "brain", "bot", "sparkles", "wand", "cpu",
  // tech / infra
  "terminal", "code", "server", "database", "cloud", "globe", "zap", "wifi",
  "monitor", "laptop", "smartphone", "video", "camera",
  // business / money / growth
  "briefcase", "chart-bar", "chart-column", "chart-pie", "chart-line",
  "trending-up", "trending-down", "target", "rocket", "lightbulb",
  "dollar-sign", "euro", "coins", "wallet", "piggy-bank", "credit-card", "receipt",
  "calculator", "percent",
  // actions / editing
  "scissors", "pencil", "square-pen", "pen", "search", "settings", "funnel", "tag",
  "plus", "minus", "download", "upload", "trash-2",
  // UI / flow
  "check", "circle-check", "x", "circle-x", "circle-alert",
  "arrow-right", "arrow-down", "arrow-up", "arrow-left",
  "play", "pause", "star", "shield", "key", "lock",
  "message-square", "message-circle", "mail", "megaphone",
  "eye", "clock", "calendar",
  "file", "file-text", "folder", "link", "refresh-ccw",
  "thumbs-up", "heart", "bookmark", "flag", "bell",
];

// Extract the __iconNode entries from a Lucide compiled ESM file. We match
// every ["TAG", { ...attrs... }] tuple and coerce attrs to a plain object.
function extractIconNode(src) {
  const start = src.indexOf("const __iconNode = [");
  if (start === -1) return [];
  // Find the matching closing bracket of the outer array
  let depth = 0;
  let end = -1;
  let inString = false;
  let quote = null;
  for (let i = start + "const __iconNode = ".length; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (ch === "\\") { i++; continue; }
      if (ch === quote) { inString = false; }
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; quote = ch; continue; }
    if (ch === "[") depth++;
    else if (ch === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) return [];
  const literal = src.slice(start + "const __iconNode = ".length, end);

  // Parse each ["tag", { attrs }] tuple with regex — attrs have known shapes.
  const tupleRe = /\[\s*"([a-z-]+)"\s*,\s*\{([^}]*)\}\s*\]/g;
  const out = [];
  let m;
  while ((m = tupleRe.exec(literal)) !== null) {
    const tag = m[1];
    const attrsStr = m[2];
    const attrs = {};
    const attrRe = /([a-zA-Z0-9_-]+)\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let am;
    while ((am = attrRe.exec(attrsStr)) !== null) {
      if (am[1] === "key") continue; // React key — useless on canvas
      attrs[am[1]] = am[2];
    }
    out.push({ tag, attrs });
  }
  return out;
}

const library = {};
const missing = [];

for (const name of ICONS) {
  const file = path.join(LUCIDE_DIR, `${name}.js`);
  if (!fs.existsSync(file)) {
    missing.push(name);
    continue;
  }
  const content = fs.readFileSync(file, "utf8");
  const nodes = extractIconNode(content);
  if (nodes.length === 0) {
    missing.push(name + " (empty)");
    continue;
  }
  library[name] = nodes;
}

if (missing.length) {
  console.error("⚠ Missing or empty icons:", missing);
}

const header = `// icons-library.js — auto-generated from lucide-react. DO NOT EDIT by hand.
// Regenerate with \`node scripts/build-icon-library.mjs\` inside dashboard/.
//
// Each icon is an array of {tag, attrs} nodes (path / rect / circle / line /
// polyline / polygon) from the Lucide 24×24 viewBox. Render with
// \`drawLucideIcon(ctx, "brain", x, y, size, color)\`.
(function () {
  "use strict";
  var ICONS = ${JSON.stringify(library)};

  function drawNode(ctx, node) {
    var tag = node.tag, a = node.attrs;
    if (tag === "path") {
      var p = new Path2D(a.d);
      ctx.stroke(p);
      return;
    }
    if (tag === "circle") {
      ctx.beginPath();
      ctx.arc(+a.cx, +a.cy, +a.r, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    if (tag === "rect") {
      var rx = a.rx != null ? +a.rx : 0;
      var x = +a.x, y = +a.y, w = +a.width, h = +a.height;
      ctx.beginPath();
      if (rx > 0) {
        rx = Math.min(rx, w / 2, h / 2);
        ctx.moveTo(x + rx, y);
        ctx.arcTo(x + w, y, x + w, y + h, rx);
        ctx.arcTo(x + w, y + h, x, y + h, rx);
        ctx.arcTo(x, y + h, x, y, rx);
        ctx.arcTo(x, y, x + w, y, rx);
        ctx.closePath();
      } else {
        ctx.rect(x, y, w, h);
      }
      ctx.stroke();
      return;
    }
    if (tag === "line") {
      ctx.beginPath();
      ctx.moveTo(+a.x1, +a.y1);
      ctx.lineTo(+a.x2, +a.y2);
      ctx.stroke();
      return;
    }
    if (tag === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(+a.cx, +a.cy, +a.rx, +a.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    if (tag === "polyline" || tag === "polygon") {
      var pts = (a.points || "").trim().split(/[\\s,]+/).map(Number);
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (var i = 2; i < pts.length - 1; i += 2) {
        ctx.lineTo(pts[i], pts[i + 1]);
      }
      if (tag === "polygon") ctx.closePath();
      ctx.stroke();
      return;
    }
  }

  // Claude invents icon names frequently — map the most common misnamed ones
  // to the real Lucide entries so the scene doesn't silently render empty.
  var ALIASES = {
    "person": "user-round", "profile": "circle-user", "avatar": "circle-user",
    "user-icon": "user", "people": "users",
    "robot": "bot", "ai": "brain", "ia": "brain", "intelligence": "brain", "chip": "cpu", "processor": "cpu",
    "magic": "sparkles", "wand-magic": "wand", "spark": "sparkles",
    "shell": "terminal", "cli": "terminal", "command": "terminal",
    "cloud-cpu": "cloud", "storage": "database", "db": "database",
    "earth": "globe", "world": "globe", "planet": "globe",
    "bolt": "zap", "lightning": "zap", "lightning-bolt": "zap", "flash": "zap",
    "work": "briefcase", "business": "briefcase", "suitcase": "briefcase",
    "bar-chart": "chart-bar", "chart": "chart-bar", "bar": "chart-bar",
    "column-chart": "chart-column", "columns": "chart-column",
    "growth": "trending-up", "arrow-up-right": "trending-up", "up": "trending-up",
    "decline": "trending-down", "down": "trending-down",
    "money": "dollar-sign", "dollar": "dollar-sign", "usd": "dollar-sign", "cash": "dollar-sign",
    "eur": "euro", "money-euro": "euro",
    "launch": "rocket", "ship": "rocket",
    "bulb": "lightbulb", "idea": "lightbulb",
    "tick": "check", "done": "check", "yes": "check", "ok": "check",
    "no": "x", "cancel": "x", "close": "x", "cross": "x",
    "next": "arrow-right", "forward": "arrow-right",
    "prev": "arrow-left", "back": "arrow-left", "previous": "arrow-left",
    "movie": "play", "video": "play",
    "favorite": "star",
    "lock": "shield", "secure": "shield",
    "password": "key",
    "chat": "message-square", "message": "message-square", "talk": "message-circle",
    "view": "eye", "see": "eye", "watch": "eye",
    "time": "clock", "timer": "clock",
    "document": "file",
    "refresh": "refresh-ccw", "reload": "refresh-ccw",
    "like": "thumbs-up",
    "love": "heart",
    "save": "bookmark",
    "alert": "bell", "notification": "bell",
    "edit": "square-pen", "pencil-edit": "pen", "modify": "pencil",
    "filter": "funnel", "filters": "funnel",
    "check-circle": "circle-check", "checkmark": "check", "verified": "circle-check",
    "x-circle": "circle-x", "error": "circle-x", "reject": "circle-x",
    "alert-circle": "circle-alert", "warning": "circle-alert",
    "money-bag": "wallet", "bag": "wallet",
    "savings": "piggy-bank", "piggy": "piggy-bank", "save-money": "piggy-bank",
    "card": "credit-card", "payment": "credit-card",
    "bill": "receipt", "invoice": "receipt",
    "calc": "calculator",
    "cut": "scissors", "crop": "scissors",
    "hearts": "heart",
    "event": "calendar",
    "schedule": "calendar",
    "phone": "smartphone", "mobile": "smartphone",
    "computer": "monitor", "desktop": "monitor",
    "cam": "camera",
    "videocam": "video",
    "remove": "trash-2", "delete": "trash-2", "bin": "trash-2",
    "add": "plus", "create": "plus",
    "subtract": "minus",
    "export": "download", "import": "upload",
    "find": "search",
    "gear": "settings", "cog": "settings",
  };

  function resolveIcon(name) {
    if (ICONS[name]) return name;
    if (ALIASES[name] && ICONS[ALIASES[name]]) return ALIASES[name];
    // Fall back to the lowercase + dashed form
    var norm = String(name || "").toLowerCase().replace(/[_\\s]+/g, "-");
    if (ICONS[norm]) return norm;
    if (ALIASES[norm] && ICONS[ALIASES[norm]]) return ALIASES[norm];
    return null;
  }

  // Render a named icon centred at (x, y) with the given size (pixels).
  // Respects Lucide's defaults: stroke-width 2, linecap round, linejoin round.
  // \`color\` sets both stroke and fill.
  // If the name isn't found, draws a visible placeholder (dashed circle with
  // the first letter) so the user sees there's a missing icon instead of
  // silent empty space.
  function drawLucideIcon(ctx, name, x, y, size, color, opts) {
    opts = opts || {};
    var resolved = resolveIcon(name);
    ctx.save();
    var s = size / 24;
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.translate(-12, -12);
    ctx.strokeStyle = color || "#ffffff";
    ctx.fillStyle = color || "#ffffff";
    ctx.lineWidth = opts.strokeWidth != null ? opts.strokeWidth : 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (resolved) {
      var nodes = ICONS[resolved];
      for (var i = 0; i < nodes.length; i++) drawNode(ctx, nodes[i]);
    } else {
      // Fallback placeholder — dashed circle with the initial so broken
      // icons are visible at a glance instead of invisible.
      ctx.save();
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.arc(12, 12, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(name || "?").charAt(0).toUpperCase(), 12, 13);
      ctx.restore();
    }
    ctx.restore();
    return resolved != null;
  }

  function hasLucideIcon(name) { return !!ICONS[name]; }
  function lucideIconNames() { return Object.keys(ICONS); }

  if (typeof window !== "undefined") {
    window.LucideIcons = ICONS;
    window.drawLucideIcon = drawLucideIcon;
    window.hasLucideIcon = hasLucideIcon;
    window.lucideIconNames = lucideIconNames;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ICONS: ICONS, drawLucideIcon: drawLucideIcon };
  }
})();
`;

for (const out of OUTPUTS) {
  const dir = path.dirname(out);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(out, header);
  console.log(`  ✓ ${path.relative(APP_ROOT, out)} — ${Object.keys(library).length} icons`);
}

// TypeScript variant for the Next.js dashboard. Same data, typed API.
const tsContent = `// lucide-icons.ts — auto-generated from lucide-react. DO NOT EDIT by hand.
// Regenerate with \`node scripts/build-icon-library.mjs\` inside dashboard/.
//
// Typed canvas drawer for Lucide icons — shared between the StylePreview
// component and any other in-dashboard canvas rendering.

export interface LucideNode {
  tag: string;
  attrs: Record<string, string>;
}

export const LUCIDE_ICONS: Record<string, LucideNode[]> = ${JSON.stringify(library)};

export type LucideIconName = keyof typeof LUCIDE_ICONS;

export interface DrawIconOptions {
  strokeWidth?: number;
}

function drawNode(ctx: CanvasRenderingContext2D, node: LucideNode) {
  const a = node.attrs;
  if (node.tag === "path") {
    ctx.stroke(new Path2D(a.d));
    return;
  }
  if (node.tag === "circle") {
    ctx.beginPath();
    ctx.arc(+a.cx, +a.cy, +a.r, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (node.tag === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(+a.cx, +a.cy, +a.rx, +a.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  if (node.tag === "rect") {
    const rx = a.rx != null ? +a.rx : 0;
    const x = +a.x, y = +a.y, w = +a.width, h = +a.height;
    ctx.beginPath();
    if (rx > 0) {
      const r = Math.min(rx, w / 2, h / 2);
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.stroke();
    return;
  }
  if (node.tag === "line") {
    ctx.beginPath();
    ctx.moveTo(+a.x1, +a.y1);
    ctx.lineTo(+a.x2, +a.y2);
    ctx.stroke();
    return;
  }
  if (node.tag === "polyline" || node.tag === "polygon") {
    const pts = (a.points || "").trim().split(/[\\s,]+/).map(Number);
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length - 1; i += 2) {
      ctx.lineTo(pts[i], pts[i + 1]);
    }
    if (node.tag === "polygon") ctx.closePath();
    ctx.stroke();
  }
}

const ALIASES: Record<string, string> = {
  "person": "user-round", "profile": "circle-user", "avatar": "circle-user",
  "user-icon": "user", "people": "users",
  "robot": "bot", "ai": "brain", "ia": "brain", "intelligence": "brain", "chip": "cpu",
  "magic": "sparkles", "wand-magic": "wand", "spark": "sparkles",
  "shell": "terminal", "cli": "terminal", "command": "terminal",
  "cloud-cpu": "cloud", "storage": "database", "db": "database",
  "earth": "globe", "world": "globe",
  "bolt": "zap", "lightning": "zap", "lightning-bolt": "zap", "flash": "zap",
  "work": "briefcase", "business": "briefcase",
  "bar-chart": "chart-bar", "chart": "chart-bar",
  "growth": "trending-up", "up": "trending-up",
  "decline": "trending-down", "down": "trending-down",
  "money": "dollar-sign", "dollar": "dollar-sign", "cash": "dollar-sign",
  "launch": "rocket",
  "bulb": "lightbulb", "idea": "lightbulb",
  "tick": "check", "done": "check",
  "no": "x", "cancel": "x", "close": "x", "cross": "x",
  "next": "arrow-right", "prev": "arrow-left", "back": "arrow-left",
  "movie": "play", "video": "play",
  "lock": "shield",
  "password": "key",
  "chat": "message-square", "message": "message-square",
  "view": "eye", "see": "eye",
  "time": "clock",
  "refresh": "refresh-ccw", "reload": "refresh-ccw",
  "like": "thumbs-up",
  "love": "heart",
  "alert": "bell",
  "edit": "square-pen",
  "filter": "funnel",
  "check-circle": "circle-check",
  "x-circle": "circle-x",
  "alert-circle": "circle-alert",
  "cut": "scissors", "crop": "scissors",
  "phone": "smartphone", "mobile": "smartphone",
  "computer": "monitor", "desktop": "monitor",
  "gear": "settings", "cog": "settings",
};

function resolveIcon(name: string): string | null {
  if (LUCIDE_ICONS[name]) return name;
  if (ALIASES[name] && LUCIDE_ICONS[ALIASES[name]]) return ALIASES[name];
  const norm = name.toLowerCase().replace(/[_\\\\s]+/g, "-");
  if (LUCIDE_ICONS[norm]) return norm;
  if (ALIASES[norm] && LUCIDE_ICONS[ALIASES[norm]]) return ALIASES[norm];
  return null;
}

/** Draw a Lucide icon centred at (x, y) at the given pixel size.
 *  Falls back to a dashed-circle placeholder with the initial letter when
 *  the icon name is unknown — prevents silent empty spots in generated scenes. */
export function drawLucideIcon(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
  color: string,
  opts: DrawIconOptions = {},
): boolean {
  const resolved = resolveIcon(name);
  ctx.save();
  const s = size / 24;
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(-12, -12);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = opts.strokeWidth != null ? opts.strokeWidth : 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (resolved) {
    for (const n of LUCIDE_ICONS[resolved]) drawNode(ctx, n);
  } else {
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.arc(12, 12, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((name || "?").charAt(0).toUpperCase(), 12, 13);
    ctx.restore();
  }
  ctx.restore();
  return resolved != null;
}
`;
fs.mkdirSync(path.dirname(TS_OUTPUT), { recursive: true });
fs.writeFileSync(TS_OUTPUT, tsContent);
console.log(`  ✓ ${path.relative(APP_ROOT, TS_OUTPUT)} — ${Object.keys(library).length} icons (TS)`);

console.log(`\nBiblioteca de iconos generada (${Object.keys(library).length} iconos).`);
