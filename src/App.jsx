import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, 
  Move, 
  Link as LinkIcon, 
  Download, 
  Upload, 
  Trash2, 
  X,
  Settings,
  Image as ImageIcon,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  Pencil,
  Sun,
  Moon,
  Map,
  // Icons for the picker
  Zap, Shield, Swords, Skull, Heart, Star, 
  Anchor, Key, Lock, Flag, Bell, Tag, 
  Crown, Gift, Eye, Flame, Droplet, Leaf, 
  Wind, Crosshair, Box, Disc, Bookmark,
  Book, Wrench
} from 'lucide-react';
import {
  buildExportBlob,
  buildSkillExportBlob,
  createDefaultProject,
  createEmptyGrid,
  DEFAULT_GRID_SIZE,
  DEFAULT_GRID_STYLE,
  DEFAULT_LINK_COLOR,
  DEFAULT_OUTLINE_COLOR,
  DEFAULT_UI_BG_MIX,
  DEFAULT_UI_COLOR,
  DEFAULT_UI_MODE,
  GRID_SIZE_PRESETS,
  downloadBlob,
  getBackgroundDisplaySize,
  IMPORT_KIND_LIBRARY,
  IMPORT_KIND_SKILL,
  loadProject,
  moveOutlinePreset,
  outlinesMatch,
  parseImportedFile,
  partitionOutlinePresets,
  renameOutlinePreset,
  saveProject,
  toggleOutlinePresetPinned,
} from './storage';
import {
  buildUiThemeVars,
  getCanvasBackgroundChannels,
  normalizeHexColor,
  normalizeUiBgMix,
  normalizeUiMode,
  UI_BG_MIX_RANGE,
} from './theme';

// --- Configuration ---
const WORLD_ORIGIN_OFFSET = 5000;
const LINE_SPACING = 7;

const getBackgroundImageStyle = (pixelated) =>
  pixelated
    ? { imageRendering: 'pixelated' }
    : { imageRendering: 'auto' };

// Icon Registry for the picker
const ICON_MAP = {
  'swords': Swords, 'shield': Shield, 'zap': Zap, 'heart': Heart, 
  'skull': Skull, 'star': Star, 'crown': Crown, 'key': Key, 
  'lock': Lock, 'flag': Flag, 'bell': Bell, 'tag': Tag,
  'gift': Gift, 'eye': Eye, 'flame': Flame, 'droplet': Droplet,
  'leaf': Leaf, 'wind': Wind, 'crosshair': Crosshair, 'box': Box,
  'anchor': Anchor, 'disc': Disc, 'bookmark': Bookmark, 'settings': Settings,
  'book': Book, 'tool': Wrench
};

const SHAPES = [
  { id: 'circle', label: 'Circle' },
  { id: 'square', label: 'Square' },
  { id: 'hexagon', label: 'Hexagon' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'triangle', label: 'Triangle' }
];

const LINK_STYLES = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'zigzag', label: 'Zigzag' },
];

const BEND_MODES = [
  { id: 'curve', label: 'Curved' },
  { id: 'angled', label: 'Angled' },
];

const getCurveControl = (x1, y1, x2, y2, curve = 0) => {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  if (!curve) {
    return { cx: mx, cy: my };
  }
  const vx = x2 - x1;
  const vy = y2 - y1;
  return {
    cx: mx + (-vy) * curve * 0.5,
    cy: my + (vx) * curve * 0.5,
  };
};

const pointOnQuad = (x1, y1, cx, cy, x2, y2, t) => {
  const u = 1 - t;
  return {
    x: u * u * x1 + 2 * u * t * cx + t * t * x2,
    y: u * u * y1 + 2 * u * t * cy + t * t * y2,
  };
};

const tangentOnQuad = (x1, y1, cx, cy, x2, y2, t) => {
  const dx = 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx);
  const dy = 2 * (1 - t) * (cy - y1) + 2 * t * (y2 - cy);
  const len = Math.hypot(dx, dy) || 1;
  return { dx: dx / len, dy: dy / len };
};

const normalizeVec = (x, y) => {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
};

const intersectLines = (p1, d1, p2, d2) => {
  const cross = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(cross) < 1e-6) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / cross;
  return { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
};

/** Angled bend vertex. amount ±1 places a true 90° corner. */
const getBendVertex = (x1, y1, x2, y2, amount = 0) => {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len = Math.hypot(vx, vy) || 1;
  const nx = -vy / len;
  const ny = vx / len;
  const distance = amount * (len * 0.5);
  return { x: mx + nx * distance, y: my + ny * distance };
};

const getPathPointAndTangent = (x1, y1, x2, y2, amount = 0, bendMode = 'curve', t = 0) => {
  if (bendMode === 'angled') {
    if (!amount) {
      const tangent = normalizeVec(x2 - x1, y2 - y1);
      return {
        p: { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t },
        tangent: { dx: tangent.x, dy: tangent.y },
      };
    }
    const bend = getBendVertex(x1, y1, x2, y2, amount);
    const len1 = Math.hypot(bend.x - x1, bend.y - y1);
    const len2 = Math.hypot(x2 - bend.x, y2 - bend.y);
    const total = len1 + len2 || 1;
    const dist = t * total;
    if (dist <= len1) {
      const u = len1 ? dist / len1 : 0;
      const tangent = normalizeVec(bend.x - x1, bend.y - y1);
      return {
        p: { x: x1 + (bend.x - x1) * u, y: y1 + (bend.y - y1) * u },
        tangent: { dx: tangent.x, dy: tangent.y },
      };
    }
    const u = len2 ? (dist - len1) / len2 : 0;
    const tangent = normalizeVec(x2 - bend.x, y2 - bend.y);
    return {
      p: { x: bend.x + (x2 - bend.x) * u, y: bend.y + (y2 - bend.y) * u },
      tangent: { dx: tangent.x, dy: tangent.y },
    };
  }

  if (!amount) {
    const tangent = normalizeVec(x2 - x1, y2 - y1);
    return {
      p: { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t },
      tangent: { dx: tangent.x, dy: tangent.y },
    };
  }
  const { cx, cy } = getCurveControl(x1, y1, x2, y2, amount);
  const sampleT = Math.min(0.999, Math.max(0.001, t));
  return {
    p: pointOnQuad(x1, y1, cx, cy, x2, y2, t),
    tangent: tangentOnQuad(x1, y1, cx, cy, x2, y2, sampleT),
  };
};

const getPathData = (x1, y1, x2, y2, amount = 0, bendMode = 'curve') => {
  if (!amount) return `M ${x1} ${y1} L ${x2} ${y2}`;
  if (bendMode === 'angled') {
    const bend = getBendVertex(x1, y1, x2, y2, amount);
    return `M ${x1} ${y1} L ${bend.x} ${bend.y} L ${x2} ${y2}`;
  }
  const { cx, cy } = getCurveControl(x1, y1, x2, y2, amount);
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
};

const getOffsetPathData = (x1, y1, x2, y2, amount = 0, offset = 0, bendMode = 'curve') => {
  if (bendMode === 'angled' && amount) {
    const bend = getBendVertex(x1, y1, x2, y2, amount);
    const d1 = normalizeVec(bend.x - x1, bend.y - y1);
    const d2 = normalizeVec(x2 - bend.x, y2 - bend.y);
    const n1 = { x: -d1.y, y: d1.x };
    const n2 = { x: -d2.y, y: d2.x };
    const start = { x: x1 + n1.x * offset, y: y1 + n1.y * offset };
    const end = { x: x2 + n2.x * offset, y: y2 + n2.y * offset };
    const join = intersectLines(
      { x: bend.x + n1.x * offset, y: bend.y + n1.y * offset },
      d1,
      { x: bend.x + n2.x * offset, y: bend.y + n2.y * offset },
      d2,
    );
    return `M ${start.x} ${start.y} L ${join.x} ${join.y} L ${end.x} ${end.y}`;
  }

  const vx = x2 - x1;
  const vy = y2 - y1;
  const len = Math.hypot(vx, vy) || 1;
  const nx = (-vy / len) * offset;
  const ny = (vx / len) * offset;
  return getPathData(x1 + nx, y1 + ny, x2 + nx, y2 + ny, amount, 'curve');
};

/** Midpoint / bend handle used to drag path amount. */
const getCurveHandlePoint = (x1, y1, x2, y2, amount = 0, bendMode = 'curve') => {
  if (bendMode === 'angled') {
    return getBendVertex(x1, y1, x2, y2, amount);
  }
  if (!amount) {
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  }
  const { cx, cy } = getCurveControl(x1, y1, x2, y2, amount);
  return pointOnQuad(x1, y1, cx, cy, x2, y2, 0.5);
};

/** Map a dragged handle position back to the -1..1 amount value. */
const curveFromHandlePoint = (x1, y1, x2, y2, hx, hy, bendMode = 'curve') => {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len = Math.hypot(vx, vy) || 1;
  const nx = -vy / len;
  const ny = vx / len;
  const signed = (hx - mx) * nx + (hy - my) * ny;
  const snapDistance = Math.min(14, len * 0.06);
  const snapped = Math.abs(signed) <= snapDistance ? 0 : signed;

  if (bendMode === 'angled') {
    // Vertex sits at M + N * amount * (len / 2); ±1 => 90°
    return Math.max(-1, Math.min(1, (2 * snapped) / len));
  }

  // B(0.5) sits at M + N * len * curve / 4
  return Math.max(-1, Math.min(1, (4 * snapped) / len));
};

/**
 * Build parallel zigzag paths that share one path sample so they stay
 * evenly spaced instead of crossing on bends.
 */
const getZigzagPaths = (x1, y1, x2, y2, amount = 0, offsets = [0], amplitude = 5, bendMode = 'curve') => {
  const approxLen = Math.hypot(x2 - x1, y2 - y1) * (1 + Math.abs(amount || 0) * 0.35);
  const segments = Math.max(8, Math.round(approxLen / 10));
  const pointLists = offsets.map(() => []);

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const { p, tangent } = getPathPointAndTangent(x1, y1, x2, y2, amount, bendMode, t);
    const zig = (i === 0 || i === segments) ? 0 : ((i % 2 === 0) ? 1 : -1) * amplitude;

    offsets.forEach((offset, index) => {
      const shift = offset + zig;
      pointLists[index].push({
        x: p.x + (-tangent.dy) * shift,
        y: p.y + tangent.dx * shift,
      });
    });
  }

  return pointLists.map((points) => {
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i += 1) {
      d += ` L ${points[i].x} ${points[i].y}`;
    }
    return d;
  });
};

const getLineOffsets = (count) => {
  const lines = Math.max(1, Math.min(4, Math.round(Number(count) || 1)));
  if (lines === 1) return [0];
  const half = (lines - 1) / 2;
  return Array.from({ length: lines }, (_, i) => (i - half) * LINE_SPACING);
};

const getConnectionPaths = (x1, y1, x2, y2, amount = 0, style = 'solid', lines = 1, bendMode = 'curve') => {
  const offsets = getLineOffsets(lines);
  const mode = bendMode === 'angled' ? 'angled' : 'curve';
  if (style === 'zigzag') {
    return {
      paths: getZigzagPaths(x1, y1, x2, y2, amount, offsets, 5, mode),
      hitPath: getPathData(x1, y1, x2, y2, amount, mode),
    };
  }

  return {
    paths: offsets.map((offset) => getOffsetPathData(x1, y1, x2, y2, amount, offset, mode)),
    hitPath: getPathData(x1, y1, x2, y2, amount, mode),
  };
};

const getLinkStrokeProps = (style) => {
  if (style === 'dashed') {
    return { strokeDasharray: '10 7', strokeLinecap: 'round' };
  }
  if (style === 'dotted') {
    return { strokeDasharray: '1.5 7', strokeLinecap: 'round' };
  }
  if (style === 'zigzag') {
    return { strokeLinecap: 'round', strokeLinejoin: 'round' };
  }
  return { strokeLinecap: 'round' };
};

