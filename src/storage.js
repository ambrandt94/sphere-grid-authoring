import JSZip from 'jszip';
import {
  DEFAULT_GRID_SIZE,
  DEFAULT_GRID_STYLE,
  DEFAULT_SHOW_CENTER,
  DEFAULT_UI_BG_MIX,
  DEFAULT_UI_COLOR,
  DEFAULT_UI_MODE,
  GRID_SIZE_PRESETS,
  normalizeGridSize,
  normalizeGridStyle,
  normalizeHexColor,
  normalizeShowCenter,
  normalizeUiBgMix,
  normalizeUiMode,
} from './theme';

export const STORAGE_KEY = 'sphere-grid-authoring-data';
export const DB_NAME = 'sphere-grid-authoring';
export const DB_VERSION = 1;
export const DB_STORE = 'projects';
export const DATA_VERSION = '3.11';
export const PROJECT_JSON_NAME = 'project.json';
export const SKILL_JSON_NAME = 'skill.json';
export const IMAGES_FOLDER = 'images';
export const IMPORT_KIND_LIBRARY = 'library';
export const IMPORT_KIND_SKILL = 'skill';

export {
  DEFAULT_GRID_SIZE,
  DEFAULT_GRID_STYLE,
  DEFAULT_SHOW_CENTER,
  DEFAULT_UI_BG_MIX,
  DEFAULT_UI_COLOR,
  DEFAULT_UI_MODE,
  GRID_SIZE_PRESETS,
};

export const DEFAULT_BACKGROUND = {
  src: null,
  baseWidth: 400,
  baseHeight: 400,
  scale: 1,
  x: 0,
  y: 0,
  opacity: 0.45,
  pixelated: true,
};

export const DEFAULT_SKILLS = [{ id: 'default', name: 'General', color: '#6366f1' }];
export const DEFAULT_LINK_COLOR = '#475569';
export const DEFAULT_OUTLINE_COLOR = '#0f172a';
export const LINK_STYLE_IDS = new Set(['solid', 'dashed', 'dotted', 'zigzag']);
export const BEND_MODE_IDS = new Set(['curve', 'angled']);

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function outlinesMatch(a, b) {
  if (!a || !b) return false;
  return (
    String(a.color || '').toLowerCase() === String(b.color || '').toLowerCase()
    && Number(a.width) === Number(b.width)
    && Number(a.gap || 0) === Number(b.gap || 0)
  );
}

export function normalizeOutlinePreset(preset, index = 0) {
  if (!preset || typeof preset !== 'object') return null;

  return {
    id: typeof preset.id === 'string' ? preset.id : `outline_${index}`,
    name: typeof preset.name === 'string' && preset.name.trim()
      ? preset.name.trim()
      : `Outline ${index + 1}`,
    color: typeof preset.color === 'string' ? preset.color : DEFAULT_OUTLINE_COLOR,
    width: clampNumber(Math.round(Number(preset.width)), 0, 12, 0),
    gap: clampNumber(Math.round(Number(preset.gap)), 0, 12, 0),
    pinned: Boolean(preset.pinned),
  };
}

function normalizeOutlinePresets(raw) {
  if (!Array.isArray(raw)) return [];
  const presets = raw.map(normalizeOutlinePreset).filter(Boolean);
  const unique = [];
  for (const preset of presets) {
    if (unique.some((existing) => outlinesMatch(existing, preset))) continue;
    unique.push(preset);
  }

  // Keep pinned entries first while preserving relative order within each group
  return [
    ...unique.filter((preset) => preset.pinned),
    ...unique.filter((preset) => !preset.pinned),
  ];
}

export function partitionOutlinePresets(presets) {
  const list = Array.isArray(presets) ? presets : [];
  return {
    pinned: list.filter((preset) => preset.pinned),
    unpinned: list.filter((preset) => !preset.pinned),
  };
}

export function moveOutlinePreset(presets, id, direction) {
  const list = Array.isArray(presets) ? [...presets] : [];
  const target = list.find((preset) => preset.id === id);
  if (!target) return list;

  const { pinned, unpinned } = partitionOutlinePresets(list);
  const group = target.pinned ? [...pinned] : [...unpinned];
  const index = group.findIndex((preset) => preset.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= group.length) return list;

  [group[index], group[nextIndex]] = [group[nextIndex], group[index]];
  return target.pinned ? [...group, ...unpinned] : [...pinned, ...group];
}

