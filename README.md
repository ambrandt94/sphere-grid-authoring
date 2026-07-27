# Sphere Grid Authoring

A browser-based editor for designing sphere-grid-style skill trees. Place nodes on a snap grid, connect them with curved links, and use a resizable reference background image to match iconic grid shapes (Final Fantasy X-style layouts, custom silhouettes, and more).

Live demo: [skill-grid-wavy.web.app](https://skill-grid-wavy.web.app)

## Features

- **Multiple grids** — Each skill/character gets its own grid with independent nodes, links, and background.
- **Node editor** — Customize name, type, cost, value, shape, color, and icon per node.
- **Link editor** — Adjust connection curvature between nodes.
- **Reference backgrounds** — Upload an image per grid and resize, reposition, and fade it to guide node placement.
- **Auto-save** — Work is saved automatically to your browser (IndexedDB, with localStorage backup).
- **Import / export** — Export as JSON or ZIP (ZIP is used when background images are included).

## Getting Started

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

### Build & deploy

The app is hosted on [Firebase Hosting](https://firebase.google.com/docs/hosting) (project `skill-grid-wavy`). The `dist` folder from Vite is what gets published.

```bash
npm run build
npm run preview   # preview production build locally
```

**Manual deploy** (requires [Firebase CLI](https://firebase.google.com/docs/cli) login):

```bash
npm run build
npx firebase-tools deploy --only hosting
```

**Automatic deploy** via GitHub Actions:

- Push / merge to `master` → builds and deploys to the live site
- Open a pull request → builds and deploys a temporary preview channel (commented on the PR)

Optional: `npm run deploy` still publishes to GitHub Pages if you need that mirror.

## Usage

### Toolbar (left)

| Tool | Action |
|------|--------|
| **Move** | Pan the canvas, drag nodes, select nodes/links |
| **Add** | Click the canvas to place a new node |
| **Link** | Click two nodes to create or remove a connection |
| **Center** | Re-center the viewport on the grid origin |
| **Export** | Download the project as `.json` or `.zip` |
| **Import** | Load a previously exported `.json` or `.zip` file |

Scroll to zoom. Click empty space while in Move mode to deselect.

### Graph Manager (right sidebar)

When nothing is selected, the sidebar shows grid-level settings:

- Rename the current skill/grid
- Set the theme color (used for the dot grid)
- Upload a **reference background image**
- Adjust background **scale** and opacity
- Click **Center Background** to snap the image back to the canvas origin
- Drag the image on the canvas (Move mode) to reposition it

Use the background as a tracing guide: upload a silhouette, scale it to fit, then place nodes along the outline.

### Node & link inspectors

Select a node or link on the canvas to edit its properties in the right sidebar.

## Data & Persistence

### Local save

The app auto-saves your full project — including background images — to **IndexedDB** in your browser. A **localStorage** copy is also written when possible as a backup.

Changes are debounced and saved a few hundred milliseconds after you stop editing. The HUD shows **Saved locally** when the latest save succeeded.

### Export / import

| Format | When it's used |
|--------|----------------|
| **`sphere-grid.json`** | Projects with no background images |
| **`sphere-grid.zip`** | Projects with one or more background images |

ZIP exports contain:

- `project.json` — skills, grids, nodes, links, and background settings
- `images/` — reference image files (one per grid that has a background)

JSON exports and imports still work for older files. JSON files may embed images as data URLs when imported from legacy exports.

**Import** accepts both `.json` and `.zip` files via the toolbar **Import** button.

Example `project.json` structure inside a ZIP:

```json
{
  "metadata": {
    "version": "3.3",
    "exportedAt": "2026-07-02T12:00:00.000Z",
    "format": "zip"
  },
  "skills": [
    { "id": "default", "name": "General", "color": "#6366f1" }
  ],
  "grids": {
    "default": {
      "nodes": [],
      "connections": [],
      "background": {
        "src": null,
        "image": "images/default.png",
        "baseWidth": 400,
        "baseHeight": 400,
        "scale": 1,
        "x": 0,
        "y": 0,
        "opacity": 0.45,
        "pixelated": true
      }
    }
  },
  "currentSkillId": "default"
}
```

Older exports without a `background` field are upgraded automatically on import.

## Tech Stack

- [React](https://react.dev/) + [Vite](https://vite.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide](https://lucide.dev/) icons

## License

MIT