const ConnectionPaths = ({
  paths,
  hitPath,
  style,
  color,
  isSelected,
  linkId,
  outlineColor,
  outlineWidth,
  outlineGap,
  lineCount,
}) => {
  const stroke = isSelected ? '#eab308' : color;
  const strokeWidth = isSelected ? 4 : 2;
  const strokeProps = getLinkStrokeProps(style);
  const ow = Math.max(0, Number(outlineWidth) || 0);
  const gap = Math.max(0, Number(outlineGap) || 0);
  const hitWidth = Math.max(15, 10 + (Math.max(1, lineCount) - 1) * LINE_SPACING + ow * 2 + gap * 2);

  return (
    <g>
      <path
        d={hitPath}
        stroke="transparent"
        strokeWidth={hitWidth}
        fill="none"
        className="cursor-pointer"
        data-link-id={linkId}
      />
      {ow > 0 && paths.map((d, index) => (
        <g key={`outline-${index}`}>
          <path
            d={d}
            stroke={outlineColor || DEFAULT_OUTLINE_COLOR}
            strokeWidth={strokeWidth + gap * 2 + ow * 2}
            fill="none"
            className="pointer-events-none"
            {...strokeProps}
          />
          {(gap > 0 || strokeWidth > 0) && (
            <path
              d={d}
              stroke="rgb(var(--canvas-bg, var(--ui-950)))"
              strokeWidth={strokeWidth + gap * 2}
              fill="none"
              className="pointer-events-none"
              {...strokeProps}
            />
          )}
        </g>
      ))}
      {paths.map((d, index) => (
        <path
          key={`stroke-${index}`}
          d={d}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="none"
          className="pointer-events-none"
          {...strokeProps}
        />
      ))}
    </g>
  );
};

const OutlineFields = ({
  outlineColor,
  outlineWidth,
  outlineGap,
  onChange,
  onSave,
  canSave,
  alreadySaved,
}) => (
  <div className="space-y-3">
    <div className="text-xs font-bold text-ui-500 uppercase">Outline</div>

    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-[10px] text-ui-500 mb-1 block">Outline Color</label>
        <div className="flex items-center gap-2 bg-ui-950 border border-ui-700 rounded p-2">
          <input
            type="color"
            value={outlineColor || DEFAULT_OUTLINE_COLOR}
            onChange={(e) => onChange({ outlineColor: e.target.value })}
            className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
          />
          <span className="text-[10px] font-mono text-ui-300 truncate">
            {outlineColor || DEFAULT_OUTLINE_COLOR}
          </span>
        </div>
      </div>
      <div>
        <label className="text-[10px] text-ui-500 mb-1 block">Outline Width</label>
        <input
          type="number"
          min="0"
          max="12"
          step="1"
          className="w-full bg-ui-950 border border-ui-700 rounded p-2 text-xs text-ui-200 outline-none focus:border-ui-accent-bright"
          value={outlineWidth ?? 0}
          onChange={(e) => {
            const value = Math.max(0, Math.min(12, parseInt(e.target.value, 10) || 0));
            onChange({ outlineWidth: value });
          }}
        />
      </div>
    </div>

    <div>
      <label className="text-[10px] text-ui-500 mb-1 block">Outline Gap</label>
      <input
        type="number"
        min="0"
        max="12"
        step="1"
        className="w-full bg-ui-950 border border-ui-700 rounded p-2 text-xs text-ui-200 outline-none focus:border-ui-accent-bright"
        value={outlineGap ?? 0}
        onChange={(e) => {
          const value = Math.max(0, Math.min(12, parseInt(e.target.value, 10) || 0));
          onChange({ outlineGap: value });
        }}
      />
      <p className="mt-1 text-[10px] text-ui-500">Space between the shape edge and outline.</p>
    </div>

    <button
      type="button"
      disabled={!canSave}
      onClick={onSave}
      className={`w-full py-1.5 rounded text-[10px] border transition-colors ${
        canSave
          ? 'bg-ui-800 hover:bg-ui-700 text-ui-200 border-ui-600'
          : 'bg-ui-950 text-ui-600 border-ui-800 cursor-not-allowed'
      }`}
      title={alreadySaved ? 'A matching outline preset already exists' : 'Save current outline as preset'}
    >
      Save to Presets
    </button>
  </div>
);