export function toggleOutlinePresetPinned(presets, id) {
  const list = Array.isArray(presets) ? presets.map((preset) => (
    preset.id === id ? { ...preset, pinned: !preset.pinned } : preset
  )) : [];
  return [
    ...list.filter((preset) => preset.pinned),
    ...list.filter((preset) => !preset.pinned),
  ];
}

export function renameOutlinePreset(presets, id, name) {
  const nextName = typeof name === 'string' ? name.trim() : '';
  return (Array.isArray(presets) ? presets : []).map((preset) => (
    preset.id === id
      ? { ...preset, name: nextName || preset.name }
      : preset
  ));
}

export function createEmptyGrid() {
  return {
    nodes: [],
    connections: [],
    background: { ...DEFAULT_BACKGROUND },
  };
}

export function normalizeBackground(background) {
  if (!background || typeof background !== 'object') {
    return { ...DEFAULT_BACKGROUND };
  }

  let baseWidth = background.baseWidth;
  let baseHeight = background.baseHeight;
  let scale = background.scale;

  if (!Number.isFinite(Number(baseWidth)) || !Number.isFinite(Number(baseHeight))) {
    baseWidth = background.width ?? DEFAULT_BACKGROUND.baseWidth;
    baseHeight = background.height ?? DEFAULT_BACKGROUND.baseHeight;
  }

  if (!Number.isFinite(Number(scale))) {
    scale = DEFAULT_BACKGROUND.scale;
  }

  return {
    src: typeof background.src === 'string' ? background.src : null,
    baseWidth: clampNumber(baseWidth, 1, 5000, DEFAULT_BACKGROUND.baseWidth),
    baseHeight: clampNumber(baseHeight, 1, 5000, DEFAULT_BACKGROUND.baseHeight),
    scale: clampNumber(scale, 0.1, 5, DEFAULT_BACKGROUND.scale),
    x: clampNumber(background.x, -5000, 5000, DEFAULT_BACKGROUND.x),
    y: clampNumber(background.y, -5000, 5000, DEFAULT_BACKGROUND.y),
    opacity: clampNumber(background.opacity, 0.05, 1, DEFAULT_BACKGROUND.opacity),
    pixelated: background.pixelated !== false,
  };
}

export function getBackgroundDisplaySize(background) {
  const bg = normalizeBackground(background);
  let width = bg.baseWidth * bg.scale;
  let height = bg.baseHeight * bg.scale;

  if (bg.pixelated) {
    width = Math.round(width);
    height = Math.round(height);
  }

  return { width, height };
}

export function normalizeNode(node) {
  if (!node || typeof node !== 'object' || typeof node.id !== 'string') {
    return null;
  }

  return {
    id: node.id,
    x: typeof node.x === 'number' ? node.x : 0,
    y: typeof node.y === 'number' ? node.y : 0,
    name: typeof node.name === 'string' ? node.name : 'New Node',
    type: typeof node.type === 'string' ? node.type : 'Skill',
    value: node.value != null ? String(node.value) : '1',
    cost: Number.isFinite(Number(node.cost)) ? Number(node.cost) : 0,
    shape: typeof node.shape === 'string' ? node.shape : 'circle',
    color: typeof node.color === 'string' ? node.color : '#6366f1',
    iconKey: typeof node.iconKey === 'string' ? node.iconKey : 'star',
    outlineColor: typeof node.outlineColor === 'string' ? node.outlineColor : DEFAULT_OUTLINE_COLOR,
    outlineWidth: clampNumber(Math.round(Number(node.outlineWidth)), 0, 12, 0),
    outlineGap: clampNumber(Math.round(Number(node.outlineGap)), 0, 12, 0),
  };
}

