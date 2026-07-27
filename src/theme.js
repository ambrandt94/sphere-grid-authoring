/** Default matches the previous indigo accent. */
export const DEFAULT_UI_COLOR = '#6366f1';
export const DEFAULT_UI_BG_MIX = 0;
export const DEFAULT_UI_MODE = 'dark';
/** Max blend toward black/white for the graph canvas fill slider. */
export const UI_BG_MIX_RANGE = 0.15;
export const UI_MODE_IDS = new Set(['dark', 'light']);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeHexColor(value, fallback = DEFAULT_UI_COLOR) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
  if (short) {
    const [r, g, b] = short[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return fallback;
}

export function normalizeUiBgMix(value, fallback = DEFAULT_UI_BG_MIX) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clamp(number, -UI_BG_MIX_RANGE, UI_BG_MIX_RANGE);
}

export function normalizeUiMode(value, fallback = DEFAULT_UI_MODE) {
  return typeof value === 'string' && UI_MODE_IDS.has(value) ? value : fallback;
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHsl(r, g, b) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rr) h = ((gg - bb) / delta) % 6;
    else if (max === gg) h = (bb - rr) / delta + 2;
    else h = (rr - gg) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return {
    h,
    s: s * 100,
    l: l * 100,
  };
}

function hslToRgb(h, s, l) {
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbChannels(r, g, b) {
  return `${r} ${g} ${b}`;
}

function parseChannels(channels) {
  const [r, g, b] = String(channels).split(/\s+/).map(Number);
  return { r, g, b };
}

function hslChannels(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbChannels(r, g, b);
}

/** Mix RGB channels toward black (-1..0) or white (0..1). */
function mixTowardBlackWhite(channels, amount) {
  const t = clamp(amount, -1, 1);
  const { r, g, b } = parseChannels(channels);
  if (t < 0) {
    const a = -t;
    return rgbChannels(
      Math.round(r * (1 - a)),
      Math.round(g * (1 - a)),
      Math.round(b * (1 - a)),
    );
  }
  if (t > 0) {
    return rgbChannels(
      Math.round(r + (255 - r) * t),
      Math.round(g + (255 - g) * t),
      Math.round(b + (255 - b) * t),
    );
  }
  return rgbChannels(r, g, b);
}

function mixChannels(channels, targetRgb, amount) {
  const t = clamp(amount, 0, 1);
  const { r, g, b } = parseChannels(channels);
  const [tr, tg, tb] = targetRgb;
  return rgbChannels(
    Math.round(r + (tr - r) * t),
    Math.round(g + (tg - g) * t),
    Math.round(b + (tb - b) * t),
  );
}

function relativeLuminance(r, g, b) {
  const toLinear = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Contrasting ink for text/icons sitting on the accent. */
function onAccentChannels(r, g, b) {
  return relativeLuminance(r, g, b) > 0.55
    ? rgbChannels(15, 23, 42)
    : rgbChannels(255, 255, 255);
}

/**
 * Builds CSS variable channels from a base accent color.
 * Accent stays literal; chrome surfaces follow a dark or light ladder
 * tinted by the chosen hue/saturation.
 */
export function buildUiThemeVars(baseHex = DEFAULT_UI_COLOR, mode = DEFAULT_UI_MODE) {
  const hex = normalizeHexColor(baseHex);
  const { r, g, b } = hexToRgb(hex);
  const { h, s } = rgbToHsl(r, g, b);
  const isLight = normalizeUiMode(mode) === 'light';

  // Keep more of the chosen saturation so chrome feels tied to the pick.
  const bgSat = isLight
    ? clamp(s * 0.42, 4, 48)
    : clamp(s * 0.58, 8, 62);

  const accent = rgbChannels(r, g, b);
  const accentBright = mixChannels(accent, [255, 255, 255], 0.16);
  const accentSoft = mixChannels(accent, [255, 255, 255], 0.34);
  const accentDeep = mixChannels(accent, [0, 0, 0], isLight ? 0.52 : 0.72);
  const accentGlow = mixChannels(accent, [0, 0, 0], isLight ? 0.32 : 0.55);

  // 950 = page bg, 200 = primary text/icons in both modes.
  const ladder = isLight
    ? [
        [950, bgSat * 0.3, 97.5],
        [900, bgSat * 0.4, 94],
        [800, bgSat * 0.5, 88],
        [700, bgSat * 0.55, 78],
        [600, bgSat * 0.5, 62],
        [500, bgSat * 0.45, 48],
        [400, Math.max(bgSat * 0.35, 6), 36],
        [300, Math.max(bgSat * 0.28, 5), 26],
        [200, Math.max(bgSat * 0.22, 4), 14],
      ]
    : [
        [950, bgSat * 0.75, 4],
        [900, bgSat * 0.9, 9],
        [800, bgSat, 14.5],
        [700, bgSat * 1.05, 23],
        [600, bgSat * 0.95, 34],
        [500, bgSat * 0.8, 48],
        [400, Math.max(bgSat * 0.5, 8), 64],
        [300, Math.max(bgSat * 0.35, 6), 78],
        [200, Math.max(bgSat * 0.22, 4), 91],
      ];

  const vars = {};
  for (const [step, sat, light] of ladder) {
    vars[`--ui-${step}`] = hslChannels(h, clamp(sat, 0, 100), light);
  }

  return {
    ...vars,
    '--ui-accent': accent,
    '--ui-accent-bright': accentBright,
    '--ui-accent-soft': accentSoft,
    '--ui-accent-deep': accentDeep,
    '--ui-accent-glow': accentGlow,
    '--ui-on-accent': onAccentChannels(r, g, b),
    '--ui-panel-fill': vars['--ui-900'],
  };
}

/** Canvas baseline: low-sat tint of the settings color, dark or light by mode. */
export function getCanvasBaselineChannels(baseHex = DEFAULT_UI_COLOR, mode = DEFAULT_UI_MODE) {
  const hex = normalizeHexColor(baseHex);
  const { r, g, b } = hexToRgb(hex);
  const { h, s } = rgbToHsl(r, g, b);
  const isLight = normalizeUiMode(mode) === 'light';
  const sat = clamp(s * 0.22, 0, 28);
  const light = isLight ? 94 : 9;
  return hslChannels(h, sat, light);
}

/** Graph canvas fill: mode baseline, blended ±15% toward black/white. */
export function getCanvasBackgroundChannels(
  baseHex = DEFAULT_UI_COLOR,
  bgMix = DEFAULT_UI_BG_MIX,
  mode = DEFAULT_UI_MODE,
) {
  return mixTowardBlackWhite(getCanvasBaselineChannels(baseHex, mode), normalizeUiBgMix(bgMix));
}

export const DEFAULT_GRID_STYLE = 'dots';
export const DEFAULT_GRID_SIZE = 40;
export const DEFAULT_SHOW_CENTER = true;
export const GRID_STYLE_IDS = new Set(['dots', 'lines', 'none']);
export const GRID_SIZE_PRESETS = [
  { id: '1x', label: 'Default', size: 40 },
  { id: '2x', label: '2x', size: 80 },
  { id: '4x', label: '4x', size: 160 },
];

export function normalizeGridStyle(value, fallback = DEFAULT_GRID_STYLE) {
  return typeof value === 'string' && GRID_STYLE_IDS.has(value) ? value : fallback;
}

export function normalizeGridSize(value, fallback = DEFAULT_GRID_SIZE) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;

  const presets = GRID_SIZE_PRESETS.map((preset) => preset.size);
  if (presets.includes(Math.round(number))) {
    return Math.round(number);
  }

  // Migrate older continuous sizes to the nearest preset
  return presets.reduce((best, size) => (
    Math.abs(size - number) < Math.abs(best - number) ? size : best
  ), fallback);
}

export function normalizeShowCenter(value, fallback = DEFAULT_SHOW_CENTER) {
  if (typeof value === 'boolean') return value;
  if (value === 'false' || value === 0 || value === '0') return false;
  if (value === 'true' || value === 1 || value === '1') return true;
  return fallback;
}