const OutlinePresetRow = ({
  preset,
  isActive,
  canApply,
  canMoveUp,
  canMoveDown,
  editingId,
  draftName,
  onDraftNameChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onApply,
  onTogglePin,
  onMove,
  onDelete,
}) => {
  const isEditing = editingId === preset.id;

  return (
    <div
      className={`rounded border px-2 py-1.5 space-y-1.5 ${
        isActive ? 'border-ui-accent-bright bg-ui-accent-deep/40' : 'border-ui-800 bg-ui-950'
      }`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          type="button"
          onClick={() => onTogglePin(preset.id)}
          className={`p-1 shrink-0 ${preset.pinned ? 'text-amber-400' : 'text-ui-500 hover:text-ui-300'}`}
          title={preset.pinned ? 'Unpin preset' : 'Pin preset'}
        >
          <Star size={12} fill={preset.pinned ? 'currentColor' : 'none'} />
        </button>

        <span
          className="w-3.5 h-3.5 rounded-sm border border-ui-600 shrink-0"
          style={{ backgroundColor: preset.color }}
        />

        {isEditing ? (
          <input
            autoFocus
            type="text"
            value={draftName}
            onChange={(e) => onDraftNameChange(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename();
              if (e.key === 'Escape') onCancelRename();
            }}
            className="flex-1 min-w-0 bg-ui-900 border border-ui-600 rounded px-1.5 py-0.5 text-[11px] text-ui-200 outline-none"
          />
        ) : (
          <button
            type="button"
            disabled={!canApply}
            onClick={() => onApply(preset)}
            className={`flex-1 min-w-0 text-left truncate text-[11px] ${
              canApply ? 'text-ui-200 hover:text-ui-200' : 'text-ui-500 cursor-default'
            }`}
            title={canApply ? 'Apply preset' : 'Select a matching element to apply'}
          >
            {preset.name}
          </button>
        )}

        <span className="text-[10px] font-mono text-ui-500 shrink-0">
          {preset.width}px{Number(preset.gap) > 0 ? ` · gap ${preset.gap}` : ''}
        </span>
      </div>

      <div className="flex items-center justify-end gap-0.5">
        <button
          type="button"
          disabled={!canMoveUp}
          onClick={() => onMove(preset.id, -1)}
          className={`p-1 ${canMoveUp ? 'text-ui-400 hover:text-ui-200' : 'text-ui-700 cursor-not-allowed'}`}
          title="Move up"
        >
          <ChevronUp size={12} />
        </button>
        <button
          type="button"
          disabled={!canMoveDown}
          onClick={() => onMove(preset.id, 1)}
          className={`p-1 ${canMoveDown ? 'text-ui-400 hover:text-ui-200' : 'text-ui-700 cursor-not-allowed'}`}
          title="Move down"
        >
          <ChevronDown size={12} />
        </button>
        <button
          type="button"
          onClick={() => onStartRename(preset)}
          className="p-1 text-ui-400 hover:text-ui-200"
          title="Rename preset"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(preset.id)}
          className="p-1 text-ui-500 hover:text-red-400"
          title="Delete preset"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
};

const OutlinePresetsWindow = ({
  tab,
  onTabChange,
  nodePresets,
  linkPresets,
  activeOutline,
  canApply,
  onApply,
  onUpdatePresets,
}) => {
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState('');

  useEffect(() => {
    setEditingId(null);
    setDraftName('');
  }, [tab]);

  const presets = tab === 'nodes' ? nodePresets : linkPresets;
  const { pinned, unpinned } = partitionOutlinePresets(presets);
  const current = activeOutline || { color: '', width: -1 };

  const updateCurrentList = (nextList) => {
    onUpdatePresets(tab, nextList);
  };

  const renderGroup = (group, label) => {
    if (group.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-ui-500 px-0.5">{label}</div>
        {group.map((preset, index) => (
          <OutlinePresetRow
            key={preset.id}
            preset={preset}
            isActive={outlinesMatch(preset, current)}
            canApply={canApply}
            canMoveUp={index > 0}
            canMoveDown={index < group.length - 1}
            editingId={editingId}
            draftName={draftName}
            onDraftNameChange={setDraftName}
            onStartRename={(item) => {
              setEditingId(item.id);
              setDraftName(item.name);
            }}
            onCommitRename={() => {
              if (editingId) {
                updateCurrentList(renameOutlinePreset(presets, editingId, draftName));
              }
              setEditingId(null);
              setDraftName('');
            }}
            onCancelRename={() => {
              setEditingId(null);
              setDraftName('');
            }}
            onApply={onApply}
            onTogglePin={(id) => updateCurrentList(toggleOutlinePresetPinned(presets, id))}
            onMove={(id, direction) => updateCurrentList(moveOutlinePreset(presets, id, direction))}
            onDelete={(id) => updateCurrentList(presets.filter((preset) => preset.id !== id))}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="absolute bottom-4 right-[336px] z-30 w-72 max-h-[min(420px,55vh)] flex flex-col rounded-xl border border-ui-700 bg-ui-900/95 shadow-2xl backdrop-blur-sm overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-ui-800">
        <div className="text-[11px] font-bold uppercase tracking-wider text-ui-300 mb-2">
          Outline Presets
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-ui-950 p-1">
          {[
            { id: 'nodes', label: 'Nodes' },
            { id: 'links', label: 'Links' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                tab === item.id
                  ? 'bg-ui-accent text-ui-on-accent'
                  : 'text-ui-400 hover:text-ui-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {presets.length === 0 ? (
          <div className="rounded border border-dashed border-ui-800 bg-ui-950 px-3 py-4 text-center text-[11px] text-ui-500">
            No {tab === 'nodes' ? 'node' : 'link'} outline presets yet.
          </div>
        ) : (
          <>
            {renderGroup(pinned, 'Pinned')}
            {renderGroup(unpinned, pinned.length > 0 ? 'Other' : 'All')}
          </>
        )}
      </div>

      {!canApply && (
        <div className="px-3 py-2 border-t border-ui-800 text-[10px] text-ui-500">
          Select a {tab === 'nodes' ? 'node' : 'link'} to apply a preset.
        </div>
      )}
    </div>
  );
};

// --- Components ---

const ToolbarButton = ({ active, onClick, icon, label }) => {
  const Icon = icon;
  return (
  <button
    onClick={onClick}
    title={label}
    className={`p-3 rounded-lg transition-all duration-200 flex flex-col items-center justify-center gap-1 min-w-[60px]
      ${active 
        ? 'bg-ui-accent text-ui-on-accent shadow-lg shadow-ui-accent-glow/50 border border-ui-accent-soft' 
        : 'bg-ui-800 text-ui-400 hover:bg-ui-700 hover:text-ui-200 border border-ui-700'}`}
  >
    <Icon size={20} />
    <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
  </button>
  );
};

/** Slim utility control for Settings / Import / Export — not a tool. */
const UtilityButton = ({ active, onClick, icon, label }) => {
  const Icon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`w-12 h-12 rounded-md transition-colors flex flex-col items-center justify-center gap-0.5 ${
        active
          ? 'text-ui-accent-soft bg-ui-800/80'
          : 'text-ui-500 hover:text-ui-200 hover:bg-ui-800/60'
      }`}
    >
      <Icon size={18} />
      <span className="text-[8px] font-medium uppercase tracking-wider">{label}</span>
    </button>
  );
};

const renderNodeGeometry = (shape, props) => {
  const join = props.strokeLinejoin || 'miter';
  switch (shape) {
    case 'square':
      return <rect x="6" y="6" width="36" height="36" rx="6" {...props} />;
    case 'diamond':
      return <rect x="10" y="10" width="28" height="28" rx="3" transform="rotate(45 24 24)" {...props} />;
    case 'hexagon':
      return <polygon points="24,4 43,14 43,34 24,44 5,34 5,14" strokeLinejoin={join} {...props} />;
    case 'triangle':
      return <polygon points="24,6 42,38 6,38" strokeLinejoin={join} {...props} />;
    case 'circle':
    default:
      return <circle cx="24" cy="24" r="18" {...props} />;
  }
};

// Helper to render SVG shapes with a solid offset outline ring
const NodeShape = ({ shape, color, isSelected, outlineColor, outlineWidth, outlineGap }) => {
  const strokeWidth = isSelected ? 3.5 : 2.5;
  const ow = Math.max(0, Number(outlineWidth) || 0);
  const gap = Math.max(0, Number(outlineGap) || 0);
  const oc = outlineColor || DEFAULT_OUTLINE_COLOR;
  const baseRadius = 18;
  const outlineOffset = strokeWidth / 2 + gap + (ow > 0 ? ow / 2 : 0);
  const outlineScale = ow > 0 ? (baseRadius + outlineOffset) / baseRadius : 1;

  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      className="absolute top-0 left-0 overflow-visible"
      style={{ overflow: 'visible' }}
    >
      {ow > 0 && (
        <g transform={`translate(24 24) scale(${outlineScale}) translate(-24 -24)`}>
          {renderNodeGeometry(shape, {
            fill: 'none',
            stroke: oc,
            strokeWidth: ow,
            strokeLinejoin: 'miter',
            strokeLinecap: 'square',
            vectorEffect: 'non-scaling-stroke',
          })}
        </g>
      )}
      {renderNodeGeometry(shape, {
        fill: 'rgb(var(--ui-panel-fill))',
        stroke: color,
        strokeWidth,
        strokeLinejoin: 'miter',
        strokeLinecap: 'square',
      })}
    </svg>
  );
};

export default function SkillTreeApp() {
  const fallbackProject = createDefaultProject();

  // --- State ---
  const [skills, setSkills] = useState(fallbackProject.skills);
  const [currentSkillId, setCurrentSkillId] = useState(fallbackProject.currentSkillId);
  const [grids, setGrids] = useState(fallbackProject.grids);
  const [nodeOutlinePresets, setNodeOutlinePresets] = useState(fallbackProject.nodeOutlinePresets);
  const [linkOutlinePresets, setLinkOutlinePresets] = useState(fallbackProject.linkOutlinePresets);
  const [uiColor, setUiColor] = useState(fallbackProject.uiColor || DEFAULT_UI_COLOR);
  const [uiBgMix, setUiBgMix] = useState(
    Number.isFinite(fallbackProject.uiBgMix) ? fallbackProject.uiBgMix : DEFAULT_UI_BG_MIX
  );
  const [uiMode, setUiMode] = useState(
    normalizeUiMode(fallbackProject.uiMode, DEFAULT_UI_MODE)
  );
  const [appliedUiColor, setAppliedUiColor] = useState(uiColor);
  const [appliedUiBgMix, setAppliedUiBgMix] = useState(uiBgMix);
  const [canvasGridStyle, setCanvasGridStyle] = useState(
    fallbackProject.canvasGridStyle || DEFAULT_GRID_STYLE
  );
  const [canvasGridSize, setCanvasGridSize] = useState(
    fallbackProject.canvasGridSize || DEFAULT_GRID_SIZE
  );
  const [canvasShowCenter, setCanvasShowCenter] = useState(
    fallbackProject.canvasShowCenter !== false
  );
  const [outlinePresetTab, setOutlinePresetTab] = useState('nodes');
  const [showSettings, setShowSettings] = useState(false);
  const [mapsPanelOpen, setMapsPanelOpen] = useState(true);
  const [ioMenu, setIoMenu] = useState(null); // 'import' | 'export'
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const [saveStatus, setSaveStatus] = useState('saved');

  // UI State
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [mode, setMode] = useState('select');
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [selectedLinkIds, setSelectedLinkIds] = useState([]);
  const [linkStartId, setLinkStartId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragNodeId, setDragNodeId] = useState(null);
  const [dragBackground, setDragBackground] = useState(false);
  const [dragCurveLinkId, setDragCurveLinkId] = useState(null);

  const containerRef = useRef(null);
  const fileInputRef = useRef(null);
  const importKindRef = useRef(null);
  const dragDepthRef = useRef(0);
  const backgroundInputRef = useRef(null);
  const hasHydratedRef = useRef(false);
  const historyRef = useRef([]);
  const redoRef = useRef([]);
  const clipboardRef = useRef(null);
  const stateRef = useRef({
    grids: fallbackProject.grids,
    skills: fallbackProject.skills,
    currentSkillId: fallbackProject.currentSkillId,
    selectedNodeIds: [],
    selectedLinkIds: [],
    canvasGridSize: fallbackProject.canvasGridSize || DEFAULT_GRID_SIZE,
  });
  const historyEnabledRef = useRef(true);
  const dragHistoryPushedRef = useRef(false);
  const dragNodeOriginsRef = useRef({});
  const modeRef = useRef(mode);
  const spacePanActiveRef = useRef(false);
  const modeBeforeSpaceRef = useRef(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const effectiveMode = spacePanActive ? 'select' : mode;

  // --- Accessors ---
  const currentGrid = grids[currentSkillId] || createEmptyGrid();
  const currentSkill = skills.find(s => s.id === currentSkillId) || skills[0];
  const currentBackground = currentGrid.background;
  const backgroundSize = getBackgroundDisplaySize(currentBackground);

  useEffect(() => {
    let cancelled = false;

    loadProject().then((project) => {
      if (cancelled) return;

      if (project) {
        setSkills(project.skills);
        setGrids(project.grids);
        setCurrentSkillId(project.currentSkillId);
        setNodeOutlinePresets(project.nodeOutlinePresets || []);
        setLinkOutlinePresets(project.linkOutlinePresets || []);
        const nextUiColor = project.uiColor || DEFAULT_UI_COLOR;
        const nextUiBgMix = Number.isFinite(project.uiBgMix) ? project.uiBgMix : DEFAULT_UI_BG_MIX;
        const nextUiMode = normalizeUiMode(project.uiMode, DEFAULT_UI_MODE);
        setUiColor(nextUiColor);
        setUiBgMix(nextUiBgMix);
        setUiMode(nextUiMode);
        setAppliedUiColor(nextUiColor);
        setAppliedUiBgMix(nextUiBgMix);
        setCanvasGridStyle(project.canvasGridStyle || DEFAULT_GRID_STYLE);
        setCanvasGridSize(project.canvasGridSize || DEFAULT_GRID_SIZE);
        setCanvasShowCenter(project.canvasShowCenter !== false);
      }

      hasHydratedRef.current = true;
      requestAnimationFrame(centerView);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedUiColor(uiColor);
      setAppliedUiBgMix(uiBgMix);
    }, 250);

    return () => clearTimeout(timer);
  }, [uiColor, uiBgMix]);

  useEffect(() => {
    if (!hasHydratedRef.current) return undefined;

    setSaveStatus('saving');
    const timer = setTimeout(() => {
      saveProject({
        skills,
        grids,
        currentSkillId,
        nodeOutlinePresets,
        linkOutlinePresets,
        uiColor,
        uiBgMix,
        uiMode,
        canvasGridStyle,
        canvasGridSize,
        canvasShowCenter,
      })
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('error'));
    }, 400);

    return () => clearTimeout(timer);
  }, [
    skills,
    grids,
    currentSkillId,
    nodeOutlinePresets,
    linkOutlinePresets,
    uiColor,
    uiBgMix,
    uiMode,
    canvasGridStyle,
    canvasGridSize,
    canvasShowCenter,
  ]);

  useEffect(() => {
    if (selectedNodeIds.length > 0) {
      setOutlinePresetTab('nodes');
    } else if (selectedLinkIds.length > 0) {
      setOutlinePresetTab('links');
    }
  }, [selectedNodeIds, selectedLinkIds]);

  useEffect(() => {
    stateRef.current = {
      grids,
      skills,
      currentSkillId,
      selectedNodeIds,
      selectedLinkIds,
      canvasGridSize,
    };
  }, [grids, skills, currentSkillId, selectedNodeIds, selectedLinkIds, canvasGridSize]);

  // --- Helpers ---
  const generateId = (prefix='node') => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const snapToGrid = (val) => Math.round(val / canvasGridSize) * canvasGridSize;
  const cloneData = (value) => JSON.parse(JSON.stringify(value));

  const pushHistory = () => {
    if (!historyEnabledRef.current || !hasHydratedRef.current) return;
    const snapshot = {
      grids: cloneData(stateRef.current.grids),
      skills: cloneData(stateRef.current.skills),
      currentSkillId: stateRef.current.currentSkillId,
      selectedNodeIds: [...(stateRef.current.selectedNodeIds || [])],
      selectedLinkIds: [...(stateRef.current.selectedLinkIds || [])],
    };
    historyRef.current.push(snapshot);
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
    }
    redoRef.current = [];
  };

  const applyHistorySnapshot = (snapshot) => {
    historyEnabledRef.current = false;
    setGrids(snapshot.grids);
    setSkills(snapshot.skills);
    setCurrentSkillId(snapshot.currentSkillId);
    setSelectedNodeIds(snapshot.selectedNodeIds || (snapshot.selectedNodeId ? [snapshot.selectedNodeId] : []));
    setSelectedLinkIds(snapshot.selectedLinkIds || (snapshot.selectedLinkId ? [snapshot.selectedLinkId] : []));
    setLinkStartId(null);
    queueMicrotask(() => {
      historyEnabledRef.current = true;
    });
  };

  const undo = () => {
    if (historyRef.current.length === 0) return;
    const current = {
      grids: cloneData(stateRef.current.grids),
      skills: cloneData(stateRef.current.skills),
      currentSkillId: stateRef.current.currentSkillId,
      selectedNodeIds: [...(stateRef.current.selectedNodeIds || [])],
      selectedLinkIds: [...(stateRef.current.selectedLinkIds || [])],
    };
    const previous = historyRef.current.pop();
    redoRef.current.push(current);
    applyHistorySnapshot(previous);
  };

  const redo = () => {
    if (redoRef.current.length === 0) return;
    const current = {
      grids: cloneData(stateRef.current.grids),
      skills: cloneData(stateRef.current.skills),
      currentSkillId: stateRef.current.currentSkillId,
      selectedNodeIds: [...(stateRef.current.selectedNodeIds || [])],
      selectedLinkIds: [...(stateRef.current.selectedLinkIds || [])],
    };
    const next = redoRef.current.pop();
    historyRef.current.push(current);
    applyHistorySnapshot(next);
  };

  const screenToWorld = (sx, sy) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (sx - rect.left - view.x) / view.zoom,
      y: (sy - rect.top - view.y) / view.zoom
    };
  };

  const centerView = () => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    setView(prev => ({
      ...prev,
      x: width / 2,
      y: height / 2,
    }));
  };

  // --- Actions ---

  const updateCurrentGrid = (updater, { recordHistory = true } = {}) => {
    if (recordHistory) pushHistory();
    setGrids(prev => ({
      ...prev,
      [currentSkillId]: updater(prev[currentSkillId] || createEmptyGrid())
    }));
  };

  const updateGridBackground = (fields, options) => {
    updateCurrentGrid(grid => ({
      ...grid,
      background: { ...grid.background, ...fields },
    }), options);
  };

  const handleAddNode = (worldX, worldY) => {
    const newNode = {
      id: generateId('node'),
      x: snapToGrid(worldX),
      y: snapToGrid(worldY),
      // Generic Data Fields
      name: 'New Node',
      type: 'Skill',
      value: '1',
      cost: 1,
      // Visual Customization
      shape: 'circle',
      color: currentSkill.color, // Inherit skill color by default
      iconKey: 'star',
      outlineColor: DEFAULT_OUTLINE_COLOR,
      outlineWidth: 0,
      outlineGap: 0,
    };

    updateCurrentGrid(grid => ({
      ...grid,
      nodes: [...grid.nodes, newNode]
    }));
    
    // Auto-select new node
    setMode('select');
    setSelectedNodeIds([newNode.id]);
    setSelectedLinkIds([]);
  };

  const deleteNode = (id) => {
    updateCurrentGrid(grid => ({
      ...grid,
      nodes: grid.nodes.filter(n => n.id !== id),
      connections: grid.connections.filter(c => c.from !== id && c.to !== id)
    }));
    setSelectedNodeIds((prev) => prev.filter((nodeId) => nodeId !== id));
  };

  const deleteNodes = (ids) => {
    const idSet = new Set(ids);
    if (idSet.size === 0) return;
    updateCurrentGrid((grid) => ({
      ...grid,
      nodes: grid.nodes.filter((n) => !idSet.has(n.id)),
      connections: grid.connections.filter((c) => !idSet.has(c.from) && !idSet.has(c.to)),
    }));
    setSelectedNodeIds((prev) => prev.filter((nodeId) => !idSet.has(nodeId)));
  };

  const updateNode = (id, fields, options) => {
    updateCurrentGrid(grid => ({
      ...grid,
      nodes: grid.nodes.map(n => n.id === id ? { ...n, ...fields } : n)
    }), options);
  };

  const toggleConnection = (id1, id2) => {
    if (id1 === id2) return;
    updateCurrentGrid(grid => {
      const existingIndex = grid.connections.findIndex(
        c => (c.from === id1 && c.to === id2) || (c.from === id2 && c.to === id1)
      );
      let newConns = [...grid.connections];
      if (existingIndex >= 0) {
        newConns.splice(existingIndex, 1);
        setSelectedLinkIds([]);
      } else {
        newConns.push({
          id: generateId('link'),
          from: id1,
          to: id2,
          curve: 0,
          bendMode: 'curve',
          color: DEFAULT_LINK_COLOR,
          style: 'solid',
          lines: 1,
          outlineColor: DEFAULT_OUTLINE_COLOR,
          outlineWidth: 0,
          outlineGap: 0,
        });
      }
      return { ...grid, connections: newConns };
    });
  };

  const updateConnection = (id, fields, options) => {
    updateCurrentGrid(grid => ({
      ...grid,
      connections: grid.connections.map(c => c.id === id ? { ...c, ...fields } : c)
    }), options);
  };

  const deleteConnection = (id) => {
    updateCurrentGrid(grid => ({
      ...grid,
      connections: grid.connections.filter(c => c.id !== id)
    }));
    setSelectedLinkIds((prev) => prev.filter((linkId) => linkId !== id));
  };

  const deleteConnections = (ids) => {
    const idSet = new Set(ids);
    if (idSet.size === 0) return;
    updateCurrentGrid((grid) => ({
      ...grid,
      connections: grid.connections.filter((c) => !idSet.has(c.id)),
    }));
    setSelectedLinkIds((prev) => prev.filter((linkId) => !idSet.has(linkId)));
  };

  const copySelectedNode = () => {
    const grid = stateRef.current.grids[stateRef.current.currentSkillId] || createEmptyGrid();
    const ids = stateRef.current.selectedNodeIds || [];
    const nodes = grid.nodes.filter((n) => ids.includes(n.id));
    if (!nodes.length) return false;
    clipboardRef.current = {
      nodes: cloneData(nodes),
    };
    return true;
  };

  const pasteClipboard = () => {
    const clip = clipboardRef.current;
    if (!clip?.nodes?.length) return false;

    const offset = stateRef.current.canvasGridSize || DEFAULT_GRID_SIZE;
    const newNodes = clip.nodes.map((node) => ({
      ...cloneData(node),
      id: generateId('node'),
      x: snapToGrid(node.x + offset),
      y: snapToGrid(node.y + offset),
      name: node.name ? `${node.name} Copy` : 'New Node',
    }));

    updateCurrentGrid((grid) => ({
      ...grid,
      nodes: [...grid.nodes, ...newNodes],
    }));
    setMode('select');
    setSelectedNodeIds(newNodes.map((n) => n.id));
    setSelectedLinkIds([]);
    return true;
  };

  const cutSelectedNode = () => {
    if (!copySelectedNode()) return false;
    const ids = [...(stateRef.current.selectedNodeIds || [])];
    if (ids.length) deleteNodes(ids);
    return true;
  };

  const shortcutsRef = useRef({});
  shortcutsRef.current = {
    undo,
    redo,
    copySelectedNode,
    pasteClipboard,
    cutSelectedNode,
    deleteNode,
    deleteNodes,
    deleteConnection,
    deleteConnections,
    selectedNodeIds,
    selectedLinkIds,
    beginSpacePan: () => {
      if (spacePanActiveRef.current) return;
      spacePanActiveRef.current = true;
      modeBeforeSpaceRef.current = modeRef.current;
      setSpacePanActive(true);
    },
    endSpacePan: () => {
      if (!spacePanActiveRef.current) return;
      spacePanActiveRef.current = false;
      setSpacePanActive(false);
      const previous = modeBeforeSpaceRef.current;
      modeBeforeSpaceRef.current = null;
      if (previous === 'add' || previous === 'link') {
        setMode(previous);
      }
    },
  };

  useEffect(() => {
    const isEditableTarget = (target) => {
      if (!target || !(target instanceof Element)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
    };

    const onKeyDown = (e) => {
      if (isEditableTarget(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const actions = shortcutsRef.current;

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) actions.beginSpacePan();
        return;
      }

      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        actions.undo();
        return;
      }

      if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        actions.redo();
        return;
      }

      if (mod && key === 'c') {
        if (actions.copySelectedNode()) e.preventDefault();
        return;
      }

      if (mod && key === 'x') {
        if (actions.cutSelectedNode()) e.preventDefault();
        return;
      }

      if (mod && key === 'v') {
        if (actions.pasteClipboard()) e.preventDefault();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (actions.selectedNodeIds?.length) {
          e.preventDefault();
          actions.deleteNodes(actions.selectedNodeIds);
          return;
        }
        if (actions.selectedLinkIds?.length) {
          e.preventDefault();
          actions.deleteConnections(actions.selectedLinkIds);
        }
      }
    };

    const onKeyUp = (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        shortcutsRef.current.endSpacePan();
      }
    };

    const onWindowBlur = () => {
      shortcutsRef.current.endSpacePan();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, []);

  const saveNodeOutlinePreset = () => {
    if (selectedNodeIds.length !== 1) return;
    const node = currentGrid.nodes.find(n => n.id === selectedNodeIds[0]);
    if (!node) return;
    const preset = {
      id: generateId('nodeOutline'),
      name: `Node ${nodeOutlinePresets.length + 1}`,
      color: node.outlineColor || DEFAULT_OUTLINE_COLOR,
      width: node.outlineWidth || 0,
      gap: node.outlineGap || 0,
      pinned: false,
    };
    if (preset.width <= 0) return;
    if (nodeOutlinePresets.some((existing) => outlinesMatch(existing, preset))) return;
    setNodeOutlinePresets([...nodeOutlinePresets, preset]);
  };

  const saveLinkOutlinePreset = () => {
    if (selectedLinkIds.length !== 1) return;
    const link = currentGrid.connections.find(c => c.id === selectedLinkIds[0]);
    if (!link) return;
    const preset = {
      id: generateId('linkOutline'),
      name: `Link ${linkOutlinePresets.length + 1}`,
      color: link.outlineColor || DEFAULT_OUTLINE_COLOR,
      width: link.outlineWidth || 0,
      gap: link.outlineGap || 0,
      pinned: false,
    };
    if (preset.width <= 0) return;
    if (linkOutlinePresets.some((existing) => outlinesMatch(existing, preset))) return;
    setLinkOutlinePresets([...linkOutlinePresets, preset]);
  };

  const updateOutlinePresetList = (tab, nextList) => {
    if (tab === 'nodes') setNodeOutlinePresets(nextList);
    else setLinkOutlinePresets(nextList);
  };

  const applyOutlinePreset = (preset) => {
    if (outlinePresetTab === 'nodes' && selectedNodeIds.length === 1) {
      updateNode(selectedNodeIds[0], {
        outlineColor: preset.color,
        outlineWidth: preset.width,
        outlineGap: preset.gap || 0,
      });
      return;
    }
    if (outlinePresetTab === 'links' && selectedLinkIds.length === 1) {
      updateConnection(selectedLinkIds[0], {
        outlineColor: preset.color,
        outlineWidth: preset.width,
        outlineGap: preset.gap || 0,
      });
    }
  };

  // --- Skill Management ---
  const addNewSkill = () => {
    pushHistory();
    const id = generateId('skill');
    const newSkill = { id, name: 'New Node Map', color: '#6366f1' };
    setSkills([...skills, newSkill]);
    setGrids(prev => ({ ...prev, [id]: createEmptyGrid() }));
    setCurrentSkillId(id);
    setSelectedNodeIds([]);
    setSelectedLinkIds([]);
    requestAnimationFrame(centerView);
  };

  const selectSkill = (id) => {
    if (id === currentSkillId) return;
    setCurrentSkillId(id);
    setSelectedNodeIds([]);
    setSelectedLinkIds([]);
    requestAnimationFrame(centerView);
  };

  const updateSkill = (id, fields) => {
    pushHistory();
    const previous = skills.find(s => s.id === id);
    setSkills(skills.map(s => s.id === id ? { ...s, ...fields } : s));

    // Keep nodes that still use the map's theme color in sync
    if (previous && typeof fields.color === 'string' && fields.color !== previous.color) {
      const oldColor = previous.color.toLowerCase();
      setGrids(prev => {
        const grid = prev[id];
        if (!grid) return prev;
        return {
          ...prev,
          [id]: {
            ...grid,
            nodes: grid.nodes.map(n =>
              typeof n.color === 'string' && n.color.toLowerCase() === oldColor
                ? { ...n, color: fields.color }
                : n
            ),
          },
        };
      });
    }
  };

  const deleteSkill = (id) => {
    if (skills.length <= 1) {
      alert('Cannot delete the last node map.');
      return;
    }
    if (!confirm('Are you sure? This will delete the entire node map.')) return;
    pushHistory();
    const newSkills = skills.filter(s => s.id !== id);
    const newGrids = { ...grids };
    delete newGrids[id];
    setSkills(newSkills);
    setGrids(newGrids);
    setCurrentSkillId(newSkills[0].id);
    setSelectedNodeIds([]);
    setSelectedLinkIds([]);
  };

  const chooseMode = (nextMode) => {
    if (spacePanActiveRef.current) {
      modeBeforeSpaceRef.current = nextMode;
    }
    setMode(nextMode);
  };

  // --- Event Handlers ---

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    const shiftKey = e.shiftKey;

    if (e.target.dataset.curveHandle) {
      if (effectiveMode === 'select') {
        const linkId = e.target.dataset.curveHandle;
        const nextLinks = shiftKey
          ? (selectedLinkIds.includes(linkId)
            ? selectedLinkIds.filter((id) => id !== linkId)
            : [...selectedLinkIds, linkId])
          : (selectedLinkIds.includes(linkId) && selectedLinkIds.length > 1
            ? selectedLinkIds
            : [linkId]);
        setSelectedLinkIds(nextLinks);
        setSelectedNodeIds([]);
        // Double-click toggles curved ↔ angled bend for all selected links
        if (e.detail >= 2) {
          const grid = grids[currentSkillId] || createEmptyGrid();
          const primary = grid.connections.find((c) => c.id === linkId);
          if (primary) {
            const nextMode = primary.bendMode === 'angled' ? 'curve' : 'angled';
            const targets = nextLinks.length ? nextLinks : [linkId];
            updateCurrentGrid((g) => ({
              ...g,
              connections: g.connections.map((c) => (
                targets.includes(c.id) ? { ...c, bendMode: nextMode } : c
              )),
            }));
          }
          return;
        }
        dragHistoryPushedRef.current = false;
        setDragCurveLinkId(linkId);
        setIsDragging(true);
      }
      return;
    }

    if (e.target.dataset.backgroundImage === 'true') {
      if (effectiveMode === 'select') {
        dragHistoryPushedRef.current = false;
        setSelectedNodeIds([]);
        setSelectedLinkIds([]);
        setDragBackground(true);
        setIsDragging(true);
        setDragStart({
          x: e.clientX,
          y: e.clientY,
          bgX: currentBackground.x,
          bgY: currentBackground.y,
        });
      }
      return;
    }

    if (e.target.tagName === 'path' && e.target.dataset.linkId) {
      if (effectiveMode === 'select') {
        const linkId = e.target.dataset.linkId;
        if (shiftKey) {
          setSelectedLinkIds((prev) => (
            prev.includes(linkId)
              ? prev.filter((id) => id !== linkId)
              : [...prev, linkId]
          ));
        } else {
          setSelectedLinkIds([linkId]);
        }
        setSelectedNodeIds([]);
        return;
      }
    }

    const { x, y } = screenToWorld(e.clientX, e.clientY);
    const target = e.target.closest('.grid-node');
    const nodeId = target ? target.dataset.id : null;

    if (effectiveMode === 'add' && !nodeId) {
      handleAddNode(x, y);
      return;
    }

    if (effectiveMode === 'link') {
      if (nodeId) {
        if (linkStartId === null) {
          setLinkStartId(nodeId);
        } else {
          toggleConnection(linkStartId, nodeId);
          setLinkStartId(null);
        }
      } else {
        setLinkStartId(null);
      }
      return;
    }

    if (nodeId) {
      if (effectiveMode === 'select') {
        dragHistoryPushedRef.current = false;
        let nextSelected = selectedNodeIds;
        if (shiftKey) {
          nextSelected = selectedNodeIds.includes(nodeId)
            ? selectedNodeIds.filter((id) => id !== nodeId)
            : [...selectedNodeIds, nodeId];
          setSelectedNodeIds(nextSelected);
          setSelectedLinkIds([]);
          if (!nextSelected.includes(nodeId)) {
            return;
          }
        } else if (!selectedNodeIds.includes(nodeId)) {
          nextSelected = [nodeId];
          setSelectedNodeIds(nextSelected);
          setSelectedLinkIds([]);
        } else {
          nextSelected = selectedNodeIds;
          setSelectedLinkIds([]);
        }

        const grid = grids[currentSkillId] || createEmptyGrid();
        const origins = {};
        for (const id of nextSelected) {
          const node = grid.nodes.find((n) => n.id === id);
          if (node) origins[id] = { x: node.x, y: node.y };
        }
        dragNodeOriginsRef.current = origins;
        setDragNodeId(nodeId);
        setIsDragging(true);
        setDragStart({ x, y });
      }
    } else {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setDragNodeId(null);
      dragNodeOriginsRef.current = {};
      if (effectiveMode === 'select') {
        setSelectedNodeIds([]);
        setSelectedLinkIds([]);
      }
    }
  };

  const onMouseMove = (e) => {
    if (!isDragging) return;
    if (dragCurveLinkId) {
      if (!dragHistoryPushedRef.current) {
        pushHistory();
        dragHistoryPushedRef.current = true;
      }
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      const link = (grids[currentSkillId] || createEmptyGrid()).connections.find(
        (c) => c.id === dragCurveLinkId
      );
      if (!link) return;
      const start = (grids[currentSkillId] || createEmptyGrid()).nodes.find((n) => n.id === link.from);
      const end = (grids[currentSkillId] || createEmptyGrid()).nodes.find((n) => n.id === link.to);
      if (!start || !end) return;
      const nextCurve = curveFromHandlePoint(
        start.x,
        start.y,
        end.x,
        end.y,
        x,
        y,
        link.bendMode === 'angled' ? 'angled' : 'curve'
      );
      const linkTargets = selectedLinkIds.includes(dragCurveLinkId)
        ? selectedLinkIds
        : [dragCurveLinkId];
      updateCurrentGrid((grid) => ({
        ...grid,
        connections: grid.connections.map((c) => (
          linkTargets.includes(c.id) ? { ...c, curve: nextCurve } : c
        )),
      }), { recordHistory: false });
      return;
    }
    if (dragBackground) {
      if (!dragHistoryPushedRef.current) {
        pushHistory();
        dragHistoryPushedRef.current = true;
      }
      const dx = (e.clientX - dragStart.x) / view.zoom;
      const dy = (e.clientY - dragStart.y) / view.zoom;
      updateGridBackground({
        x: dragStart.bgX + dx,
        y: dragStart.bgY + dy,
      }, { recordHistory: false });
      return;
    }
    if (dragNodeId) {
      const { x, y } = screenToWorld(e.clientX, e.clientY);
      const origin = dragNodeOriginsRef.current[dragNodeId];
      if (!origin) return;
      const nextPrimaryX = snapToGrid(origin.x + (x - dragStart.x));
      const nextPrimaryY = snapToGrid(origin.y + (y - dragStart.y));
      const dx = nextPrimaryX - origin.x;
      const dy = nextPrimaryY - origin.y;
      if (!dragHistoryPushedRef.current) {
        pushHistory();
        dragHistoryPushedRef.current = true;
      }
      updateCurrentGrid((grid) => ({
        ...grid,
        nodes: grid.nodes.map((n) => {
          const startPos = dragNodeOriginsRef.current[n.id];
          if (!startPos) return n;
          return { ...n, x: startPos.x + dx, y: startPos.y + dy };
        }),
      }), { recordHistory: false });
    } else {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const onMouseUp = () => {
    setIsDragging(false);
    setDragNodeId(null);
    setDragBackground(false);
    setDragCurveLinkId(null);
    dragHistoryPushedRef.current = false;
    dragNodeOriginsRef.current = {};
  };

  const onWheel = (e) => {
    const scaleAmount = -e.deltaY * 0.001;
    const newZoom = Math.min(Math.max(view.zoom + scaleAmount, 0.2), 4);
    setView(prev => ({ ...prev, zoom: newZoom }));
  };

  const exportProject = async () => {
    try {
      const { blob, filename } = await buildExportBlob({
        skills,
        grids,
        currentSkillId,
        nodeOutlinePresets,
        linkOutlinePresets,
        uiColor,
        uiBgMix,
        uiMode,
        canvasGridStyle,
        canvasGridSize,
        canvasShowCenter,
      });
      downloadBlob(blob, filename);
    } catch (err) {
      alert(err.message || 'Could not export project.');
    }
  };

  const exportCurrentSkill = async () => {
    try {
      const { blob, filename } = await buildSkillExportBlob(currentSkill, currentGrid);
      downloadBlob(blob, filename);
    } catch (err) {
      alert(err.message || 'Could not export node map.');
    }
  };

  const applyLibraryImport = async (project) => {
    pushHistory();
    setSkills(project.skills);
    setGrids(project.grids);
    setCurrentSkillId(project.currentSkillId);
    setNodeOutlinePresets(project.nodeOutlinePresets || []);
    setLinkOutlinePresets(project.linkOutlinePresets || []);
    const nextUiColor = project.uiColor || DEFAULT_UI_COLOR;
    const nextUiBgMix = Number.isFinite(project.uiBgMix) ? project.uiBgMix : DEFAULT_UI_BG_MIX;
    const nextUiMode = normalizeUiMode(project.uiMode, DEFAULT_UI_MODE);
    setUiColor(nextUiColor);
    setUiBgMix(nextUiBgMix);
    setUiMode(nextUiMode);
    setAppliedUiColor(nextUiColor);
    setAppliedUiBgMix(nextUiBgMix);
    setCanvasGridStyle(project.canvasGridStyle || DEFAULT_GRID_STYLE);
    setCanvasGridSize(project.canvasGridSize || DEFAULT_GRID_SIZE);
    setCanvasShowCenter(project.canvasShowCenter !== false);
    setSelectedNodeIds([]);
    setSelectedLinkIds([]);
    setLinkStartId(null);
    requestAnimationFrame(centerView);
    await saveProject(project);
    setSaveStatus('saved');
  };

  const applySkillImport = async (skillData) => {
    pushHistory();
    const skillId = stateRef.current.currentSkillId;
    const nextSkill = {
      id: skillId,
      name: skillData.skill.name,
      color: skillData.skill.color,
    };
    const nextSkills = stateRef.current.skills.map((skill) =>
      skill.id === skillId ? nextSkill : skill
    );
    const nextGrids = {
      ...stateRef.current.grids,
      [skillId]: skillData.grid,
    };

    setSkills(nextSkills);
    setGrids(nextGrids);
    setSelectedNodeIds([]);
    setSelectedLinkIds([]);
    setLinkStartId(null);
    requestAnimationFrame(centerView);

    await saveProject({
      skills: nextSkills,
      grids: nextGrids,
      currentSkillId: skillId,
      nodeOutlinePresets,
      linkOutlinePresets,
      uiColor,
      uiBgMix,
      uiMode,
      canvasGridStyle,
      canvasGridSize,
      canvasShowCenter,
    });
    setSaveStatus('saved');
  };

  const handleImportedPayload = async (payload) => {
    if (payload.kind === IMPORT_KIND_SKILL) {
      await applySkillImport(payload.skill);
      return;
    }
    await applyLibraryImport(payload.project);
  };

  const importFromFile = async (file, expectedKind = null) => {
    if (!file) return;

    try {
      const payload = await parseImportedFile(file, expectedKind);
      await handleImportedPayload(payload);
    } catch (err) {
      alert(err.message || 'Could not import project file.');
    }
  };

  const importProject = async (e) => {
    const file = e.target.files[0];
    const expectedKind = importKindRef.current;
    importKindRef.current = null;
    e.target.value = '';
    await importFromFile(file, expectedKind);
  };

  const openImportPicker = (kind) => {
    importKindRef.current = kind;
    setIoMenu(null);
    fileInputRef.current?.click();
  };

  const handleExportChoice = async (kind) => {
    setIoMenu(null);
    if (kind === IMPORT_KIND_SKILL) {
      await exportCurrentSkill();
      return;
    }
    await exportProject();
  };

  const isImportableDrag = (event) => {
    const items = event.dataTransfer?.items;
    if (!items?.length) {
      return Array.from(event.dataTransfer?.files || []).some((file) => {
        const name = file.name.toLowerCase();
        return name.endsWith('.json') || name.endsWith('.zip');
      });
    }

    return Array.from(items).some((item) => {
      if (item.kind !== 'file') return false;
      const type = (item.type || '').toLowerCase();
      if (type.includes('json') || type.includes('zip')) return true;
      // Browsers often omit type while dragging; still show overlay for file drops
      return type === '' || type.startsWith('application/');
    });
  };

  const onWindowDragEnter = (event) => {
    if (!isImportableDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsFileDragActive(true);
  };

  const onWindowDragOver = (event) => {
    if (!isFileDragActive && !isImportableDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  };

  const onWindowDragLeave = (event) => {
    if (!isFileDragActive) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsFileDragActive(false);
    }
  };

  const onWindowDrop = async (event) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsFileDragActive(false);

    const file = Array.from(event.dataTransfer?.files || []).find((entry) => {
      const name = entry.name.toLowerCase();
      return name.endsWith('.json') || name.endsWith('.zip');
    });

    if (!file) {
      alert('Drop a .json or .zip node map/library export.');
      return;
    }

    // Auto-detect skill vs library from file contents
    await importFromFile(file, null);
  };

  const handleBackgroundUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = Math.max(img.width, img.height, 1);
        updateGridBackground({
          src: event.target.result,
          baseWidth: img.width,
          baseHeight: img.height,
          scale: 400 / maxDim,
          x: 0,
          y: 0,
        });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // --- Render Helpers ---

  const selectedNode = selectedNodeIds.length === 1
    ? currentGrid.nodes.find((n) => n.id === selectedNodeIds[0])
    : null;
  const selectedLink = selectedLinkIds.length === 1
    ? currentGrid.connections.find((c) => c.id === selectedLinkIds[0])
    : null;
  const multiNodeSelection = selectedNodeIds.length > 1;
  const multiLinkSelection = selectedLinkIds.length > 1;
  const uiThemeStyle = buildUiThemeVars(appliedUiColor, uiMode);
  const defaultBgChannels = getCanvasBackgroundChannels(appliedUiColor, 0, uiMode);
  const canvasBgChannels = getCanvasBackgroundChannels(appliedUiColor, appliedUiBgMix, uiMode);
  const canvasBgDarkChannels = getCanvasBackgroundChannels(appliedUiColor, -UI_BG_MIX_RANGE, uiMode);
  const canvasBgLightChannels = getCanvasBackgroundChannels(appliedUiColor, UI_BG_MIX_RANGE, uiMode);

  const graphGridStyle = (() => {
    if (canvasGridStyle === 'none') return null;
    // Align pattern so intersections land on world (0,0) and snap points
    const originShift = ((WORLD_ORIGIN_OFFSET % canvasGridSize) + canvasGridSize) % canvasGridSize;
    const backgroundPosition = `${originShift}px ${originShift}px`;

    if (canvasGridStyle === 'lines') {
      return {
        backgroundImage: `
          linear-gradient(${appliedUiColor}33 1px, transparent 1px),
          linear-gradient(90deg, ${appliedUiColor}33 1px, transparent 1px)
        `,
        backgroundSize: `${canvasGridSize}px ${canvasGridSize}px`,
        backgroundPosition,
        opacity: 0.35,
      };
    }
    return {
      // Anchor dots at tile corners so they match snap intersections
      backgroundImage: `radial-gradient(circle at 0 0, ${appliedUiColor} 2px, transparent 2px)`,
      backgroundSize: `${canvasGridSize}px ${canvasGridSize}px`,
      backgroundPosition,
      opacity: 0.18,
    };
  })();

  return (
    <div
      className="relative flex h-screen w-full bg-ui-950 text-ui-200 overflow-hidden font-sans select-none"
      style={uiThemeStyle}
      onDragEnter={onWindowDragEnter}
      onDragOver={onWindowDragOver}
      onDragLeave={onWindowDragLeave}
      onDrop={onWindowDrop}
    >
      <div className="w-20 bg-ui-900 border-r border-ui-800 flex flex-col items-center py-4 gap-3 z-20 shadow-xl">
        <div className="mb-1 text-ui-accent-soft font-black text-xs text-center px-1 leading-none">
          GRAPH<br/>OS
        </div>

        <div className="flex flex-col items-center gap-3">
          <ToolbarButton icon={Move} label="Move" active={effectiveMode === 'select'} onClick={() => chooseMode('select')} />
          <ToolbarButton icon={Plus} label="Add" active={mode === 'add' && !spacePanActive} onClick={() => chooseMode('add')} />
          <ToolbarButton icon={LinkIcon} label="Link" active={mode === 'link' && !spacePanActive} onClick={() => chooseMode('link')} />
          <ToolbarButton icon={Crosshair} label="Center" active={false} onClick={centerView} />
        </div>

        <div className="flex-1" />

        <div className="flex flex-col items-center gap-1 pt-2 border-t border-ui-800 w-14">
          <UtilityButton
            icon={Map}
            label="Maps"
            active={mapsPanelOpen}
            onClick={() => setMapsPanelOpen((open) => !open)}
          />
          <UtilityButton
            icon={Settings}
            label="Settings"
            active={showSettings}
            onClick={() => setShowSettings((open) => !open)}
          />
          <UtilityButton
            icon={Download}
            label="Export"
            active={ioMenu === 'export'}
            onClick={() => setIoMenu((menu) => (menu === 'export' ? null : 'export'))}
          />
          <UtilityButton
            icon={Upload}
            label="Import"
            active={ioMenu === 'import'}
            onClick={() => setIoMenu((menu) => (menu === 'import' ? null : 'import'))}
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.zip,application/json,application/zip"
          className="hidden"
          onChange={importProject}
        />
      </div>

      {/* NODE MAPS SIDEBAR */}
      <div
        className={`relative z-20 flex flex-col border-r border-ui-800 bg-ui-900/95 shadow-xl transition-[width] duration-200 ease-out overflow-hidden ${
          mapsPanelOpen ? 'w-64' : 'w-0 border-r-0'
        }`}
      >
        {mapsPanelOpen && (
          <>
            <div className="px-3 py-3 border-b border-ui-800 flex items-center justify-between shrink-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-ui-300 flex items-center gap-2">
                <Map size={12} className="text-ui-accent-soft" />
                Node Maps
              </div>
              <button
                type="button"
                onClick={() => setMapsPanelOpen(false)}
                className="text-ui-500 hover:text-ui-200 p-1"
                title="Collapse"
              >
                <ChevronLeft size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
              {skills.map((skill) => {
                const grid = grids[skill.id] || createEmptyGrid();
                const isActive = skill.id === currentSkillId;
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => selectSkill(skill.id)}
                    className={`w-full text-left rounded-lg border px-2.5 py-2 transition-colors ${
                      isActive
                        ? 'border-ui-accent bg-ui-accent-deep/40'
                        : 'border-transparent hover:border-ui-700 hover:bg-ui-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-ui-600"
                        style={{ backgroundColor: skill.color }}
                      />
                      <span className={`text-xs font-medium truncate ${isActive ? 'text-ui-200' : 'text-ui-400'}`}>
                        {skill.name}
                      </span>
                    </div>
                    <div className="mt-1 pl-[1.125rem] text-[10px] font-mono text-ui-500 flex gap-3">
                      <span>{grid.nodes.length} nodes</span>
                      <span>{grid.connections.length} links</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="border-t border-ui-800 p-3 space-y-3 shrink-0">
              <div>
                <label className="block text-[10px] font-bold text-ui-500 uppercase mb-1.5">Name</label>
                <input
                  type="text"
                  className="w-full bg-ui-950 border border-ui-700 rounded p-2 text-xs text-ui-200 focus:border-ui-accent-bright outline-none"
                  value={currentSkill.name}
                  onChange={(e) => updateSkill(currentSkill.id, { name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-ui-500 uppercase mb-1.5">Color</label>
                <div className="flex items-center gap-2 bg-ui-950 border border-ui-700 rounded p-2">
                  <input
                    type="color"
                    value={currentSkill.color}
                    onChange={(e) => updateSkill(currentSkill.id, { color: e.target.value })}
                    className="w-7 h-7 rounded cursor-pointer bg-transparent border-none p-0"
                  />
                  <span className="text-[10px] font-mono text-ui-500">{currentSkill.color}</span>
                </div>
                <p className="mt-1.5 text-[10px] text-ui-500 leading-relaxed">
                  Nodes using this color update with it.
                </p>
              </div>
              <button
                type="button"
                onClick={addNewSkill}
                className="w-full py-2 bg-ui-accent hover:bg-ui-accent-bright text-ui-on-accent rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-all"
              >
                <Plus size={14} /> New Node Map
              </button>
              <button
                type="button"
                onClick={() => deleteSkill(currentSkill.id)}
                className="w-full py-1.5 text-ui-500 hover:text-red-400 text-[11px] flex items-center justify-center gap-1 transition-colors"
              >
                <Trash2 size={12} /> Delete Map
              </button>
            </div>
          </>
        )}
      </div>

      {/* MAIN CANVAS */}
      <div
        className={`flex-1 relative overflow-hidden ${
          spacePanActive || effectiveMode === 'select'
            ? (isDragging && !dragNodeId && !dragBackground && !dragCurveLinkId ? 'cursor-grabbing' : 'cursor-grab')
            : 'cursor-crosshair'
        }`}
        ref={containerRef}
        style={{
          backgroundColor: `rgb(${canvasBgChannels})`,
          ['--canvas-bg']: canvasBgChannels,
        }}
      >
        {/* HUD */}
        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
          <div className="bg-ui-900/90 backdrop-blur border border-ui-700 rounded-lg p-3 flex flex-col shadow-xl">
             <div className="flex items-center gap-2 mb-2">
               <div className="w-3 h-3 rounded-full shrink-0" style={{backgroundColor: currentSkill.color}}></div>
               <div className="font-bold text-ui-200 text-sm truncate max-w-[14rem]">{currentSkill.name}</div>
             </div>
             <div className="flex gap-4 text-xs font-mono text-ui-400">
               <span>Nodes: {currentGrid.nodes.length}</span>
               <span>Links: {currentGrid.connections.length}</span>
             </div>
             <div className="text-[10px] font-mono mt-2 text-ui-500">
               {saveStatus === 'saving' && 'Saving locally...'}
               {saveStatus === 'saved' && 'Saved locally'}
               {saveStatus === 'error' && 'Local save failed'}
             </div>
          </div>
        </div>

        {/* Canvas Layer */}
        <div 
          className="absolute w-full h-full origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onWheel={onWheel}
        >
          {/* Graph grid */}
          {graphGridStyle && (
            <div
              className="absolute -top-[5000px] -left-[5000px] w-[10000px] h-[10000px] pointer-events-none"
              style={graphGridStyle}
            />
          )}

          {/* Center axes */}
          {canvasShowCenter && (
            <svg className="absolute -top-[5000px] -left-[5000px] w-[10000px] h-[10000px] overflow-visible pointer-events-none">
              <line x1="5000" y1="0" x2="5000" y2="10000" stroke="rgb(var(--ui-300))" strokeOpacity="0.45" strokeWidth="2" />
              <line x1="0" y1="5000" x2="10000" y2="5000" stroke="rgb(var(--ui-300))" strokeOpacity="0.45" strokeWidth="2" />
              <circle cx="5000" cy="5000" r="5" fill="none" stroke="rgb(var(--ui-200))" strokeOpacity="0.6" strokeWidth="2" />
            </svg>
          )}

          {/* Reference Background Image */}
          {currentBackground?.src && (
            <img
              src={currentBackground.src}
              alt=""
              draggable={false}
              data-background-image="true"
              className={`absolute select-none ${effectiveMode === 'select' ? 'pointer-events-auto cursor-move' : 'pointer-events-none'}`}
              style={{
                left: currentBackground.x,
                top: currentBackground.y,
                width: backgroundSize.width,
                height: backgroundSize.height,
                opacity: currentBackground.opacity,
                transform: 'translate(-50%, -50%)',
                ...getBackgroundImageStyle(currentBackground.pixelated),
              }}
            />
          )}

          {/* Connections */}
          <svg className="absolute -top-[5000px] -left-[5000px] w-[10000px] h-[10000px] overflow-visible pointer-events-auto">
            {currentGrid.connections.map((conn) => {
              const start = currentGrid.nodes.find(n => n.id === conn.from);
              const end = currentGrid.nodes.find(n => n.id === conn.to);
              if (!start || !end) return null;

              const style = conn.style || 'solid';
              const color = conn.color || DEFAULT_LINK_COLOR;
              const lineCount = conn.lines || 1;
              const bendMode = conn.bendMode === 'angled' ? 'angled' : 'curve';
              const { paths, hitPath } = getConnectionPaths(
                start.x + WORLD_ORIGIN_OFFSET,
                start.y + WORLD_ORIGIN_OFFSET,
                end.x + WORLD_ORIGIN_OFFSET,
                end.y + WORLD_ORIGIN_OFFSET,
                conn.curve,
                style,
                lineCount,
                bendMode
              );
              const isSelected = selectedLinkIds.includes(conn.id);
              const handle = isSelected
                ? getCurveHandlePoint(
                    start.x + WORLD_ORIGIN_OFFSET,
                    start.y + WORLD_ORIGIN_OFFSET,
                    end.x + WORLD_ORIGIN_OFFSET,
                    end.y + WORLD_ORIGIN_OFFSET,
                    conn.curve || 0,
                    bendMode
                  )
                : null;

              return (
                <g key={conn.id}>
                  <ConnectionPaths
                    paths={paths}
                    hitPath={hitPath}
                    style={style}
                    color={color}
                    isSelected={isSelected}
                    linkId={conn.id}
                    outlineColor={conn.outlineColor || DEFAULT_OUTLINE_COLOR}
                    outlineWidth={conn.outlineWidth || 0}
                    outlineGap={conn.outlineGap || 0}
                    lineCount={lineCount}
                  />
                  {handle && (
                    <circle
                      cx={handle.x}
                      cy={handle.y}
                      r={8}
                      fill="rgb(var(--ui-accent-bright))"
                      stroke="#fff"
                      strokeWidth="2"
                      className="cursor-grab"
                      data-curve-handle={conn.id}
                      style={{ pointerEvents: 'auto' }}
                    >
                      <title>Drag to bend · Double-click to toggle curved/angled</title>
                    </circle>
                  )}
                </g>
              );
            })}
            {effectiveMode === 'link' && linkStartId && (() => {
              const start = currentGrid.nodes.find(n => n.id === linkStartId);
              if(!start) return null;
              return <circle cx={start.x + WORLD_ORIGIN_OFFSET} cy={start.y + WORLD_ORIGIN_OFFSET} r={25} fill="none" stroke={currentSkill.color} strokeWidth="2" className="animate-pulse pointer-events-none"/>
            })()}
          </svg>

          {/* Nodes */}
          {currentGrid.nodes.map((node) => {
            const isSelected = selectedNodeIds.includes(node.id);
            const IconComp = ICON_MAP[node.iconKey] || Star;
            
            return (
              <div
                key={node.id}
                data-id={node.id}
                className={`grid-node absolute flex items-center justify-center text-[10px] transition-transform hover:scale-110 active:scale-95 cursor-pointer group overflow-visible ${isSelected ? 'z-50' : 'z-10'} hover:z-[60]`}
                style={{
                  left: node.x,
                  top: node.y,
                  width: '48px',
                  height: '48px',
                  transform: 'translate(-50%, -50%)' 
                }}
              >
                 {/* SVG Shape (Replaces previous Div+ClipPath) */}
                 <NodeShape
                   shape={node.shape}
                   color={node.color}
                   isSelected={isSelected}
                   outlineColor={node.outlineColor || DEFAULT_OUTLINE_COLOR}
                   outlineWidth={node.outlineWidth || 0}
                   outlineGap={node.outlineGap || 0}
                 />

                 {/* Icon Container */}
                 <div className="relative z-10" style={{ color: isSelected ? '#fff' : node.color }}>
                   <IconComp size={20} />
                 </div>

                 {/* Cost Badge */}
                 {node.cost > 0 && (
                   <div className="absolute -top-2 -right-2 bg-ui-900 text-ui-200 text-[8px] px-1.5 rounded-full border border-ui-700 font-mono shadow-md z-20">
                     {node.cost}
                   </div>
                 )}

                 {/* Hover Label — lives above sibling nodes via parent hover:z-[60] */}
                 <div className="absolute left-1/2 top-full z-[70] mt-2 -translate-x-1/2 bg-black/90 text-white px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-ui-800 shadow-lg">
                   <span className="font-bold block text-[10px] opacity-75 uppercase tracking-wider">{node.type}</span>
                   {node.name}
                 </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <div className="w-80 bg-ui-900 border-l border-ui-800 flex flex-col z-20 shadow-xl overflow-hidden">
        
        {/* NODE EDITOR */}
        {multiNodeSelection && (
          <div className="flex flex-col h-full animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-ui-800 flex justify-between items-center bg-ui-950">
              <h3 className="font-bold text-ui-200 flex items-center gap-2 text-sm uppercase tracking-wider">
                Node Inspector
              </h3>
              <button type="button" onClick={() => setSelectedNodeIds([])}>
                <X size={16} className="text-ui-500 hover:text-ui-200" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-3 text-[11px] text-amber-200/90 leading-relaxed">
                <div className="font-bold uppercase tracking-wider text-amber-300 mb-1">
                  {selectedNodeIds.length} nodes selected
                </div>
                Data editing is unavailable while multiple nodes are selected. Move them together on the canvas, or select a single node to edit its properties.
              </div>
              <div className="pointer-events-none opacity-40 select-none space-y-3" aria-disabled="true">
                <div className="h-8 rounded bg-ui-950 border border-ui-800" />
                <div className="h-8 rounded bg-ui-950 border border-ui-800" />
                <div className="h-24 rounded bg-ui-950 border border-ui-800" />
                <div className="h-8 rounded bg-ui-950 border border-ui-800" />
              </div>
              <button
                type="button"
                onClick={() => deleteNodes(selectedNodeIds)}
                className="w-full py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/50 rounded text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 size={14} /> Delete {selectedNodeIds.length} Nodes
              </button>
            </div>
          </div>
        )}

        {selectedNode && !multiNodeSelection && (
          <div className="flex flex-col h-full animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-ui-800 flex justify-between items-center bg-ui-950">
               <h3 className="font-bold text-ui-200 flex items-center gap-2 text-sm uppercase tracking-wider">
                 Node Inspector
               </h3>
               <button onClick={() => setSelectedNodeIds([])}><X size={16} className="text-ui-500 hover:text-ui-200"/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
              
              {/* Visuals Section */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-ui-500 uppercase">Appearance</div>
                
                {/* Color & Shape Row */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-[10px] text-ui-500 mb-1 block">Color</label>
                    <div className="flex items-center gap-2 bg-ui-950 border border-ui-700 rounded p-2 mb-2">
                      <input
                        type="color"
                        value={selectedNode.color}
                        onChange={(e) => updateNode(selectedNode.id, { color: e.target.value })}
                        className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                      />
                      <span className="text-xs font-mono text-ui-300">{selectedNode.color}</span>
                    </div>
                    
                    {/* Used Colors Palette */}
                    <div className="flex flex-wrap gap-1">
                      {Array.from(new Set([currentSkill.color, ...currentGrid.nodes.map(n => n.color)])).map(c => (
                        <button 
                          key={c}
                          onClick={() => updateNode(selectedNode.id, { color: c })}
                          className={`w-4 h-4 rounded-sm border border-ui-600 hover:border-ui-200 transition-colors ${selectedNode.color === c ? 'ring-1 ring-ui-200' : ''}`}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>

                  </div>
                  <div className="flex-1">
                     <label className="text-[10px] text-ui-500 mb-1 block">Shape</label>
                     <select 
                       className="w-full bg-ui-950 border border-ui-700 rounded p-2 text-xs text-ui-200 outline-none focus:border-ui-accent-bright h-[42px]"
                       value={selectedNode.shape}
                       onChange={(e) => updateNode(selectedNode.id, { shape: e.target.value })}
                     >
                       {SHAPES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                     </select>
                  </div>
                </div>

                {/* Icon Grid */}
                <div>
                  <label className="text-[10px] text-ui-500 mb-2 block">Icon</label>
                  <div className="grid grid-cols-6 gap-2 p-2 bg-ui-950 rounded border border-ui-800 max-h-32 overflow-y-auto custom-scrollbar">
                    {Object.keys(ICON_MAP).map(key => {
                      const Icon = ICON_MAP[key];
                      return (
                        <button
                          key={key}
                          onClick={() => updateNode(selectedNode.id, { iconKey: key })}
                          className={`p-1.5 rounded flex items-center justify-center transition-all ${selectedNode.iconKey === key ? 'bg-ui-accent text-ui-on-accent' : 'text-ui-500 hover:bg-ui-800 hover:text-ui-200'}`}
                        >
                          <Icon size={16} />
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="h-px bg-ui-800"></div>

                <OutlineFields
                  outlineColor={selectedNode.outlineColor || DEFAULT_OUTLINE_COLOR}
                  outlineWidth={selectedNode.outlineWidth || 0}
                  outlineGap={selectedNode.outlineGap || 0}
                  onChange={(fields) => updateNode(selectedNode.id, fields)}
                  onSave={saveNodeOutlinePreset}
                  canSave={
                    (selectedNode.outlineWidth || 0) > 0
                    && !nodeOutlinePresets.some((preset) => outlinesMatch(preset, {
                      color: selectedNode.outlineColor || DEFAULT_OUTLINE_COLOR,
                      width: selectedNode.outlineWidth || 0,
                      gap: selectedNode.outlineGap || 0,
                    }))
                  }
                  alreadySaved={nodeOutlinePresets.some((preset) => outlinesMatch(preset, {
                    color: selectedNode.outlineColor || DEFAULT_OUTLINE_COLOR,
                    width: selectedNode.outlineWidth || 0,
                    gap: selectedNode.outlineGap || 0,
                  }))}
                />
              </div>

              <div className="h-px bg-ui-800"></div>

              {/* Data Section */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-ui-500 uppercase">Data Attributes</div>
                
                <div>
                  <label className="block text-[10px] font-bold text-ui-500 uppercase mb-1">Name</label>
                  <input
                    type="text"
                    className="w-full bg-ui-950 border border-ui-700 rounded p-2 text-sm text-ui-200 focus:border-ui-accent-bright outline-none"
                    value={selectedNode.name}
                    onChange={(e) => updateNode(selectedNode.id, { name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-ui-500 uppercase mb-1">Type</label>
                    <input
                      type="text"
                      className="w-full bg-ui-950 border border-ui-700 rounded p-2 text-xs text-ui-200 focus:border-ui-accent-bright outline-none"
                      value={selectedNode.type}
                      onChange={(e) => updateNode(selectedNode.id, { type: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-ui-500 uppercase mb-1">Cost (Int)</label>
                    <input
                      type="number"
                      className="w-full bg-ui-950 border border-ui-700 rounded p-2 text-xs text-ui-200 focus:border-ui-accent-bright outline-none"
                      value={selectedNode.cost}
                      onChange={(e) => updateNode(selectedNode.id, { cost: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-ui-500 uppercase mb-1">Value (String/Num)</label>
                  <input
                    type="text"
                    className="w-full bg-ui-950 border border-ui-700 rounded p-2 text-xs text-ui-200 focus:border-ui-accent-bright outline-none font-mono"
                    value={selectedNode.value}
                    onChange={(e) => updateNode(selectedNode.id, { value: e.target.value })}
                  />
                </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={() => deleteNode(selectedNode.id)}
                  className="w-full py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/50 rounded text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Trash2 size={14} /> Delete Node
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LINK EDITOR */}
        {multiLinkSelection && (
          <div className="flex flex-col h-full animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-ui-800 flex justify-between items-center bg-ui-950">
              <h3 className="font-bold text-ui-200 flex items-center gap-2 text-sm uppercase tracking-wider">
                Link Inspector
              </h3>
              <button type="button" onClick={() => setSelectedLinkIds([])}>
                <X size={16} className="text-ui-500 hover:text-ui-200" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-3 text-[11px] text-amber-200/90 leading-relaxed">
                <div className="font-bold uppercase tracking-wider text-amber-300 mb-1">
                  {selectedLinkIds.length} links selected
                </div>
                Data editing is unavailable while multiple links are selected. Bend handles move together on the canvas, or select a single link to edit its properties.
              </div>
              <div className="pointer-events-none opacity-40 select-none space-y-3" aria-disabled="true">
                <div className="h-8 rounded bg-ui-950 border border-ui-800" />
                <div className="h-8 rounded bg-ui-950 border border-ui-800" />
                <div className="h-8 rounded bg-ui-950 border border-ui-800" />
                <div className="h-8 rounded bg-ui-950 border border-ui-800" />
              </div>
              <button
                type="button"
                onClick={() => deleteConnections(selectedLinkIds)}
                className="w-full py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/50 rounded text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 size={14} /> Delete {selectedLinkIds.length} Links
              </button>
            </div>
          </div>
        )}

        {selectedLink && !multiLinkSelection && (
           <div className="flex flex-col h-full animate-in slide-in-from-right duration-200">
             <div className="p-4 border-b border-ui-800 flex justify-between items-center bg-ui-950">
               <h3 className="font-bold text-ui-200 flex items-center gap-2 text-sm uppercase tracking-wider">Link Inspector</h3>
               <button onClick={() => setSelectedLinkIds([])}><X size={16} className="text-ui-500 hover:text-ui-200"/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
               <div>
                  <label className="block text-xs font-bold text-ui-500 uppercase mb-2">Color</label>
                  <div className="flex items-center gap-2 bg-ui-950 border border-ui-700 rounded p-2">
                    <input
                      type="color"
                      value={selectedLink.color || DEFAULT_LINK_COLOR}
                      onChange={(e) => updateConnection(selectedLink.id, { color: e.target.value })}
                      className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                    />
                    <span className="text-xs font-mono text-ui-300">{selectedLink.color || DEFAULT_LINK_COLOR}</span>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-3">
                 <div>
                    <label className="block text-xs font-bold text-ui-500 uppercase mb-2">Line Style</label>
                    <select
                      className="w-full bg-ui-950 border border-ui-700 rounded p-2 text-xs text-ui-200 outline-none focus:border-ui-accent-bright"
                      value={selectedLink.style || 'solid'}
                      onChange={(e) => updateConnection(selectedLink.id, { style: e.target.value })}
                    >
                      {LINK_STYLES.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-bold text-ui-500 uppercase mb-2">Lines</label>
                    <input
                      type="number"
                      min="1"
                      max="4"
                      step="1"
                      className="w-full bg-ui-950 border border-ui-700 rounded p-2 text-xs text-ui-200 outline-none focus:border-ui-accent-bright"
                      value={selectedLink.lines || 1}
                      onChange={(e) => {
                        const value = Math.max(1, Math.min(4, parseInt(e.target.value, 10) || 1));
                        updateConnection(selectedLink.id, { lines: value });
                      }}
                    />
                 </div>
               </div>

               <div>
                  <label className="block text-xs font-bold text-ui-500 uppercase mb-2">Bend</label>
                  <select
                    className="w-full bg-ui-950 border border-ui-700 rounded p-2 text-xs text-ui-200 outline-none focus:border-ui-accent-bright"
                    value={selectedLink.bendMode === 'angled' ? 'angled' : 'curve'}
                    onChange={(e) => updateConnection(selectedLink.id, { bendMode: e.target.value })}
                  >
                    {BEND_MODES.map((mode) => (
                      <option key={mode.id} value={mode.id}>{mode.label}</option>
                    ))}
                  </select>
               </div>

               <div>
                  <label className="block text-xs font-bold text-ui-500 uppercase mb-2 flex justify-between">
                    <span>{selectedLink.bendMode === 'angled' ? 'Angle' : 'Curvature'}</span>
                    <span className="text-ui-200">{selectedLink.curve || 0}</span>
                  </label>
                  <input 
                    type="range" min="-1" max="1" step="0.1"
                    value={selectedLink.curve || 0}
                    onChange={(e) => updateConnection(selectedLink.id, { curve: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-ui-800 rounded-lg appearance-none cursor-pointer accent-ui-accent-bright"
                  />
               </div>

               <div className="h-px bg-ui-800"></div>

               <OutlineFields
                 outlineColor={selectedLink.outlineColor || DEFAULT_OUTLINE_COLOR}
                 outlineWidth={selectedLink.outlineWidth || 0}
                 outlineGap={selectedLink.outlineGap || 0}
                 onChange={(fields) => updateConnection(selectedLink.id, fields)}
                 onSave={saveLinkOutlinePreset}
                 canSave={
                   (selectedLink.outlineWidth || 0) > 0
                   && !linkOutlinePresets.some((preset) => outlinesMatch(preset, {
                     color: selectedLink.outlineColor || DEFAULT_OUTLINE_COLOR,
                     width: selectedLink.outlineWidth || 0,
                     gap: selectedLink.outlineGap || 0,
                   }))
                 }
                 alreadySaved={linkOutlinePresets.some((preset) => outlinesMatch(preset, {
                   color: selectedLink.outlineColor || DEFAULT_OUTLINE_COLOR,
                   width: selectedLink.outlineWidth || 0,
                   gap: selectedLink.outlineGap || 0,
                 }))}
               />

               <button 
                onClick={() => deleteConnection(selectedLink.id)}
                className="w-full py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/50 rounded text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Trash2 size={14} /> Delete Link
              </button>
            </div>
           </div>
        )}

        {/* EMPTY STATE / MAP BACKGROUND */}
        {!selectedNode && !selectedLink && !multiNodeSelection && !multiLinkSelection && (
           <div className="flex flex-col h-full bg-ui-900/50">
             <div className="p-4 border-b border-ui-800 bg-ui-950">
               <h3 className="font-bold text-ui-200 text-sm uppercase tracking-widest flex items-center gap-2">
                 <ImageIcon size={14} className="text-ui-accent-soft"/> Map Background
               </h3>
             </div>
             <div className="p-6 space-y-6 flex-1">
               <div className="space-y-4">
                 <p className="text-[11px] text-ui-500 leading-relaxed">
                   Upload a silhouette or outline image to guide node placement and match sphere-grid shapes.
                 </p>

                 {currentBackground?.src ? (
                   <div className="rounded border border-ui-700 overflow-hidden bg-ui-950">
                     <img
                       src={currentBackground.src}
                       alt="Grid background preview"
                       className="w-full h-28 object-contain bg-ui-900"
                       style={getBackgroundImageStyle(currentBackground.pixelated)}
                     />
                   </div>
                 ) : (
                   <div className="rounded border border-dashed border-ui-700 bg-ui-950 p-4 text-center text-[11px] text-ui-500">
                     No background image yet
                   </div>
                 )}

                 <div className="flex gap-2">
                   <button
                     onClick={() => backgroundInputRef.current?.click()}
                     className="flex-1 py-2 bg-ui-800 hover:bg-ui-700 text-ui-200 rounded text-xs transition-colors"
                   >
                     {currentBackground?.src ? 'Replace Image' : 'Upload Image'}
                   </button>
                   {currentBackground?.src && (
                     <button
                       onClick={() => updateGridBackground({ src: null })}
                       className="px-3 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-900/50 rounded text-xs transition-colors"
                     >
                       Clear
                     </button>
                   )}
                 </div>
                 <input
                   ref={backgroundInputRef}
                   type="file"
                   accept="image/*"
                   className="hidden"
                   onChange={handleBackgroundUpload}
                 />

                 {currentBackground?.src && (
                   <div className="space-y-3">
                     <div>
                       <label className="block text-[10px] font-bold text-ui-500 uppercase mb-1 flex justify-between">
                         <span>Scale</span>
                         <span className="text-ui-200">{Math.round(currentBackground.scale * 100)}%</span>
                       </label>
                       <input
                         type="range"
                         min="0.1"
                         max="5"
                         step="0.05"
                         value={currentBackground.scale}
                         onChange={(e) => updateGridBackground({ scale: parseFloat(e.target.value) })}
                         className="w-full h-2 bg-ui-800 rounded-lg appearance-none cursor-pointer accent-ui-accent-bright"
                       />
                     </div>
                     <div>
                       <label className="block text-[10px] font-bold text-ui-500 uppercase mb-1 flex justify-between">
                         <span>Opacity</span>
                         <span className="text-ui-200">{Math.round(currentBackground.opacity * 100)}%</span>
                       </label>
                       <input
                         type="range"
                         min="0.05"
                         max="1"
                         step="0.05"
                         value={currentBackground.opacity}
                         onChange={(e) => updateGridBackground({ opacity: parseFloat(e.target.value) })}
                         className="w-full h-2 bg-ui-800 rounded-lg appearance-none cursor-pointer accent-ui-accent-bright"
                       />
                     </div>
                     <label className="flex items-center gap-2 text-xs text-ui-300 cursor-pointer">
                       <input
                         type="checkbox"
                         checked={currentBackground.pixelated}
                         onChange={(e) => updateGridBackground({ pixelated: e.target.checked })}
                         className="rounded border-ui-600 bg-ui-950 text-ui-accent-bright focus:ring-ui-accent-bright focus:ring-offset-ui-900"
                       />
                       Crisp pixels (pixel art)
                     </label>
                     <button
                       onClick={() => updateGridBackground({ x: 0, y: 0 })}
                       className="w-full py-2 bg-ui-800 hover:bg-ui-700 text-ui-200 rounded text-xs flex items-center justify-center gap-2 transition-colors"
                     >
                       <Crosshair size={14} /> Center Background
                     </button>
                     <p className="text-[10px] text-ui-500">
                       Drag the image on the canvas in Move mode to reposition it.
                     </p>
                   </div>
                 )}
               </div>
             </div>
           </div>
        )}

      </div>

      <OutlinePresetsWindow
        tab={outlinePresetTab}
        onTabChange={setOutlinePresetTab}
        nodePresets={nodeOutlinePresets}
        linkPresets={linkOutlinePresets}
        activeOutline={
          outlinePresetTab === 'nodes' && selectedNode
            ? {
                color: selectedNode.outlineColor || DEFAULT_OUTLINE_COLOR,
                width: selectedNode.outlineWidth || 0,
                gap: selectedNode.outlineGap || 0,
              }
            : outlinePresetTab === 'links' && selectedLink
              ? {
                  color: selectedLink.outlineColor || DEFAULT_OUTLINE_COLOR,
                  width: selectedLink.outlineWidth || 0,
                  gap: selectedLink.outlineGap || 0,
                }
              : null
        }
        canApply={
          (outlinePresetTab === 'nodes' && selectedNodeIds.length === 1)
          || (outlinePresetTab === 'links' && selectedLinkIds.length === 1)
        }
        onApply={applyOutlinePreset}
        onUpdatePresets={updateOutlinePresetList}
      />

      {showSettings && (
        <div className={`absolute bottom-4 z-30 w-72 rounded-xl border border-ui-700 bg-ui-900/95 shadow-2xl backdrop-blur-sm overflow-hidden ${mapsPanelOpen ? 'left-[22rem]' : 'left-24'}`}>
          <div className="px-3 py-3 border-b border-ui-800 flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-ui-300 flex items-center gap-2">
              <Settings size={12} className="text-ui-accent-soft" />
              Settings
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="text-ui-500 hover:text-ui-200"
            >
              <X size={14} />
            </button>
          </div>

          <div className="p-4 space-y-5 max-h-[min(520px,70vh)] overflow-y-auto custom-scrollbar">
            <div>
              <label className="block text-xs font-bold text-ui-500 uppercase mb-2">Appearance</label>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-ui-950 p-1 mb-4">
                {[
                  { id: 'dark', label: 'Dark', icon: Moon },
                  { id: 'light', label: 'Light', icon: Sun },
                ].map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setUiMode(option.id)}
                      className={`py-1.5 rounded-md text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5 ${
                        uiMode === option.id
                          ? 'bg-ui-accent text-ui-on-accent'
                          : 'text-ui-400 hover:text-ui-200'
                      }`}
                    >
                      <Icon size={12} />
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <label className="block text-xs font-bold text-ui-500 uppercase mb-2">App UI Color</label>
              <div className="flex items-center gap-3 bg-ui-950 border border-ui-700 rounded p-2">
                <input
                  type="color"
                  value={uiColor}
                  onChange={(e) => setUiColor(normalizeHexColor(e.target.value))}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-none p-0"
                />
                <span className="text-xs font-mono text-ui-500">{uiColor}</span>
              </div>
              <p className="mt-2 text-[11px] text-ui-500 leading-relaxed">
                Uses your pick literally for accents; chrome, text, and icons follow a matching light or dark palette.
              </p>
            </div>

            <div className="h-px bg-ui-800" />

            <div className="text-[11px] font-bold uppercase tracking-wider text-ui-400">
              Graph Background
            </div>

            <div>
              <label className="block text-xs font-bold text-ui-500 uppercase mb-2 flex justify-between items-center">
                <span>Fill</span>
                <button
                  type="button"
                  onClick={() => setUiBgMix(DEFAULT_UI_BG_MIX)}
                  className="text-[10px] text-ui-400 hover:text-ui-200 normal-case tracking-normal font-medium"
                >
                  Reset
                </button>
              </label>
              <div className="mb-1 flex justify-between text-[10px] text-ui-500">
                <span className="uppercase tracking-wider">Darker</span>
                <span className="text-ui-200 font-mono normal-case">
                  {uiBgMix === 0
                    ? 'Default'
                    : uiBgMix < 0
                      ? `Darker ${Math.round((-uiBgMix / UI_BG_MIX_RANGE) * 100)}%`
                      : `Lighter ${Math.round((uiBgMix / UI_BG_MIX_RANGE) * 100)}%`}
                </span>
                <span className="uppercase tracking-wider">Lighter</span>
              </div>
              <div
                className="mb-2 h-2 rounded-full border border-ui-700"
                style={{
                  background: `linear-gradient(to right, rgb(${canvasBgDarkChannels}) 0%, rgb(${defaultBgChannels}) 50%, rgb(${canvasBgLightChannels}) 100%)`,
                }}
              />
              <input
                type="range"
                min={-UI_BG_MIX_RANGE}
                max={UI_BG_MIX_RANGE}
                step="0.01"
                value={uiBgMix}
                onChange={(e) => setUiBgMix(normalizeUiBgMix(e.target.value))}
                className="w-full h-2 bg-ui-800 rounded-lg appearance-none cursor-pointer accent-ui-accent-bright"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-ui-500 uppercase mb-2">Grid Style</label>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-ui-950 p-1">
                {[
                  { id: 'dots', label: 'Dots' },
                  { id: 'lines', label: 'Lines' },
                  { id: 'none', label: 'None' },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCanvasGridStyle(option.id)}
                    className={`py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                      canvasGridStyle === option.id
                        ? 'bg-ui-accent text-ui-on-accent'
                        : 'text-ui-400 hover:text-ui-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ui-500 uppercase mb-2 flex justify-between items-center">
                <span>Grid Scale</span>
                <button
                  type="button"
                  onClick={() => setCanvasGridSize(DEFAULT_GRID_SIZE)}
                  className="text-[10px] text-ui-400 hover:text-ui-200 normal-case tracking-normal font-medium"
                >
                  Reset
                </button>
              </label>
              <div className="grid grid-cols-3 gap-1 rounded-lg bg-ui-950 p-1">
                {GRID_SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setCanvasGridSize(preset.size)}
                    className={`py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                      canvasGridSize === preset.size
                        ? 'bg-ui-accent text-ui-on-accent'
                        : 'text-ui-400 hover:text-ui-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-ui-500">
                Matches node snapping ({canvasGridSize}px).
              </p>
            </div>

            <label className="flex items-center justify-between gap-3 text-xs text-ui-300 cursor-pointer">
              <span className="font-bold uppercase tracking-wider text-ui-500">Show Center</span>
              <input
                type="checkbox"
                checked={canvasShowCenter}
                onChange={(e) => setCanvasShowCenter(e.target.checked)}
                className="rounded border-ui-600 bg-ui-950 text-ui-accent-bright focus:ring-ui-accent-bright focus:ring-offset-ui-900"
              />
            </label>
          </div>
        </div>
      )}

      {ioMenu && (
        <div className="absolute inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setIoMenu(null)}>
          <div
            className="w-full max-w-sm rounded-xl border border-ui-700 bg-ui-900 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-ui-800 flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-ui-200 flex items-center gap-2">
                {ioMenu === 'export' ? <Download size={14} className="text-ui-accent-soft" /> : <Upload size={14} className="text-ui-accent-soft" />}
                {ioMenu === 'export' ? 'Export' : 'Import'}
              </div>
              <button type="button" onClick={() => setIoMenu(null)} className="text-ui-500 hover:text-ui-200">
                <X size={14} />
              </button>
            </div>

            <div className="p-3 space-y-2">
              <p className="px-1 pb-1 text-[11px] text-ui-500 leading-relaxed">
                {ioMenu === 'export'
                  ? 'Choose whether to export only the active node map or the full library.'
                  : 'Choose whether to replace the active node map or the full library. Drag-and-drop auto-detects the file type.'}
              </p>

              <button
                type="button"
                onClick={() => {
                  if (ioMenu === 'export') {
                    handleExportChoice(IMPORT_KIND_SKILL);
                  } else {
                    openImportPicker(IMPORT_KIND_SKILL);
                  }
                }}
                className="w-full text-left rounded-lg border border-ui-700 bg-ui-950 px-3 py-3 hover:border-ui-accent hover:bg-ui-800/60 transition-colors"
              >
                <div className="text-sm font-semibold text-ui-200">Current node map</div>
                <div className="text-[11px] text-ui-500 mt-0.5">
                  {ioMenu === 'export'
                    ? `Export “${currentSkill.name}” as its own file`
                    : `Replace “${currentSkill.name}” with an imported node map`}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (ioMenu === 'export') {
                    handleExportChoice(IMPORT_KIND_LIBRARY);
                  } else {
                    openImportPicker(IMPORT_KIND_LIBRARY);
                  }
                }}
                className="w-full text-left rounded-lg border border-ui-700 bg-ui-950 px-3 py-3 hover:border-ui-accent hover:bg-ui-800/60 transition-colors"
              >
                <div className="text-sm font-semibold text-ui-200">Entire library</div>
                <div className="text-[11px] text-ui-500 mt-0.5">
                  {ioMenu === 'export'
                    ? 'Export every node map, grid, and setting'
                    : 'Replace the whole project with an imported library'}
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {isFileDragActive && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-ui-950/80 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-ui-accent px-8 py-6 text-center shadow-2xl bg-ui-900/90">
            <Upload size={28} className="mx-auto mb-3 text-ui-accent-soft" />
            <div className="text-sm font-semibold text-ui-200">Drop JSON or ZIP to import</div>
            <div className="mt-1 text-[11px] text-ui-400">
              Node map files replace the current map · Library files replace everything
            </div>
          </div>
        </div>
      )}
    </div>
  );
}