export function normalizeConnection(connection) {
  if (!connection || typeof connection !== 'object' || typeof connection.id !== 'string') {
    return null;
  }

  if (typeof connection.from !== 'string' || typeof connection.to !== 'string') {
    return null;
  }

  let style = typeof connection.style === 'string' ? connection.style : 'solid';
  let lines = clampNumber(Math.round(Number(connection.lines)), 1, 4, 1);

  // Migrate legacy "double" style into a 2-line solid connection
  if (style === 'double') {
    style = 'solid';
    if (!Number.isFinite(Number(connection.lines))) {
      lines = 2;
    }
  }

  if (!LINK_STYLE_IDS.has(style)) {
    style = 'solid';
  }

  return {
    id: connection.id,
    from: connection.from,
    to: connection.to,
    curve: Number.isFinite(Number(connection.curve)) ? Number(connection.curve) : 0,
    bendMode: BEND_MODE_IDS.has(connection.bendMode) ? connection.bendMode : 'curve',
    color: typeof connection.color === 'string' ? connection.color : DEFAULT_LINK_COLOR,
    style,
    lines,
    outlineColor: typeof connection.outlineColor === 'string' ? connection.outlineColor : DEFAULT_OUTLINE_COLOR,
    outlineWidth: clampNumber(Math.round(Number(connection.outlineWidth)), 0, 12, 0),
    outlineGap: clampNumber(Math.round(Number(connection.outlineGap)), 0, 12, 0),
  };
}

export function normalizeGrid(grid) {
  const source = grid && typeof grid === 'object' ? grid : {};
  const nodes = Array.isArray(source.nodes)
    ? source.nodes.map(normalizeNode).filter(Boolean)
    : [];
  const connections = Array.isArray(source.connections)
    ? source.connections.map(normalizeConnection).filter(Boolean)
    : [];

  return {
    nodes,
    connections,
    background: normalizeBackground(source.background),
  };
}

export function normalizeSkill(skill, index) {
  if (!skill || typeof skill !== 'object') {
    return {
      id: `skill_${index}`,
      name: `Skill ${index + 1}`,
      color: '#6366f1',
    };
  }

  return {
    id: typeof skill.id === 'string' ? skill.id : `skill_${index}`,
    name: typeof skill.name === 'string' ? skill.name : `Skill ${index + 1}`,
    color: typeof skill.color === 'string' ? skill.color : '#6366f1',
  };
}

export function normalizeProjectData(raw) {
  const skillsInput = Array.isArray(raw?.skills) ? raw.skills : DEFAULT_SKILLS;
  const skills = skillsInput.map(normalizeSkill);

  if (skills.length === 0) {
    skills.push(...DEFAULT_SKILLS);
  }

  const uniqueSkills = [];
  const seenSkillIds = new Set();
  for (const skill of skills) {
    if (seenSkillIds.has(skill.id)) continue;
    seenSkillIds.add(skill.id);
    uniqueSkills.push(skill);
  }

  const gridsInput = raw?.grids && typeof raw.grids === 'object' ? raw.grids : {};
  const grids = {};

  for (const skill of uniqueSkills) {
    grids[skill.id] = normalizeGrid(gridsInput[skill.id]);
  }

  for (const [gridId, grid] of Object.entries(gridsInput)) {
    if (!grids[gridId]) {
      grids[gridId] = normalizeGrid(grid);
    }
  }

  const currentSkillId = uniqueSkills.some((skill) => skill.id === raw?.currentSkillId)
    ? raw.currentSkillId
    : uniqueSkills[0].id;

  return {
    skills: uniqueSkills,
    grids,
    currentSkillId,
    nodeOutlinePresets: normalizeOutlinePresets(raw?.nodeOutlinePresets),
    linkOutlinePresets: normalizeOutlinePresets(raw?.linkOutlinePresets),
    uiColor: normalizeHexColor(raw?.uiColor, DEFAULT_UI_COLOR),
    uiBgMix: normalizeUiBgMix(raw?.uiBgMix, DEFAULT_UI_BG_MIX),
    uiMode: normalizeUiMode(raw?.uiMode, DEFAULT_UI_MODE),
    canvasGridStyle: normalizeGridStyle(raw?.canvasGridStyle, DEFAULT_GRID_STYLE),
    canvasGridSize: normalizeGridSize(raw?.canvasGridSize, DEFAULT_GRID_SIZE),
    canvasShowCenter: normalizeShowCenter(raw?.canvasShowCenter, DEFAULT_SHOW_CENTER),
  };
}

export function createDefaultProject() {
  return normalizeProjectData({
    skills: DEFAULT_SKILLS,
    grids: { default: createEmptyGrid() },
    currentSkillId: 'default',
  });
}

function buildStoredPayload(project) {
  return {
    metadata: {
      version: DATA_VERSION,
      savedAt: new Date().toISOString(),
    },
    skills: project.skills,
    grids: project.grids,
    currentSkillId: project.currentSkillId,
    nodeOutlinePresets: project.nodeOutlinePresets || [],
    linkOutlinePresets: project.linkOutlinePresets || [],
    uiColor: normalizeHexColor(project.uiColor, DEFAULT_UI_COLOR),
    uiBgMix: normalizeUiBgMix(project.uiBgMix, DEFAULT_UI_BG_MIX),
    uiMode: normalizeUiMode(project.uiMode, DEFAULT_UI_MODE),
    canvasGridStyle: normalizeGridStyle(project.canvasGridStyle, DEFAULT_GRID_STYLE),
    canvasGridSize: normalizeGridSize(project.canvasGridSize, DEFAULT_GRID_SIZE),
    canvasShowCenter: normalizeShowCenter(project.canvasShowCenter, DEFAULT_SHOW_CENTER),
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id' });
      }
    };
  });
}

async function loadFromIndexedDB() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get('current');
    request.onerror = () => reject(request.error ?? new Error('Failed to read IndexedDB.'));
    request.onsuccess = () => resolve(request.result ?? null);
  });
}

async function saveToIndexedDB(payload) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(DB_STORE, 'readwrite')
      .objectStore(DB_STORE)
      .put({ id: 'current', ...payload });
    request.onerror = () => reject(request.error ?? new Error('Failed to write IndexedDB.'));
    request.onsuccess = () => resolve();
  });
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return {
      metadata: parsed.metadata ?? null,
      ...normalizeProjectData(parsed),
    };
  } catch {
    return null;
  }
}

function saveToLocalStorage(payload) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function getSavedAt(project) {
  return Date.parse(project?.metadata?.savedAt ?? '') || 0;
}

export async function loadProject() {
  let indexedProject = null;

  try {
    indexedProject = await loadFromIndexedDB();
  } catch {
    indexedProject = null;
  }

  const localProject = loadFromStorage();

  if (indexedProject && localProject) {
    const source = getSavedAt(indexedProject) >= getSavedAt(localProject)
      ? indexedProject
      : localProject;
    return normalizeProjectData(source);
  }

  if (indexedProject) {
    return normalizeProjectData(indexedProject);
  }

  if (localProject) {
    return normalizeProjectData(localProject);
  }

  return null;
}

export async function saveProject(project) {
  const payload = buildStoredPayload(project);

  await saveToIndexedDB(payload);

  try {
    saveToLocalStorage(payload);
  } catch {
    // IndexedDB is the primary store for large background images.
  }
}

export function projectHasBackgroundImages(project) {
  return Object.values(project.grids).some((grid) => Boolean(grid.background?.src));
}

export function buildExportPayload(project) {
  return {
    metadata: {
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      format: 'json',
      kind: IMPORT_KIND_LIBRARY,
    },
    skills: project.skills,
    grids: project.grids,
    currentSkillId: project.currentSkillId,
    nodeOutlinePresets: project.nodeOutlinePresets || [],
    linkOutlinePresets: project.linkOutlinePresets || [],
    uiColor: normalizeHexColor(project.uiColor, DEFAULT_UI_COLOR),
    uiBgMix: normalizeUiBgMix(project.uiBgMix, DEFAULT_UI_BG_MIX),
    uiMode: normalizeUiMode(project.uiMode, DEFAULT_UI_MODE),
    canvasGridStyle: normalizeGridStyle(project.canvasGridStyle, DEFAULT_GRID_STYLE),
    canvasGridSize: normalizeGridSize(project.canvasGridSize, DEFAULT_GRID_SIZE),
    canvasShowCenter: normalizeShowCenter(project.canvasShowCenter, DEFAULT_SHOW_CENTER),
  };
}

export function buildSkillExportPayload(skill, grid) {
  return {
    metadata: {
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      format: 'json',
      kind: IMPORT_KIND_SKILL,
    },
    skill: normalizeSkill(skill, 0),
    grid: normalizeGrid(grid),
  };
}

export function normalizeSkillImport(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('JSON must contain a skill object.');
  }

  const skillSource = raw.skill && typeof raw.skill === 'object'
    ? raw.skill
    : (Array.isArray(raw.skills) && raw.skills[0]) || null;

  if (!skillSource) {
    throw new Error('JSON is missing a "skill" object.');
  }

  let gridSource = raw.grid;
  if (!gridSource && raw.grids && typeof raw.grids === 'object') {
    const skillId = typeof skillSource.id === 'string' ? skillSource.id : null;
    gridSource = (skillId && raw.grids[skillId]) || Object.values(raw.grids)[0];
  }

  if (!gridSource || typeof gridSource !== 'object') {
    throw new Error('JSON is missing a "grid" object.');
  }

  return {
    skill: normalizeSkill(skillSource, 0),
    grid: normalizeGrid(gridSource),
  };
}

export function detectImportKind(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('File must contain a JSON object.');
  }

  const kind = parsed.metadata?.kind;
  if (kind === IMPORT_KIND_SKILL || kind === IMPORT_KIND_LIBRARY) {
    return kind;
  }

  if (parsed.skill && (parsed.grid || parsed.grids)) {
    return IMPORT_KIND_SKILL;
  }

  if (Array.isArray(parsed.skills) && parsed.grids && typeof parsed.grids === 'object') {
    return IMPORT_KIND_LIBRARY;
  }

  if (parsed.skill && parsed.grid) {
    return IMPORT_KIND_SKILL;
  }

  throw new Error('Unrecognized file. Expected a skill or library export.');
}

function safeDownloadBasename(name, fallback) {
  const cleaned = String(name || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

function safeSkillFilename(skillId) {
  return skillId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function extensionForMime(mime) {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/svg+xml':
      return 'svg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'png';
  }
}

function dataUrlToBlob(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image data URL.');
  }

  const mime = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return {
    blob: new Blob([bytes], { type: mime }),
    mime,
    ext: extensionForMime(mime),
  };
}

function serializeBackgroundForExport(background, skillId, imageFiles) {
  const normalized = normalizeBackground(background);

  if (!normalized.src) {
    return normalized;
  }

  const { blob, ext } = dataUrlToBlob(normalized.src);
  const imagePath = `${IMAGES_FOLDER}/${safeSkillFilename(skillId)}.${ext}`;
  imageFiles.set(imagePath, blob);

  return {
    ...normalized,
    src: null,
    image: imagePath,
  };
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file.'));
    reader.readAsDataURL(blob);
  });
}

async function resolveZipBackgroundImages(grids, zip) {
  const resolvedGrids = { ...grids };

  for (const [skillId, grid] of Object.entries(resolvedGrids)) {
    const background = grid?.background;
    if (!background?.image || background.src) {
      resolvedGrids[skillId] = normalizeGrid(grid);
      continue;
    }

    const imageEntry = zip.file(background.image);
    if (!imageEntry) {
      throw new Error(`Missing image file in zip: ${background.image}`);
    }

    const blob = await imageEntry.async('blob');
    const src = await blobToDataUrl(blob);
    const rest = { ...background };
    delete rest.image;

    resolvedGrids[skillId] = normalizeGrid({
      ...grid,
      background: {
        ...rest,
        src,
      },
    });
  }

  return resolvedGrids;
}

export async function buildExportBlob(project) {
  const hasImages = projectHasBackgroundImages(project);

  if (!hasImages) {
    const payload = buildExportPayload(project);
    return {
      blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      filename: 'sphere-grid-library.json',
    };
  }

  const imageFiles = new Map();
  const exportGrids = {};

  for (const [skillId, grid] of Object.entries(project.grids)) {
    exportGrids[skillId] = {
      ...grid,
      background: serializeBackgroundForExport(grid.background, skillId, imageFiles),
    };
  }

  const payload = {
    metadata: {
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      format: 'zip',
      kind: IMPORT_KIND_LIBRARY,
    },
    skills: project.skills,
    grids: exportGrids,
    currentSkillId: project.currentSkillId,
    nodeOutlinePresets: project.nodeOutlinePresets || [],
    linkOutlinePresets: project.linkOutlinePresets || [],
    uiColor: normalizeHexColor(project.uiColor, DEFAULT_UI_COLOR),
    uiBgMix: normalizeUiBgMix(project.uiBgMix, DEFAULT_UI_BG_MIX),
    uiMode: normalizeUiMode(project.uiMode, DEFAULT_UI_MODE),
    canvasGridStyle: normalizeGridStyle(project.canvasGridStyle, DEFAULT_GRID_STYLE),
    canvasGridSize: normalizeGridSize(project.canvasGridSize, DEFAULT_GRID_SIZE),
    canvasShowCenter: normalizeShowCenter(project.canvasShowCenter, DEFAULT_SHOW_CENTER),
  };

  const zip = new JSZip();
  zip.file(PROJECT_JSON_NAME, JSON.stringify(payload, null, 2));
  for (const [path, blob] of imageFiles.entries()) {
    zip.file(path, blob);
  }

  return {
    blob: await zip.generateAsync({ type: 'blob' }),
    filename: 'sphere-grid-library.zip',
  };
}

export async function buildSkillExportBlob(skill, grid) {
  const normalizedSkill = normalizeSkill(skill, 0);
  const normalizedGrid = normalizeGrid(grid);
  const basename = safeDownloadBasename(normalizedSkill.name, 'skill');
  const hasImage = Boolean(normalizedGrid.background?.src);

  if (!hasImage) {
    const payload = buildSkillExportPayload(normalizedSkill, normalizedGrid);
    return {
      blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
      filename: `${basename}.json`,
    };
  }

  const imageFiles = new Map();
  const exportGrid = {
    ...normalizedGrid,
    background: serializeBackgroundForExport(
      normalizedGrid.background,
      normalizedSkill.id,
      imageFiles
    ),
  };

  const payload = {
    metadata: {
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      format: 'zip',
      kind: IMPORT_KIND_SKILL,
    },
    skill: normalizedSkill,
    grid: exportGrid,
  };

  const zip = new JSZip();
  zip.file(SKILL_JSON_NAME, JSON.stringify(payload, null, 2));
  for (const [path, blob] of imageFiles.entries()) {
    zip.file(path, blob);
  }

  return {
    blob: await zip.generateAsync({ type: 'blob' }),
    filename: `${basename}.zip`,
  };
}

function parseJsonObject(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON must contain an object.');
  }

  return parsed;
}

export function parseImportedJSON(text, expectedKind = null) {
  const parsed = parseJsonObject(text);
  const kind = detectImportKind(parsed);

  if (expectedKind && kind !== expectedKind) {
    throw new Error(
      expectedKind === IMPORT_KIND_SKILL
        ? 'This file is a library export. Choose "Entire library" to import it.'
        : 'This file is a skill export. Choose "Current skill" to import it.'
    );
  }

  if (kind === IMPORT_KIND_SKILL) {
    return {
      kind,
      skill: normalizeSkillImport(parsed),
    };
  }

  return {
    kind,
    project: normalizeProjectData(parsed),
  };
}

async function parseImportedZip(file, expectedKind = null) {
  const zip = await JSZip.loadAsync(file);
  const skillEntry = zip.file(SKILL_JSON_NAME);
  const projectEntry = zip.file(PROJECT_JSON_NAME);
  const entry = skillEntry || projectEntry;

  if (!entry) {
    throw new Error('Zip is missing project.json or skill.json.');
  }

  const parsed = parseJsonObject(await entry.async('string'));
  const kind = detectImportKind(parsed);

  if (expectedKind && kind !== expectedKind) {
    throw new Error(
      expectedKind === IMPORT_KIND_SKILL
        ? 'This file is a library export. Choose "Entire library" to import it.'
        : 'This file is a skill export. Choose "Current skill" to import it.'
    );
  }

  if (kind === IMPORT_KIND_SKILL) {
    const skillData = normalizeSkillImport(parsed);
    const grids = await resolveZipBackgroundImages(
      { [skillData.skill.id]: skillData.grid },
      zip
    );
    return {
      kind,
      skill: {
        skill: skillData.skill,
        grid: grids[skillData.skill.id] || skillData.grid,
      },
    };
  }

  if (!Array.isArray(parsed.skills) || !parsed.grids || typeof parsed.grids !== 'object') {
    throw new Error('project.json is missing skills or grids.');
  }

  parsed.grids = await resolveZipBackgroundImages(parsed.grids, zip);
  return {
    kind,
    project: normalizeProjectData(parsed),
  };
}

export async function parseImportedFile(file, expectedKind = null) {
  const name = file.name.toLowerCase();

  if (name.endsWith('.zip')) {
    return parseImportedZip(file, expectedKind);
  }

  if (name.endsWith('.json')) {
    return parseImportedJSON(await file.text(), expectedKind);
  }

  throw new Error('Unsupported file type. Use .json or .zip.');
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
