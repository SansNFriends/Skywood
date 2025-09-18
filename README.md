# Skywood Legends Slice

Skywood Legends Slice is a Phaser 3 + Matter.js vertical slice that emulates a high-performance "MapleStory-style" action RPG. The project targets 60 FPS gameplay, responsive controls, and minimal garbage collection pressure while running entirely in the browser.

## Repository Layout

```
phaser-vertical-slice/
  index.html               # Entry point that bootstraps Phaser in module mode
  public/                  # Static assets (placeholder art, audio sprite, tilemaps)
  src/                     # Game source (scenes, entities, systems)
```

## Getting Started

1. Install any static HTTP server you prefer. Python is preinstalled in the container, so the simplest option is:
   ```bash
   cd phaser-vertical-slice
   python3 -m http.server 5173
   ```
2. In Codex Web (or your local browser) open the forwarded preview URL and append `/index.html`, e.g. `https://<preview-host>/index.html`.
3. The game auto-loads assets and starts in the GameScene. Press `I` for the inventory, `O` for the options menu, and `F8` for the bug report overlay.

Phaser is loaded via the local `public/vendor/phaser.esm.js` bundle with a CDN fallback, so no package installation is required.

## Build & Deployment Notes

- The project is fully static. To deploy, copy the `phaser-vertical-slice` directory to any static web host (GitHub Pages, Netlify, etc.). Ensure the host serves the directory root so `/public/...` asset URLs resolve correctly.
- When serving from a subdirectory, keep the folder structure intact (`index.html` next to `public/` and `src/`). The asset loader derives absolute paths from the current page URL, so no additional configuration is needed.
- For production hosting, enable HTTP compression where possible; the asset bundle is composed of lightweight placeholder textures and audio sprites.

## Save System

- Progress (player position, HP/MP, inventory, quick slots, options, key bindings) is saved automatically to `localStorage` under the key `skywood.save.slot0`.
- Autosave triggers after any menu change (inventory/options/bindings), player damage, and every 15 seconds during gameplay. A status banner appears in the lower-left HUD and the bug report overlay includes the latest save information.
- If the browser blocks storage (private mode, quota exceeded), the UI shows a warning so you can notify QA or adjust permissions.

## Debug & QA Tools

- **Performance HUD:** Displays FPS, frame time, live object count, mob visibility, projectile totals, and pool usage to help maintain the 16.7 ms frame budget.
- **Bug Report Overlay:** Press `F8` to open an in-game checklist for reporting issues. The overlay summarises the latest save status and reminders for reproducible bug reports.
- **PerfMeter Overlay:** The in-game PerfMeter (top-left) mirrors core metrics for quick profiling during development.

## Default Controls

- Move: Arrow keys or `A/D`
- Jump: `Space` or `W`
- Dash: `Shift`
- Primary / Secondary attack: `J` / `K`
- Interact: `E`
- Inventory: `I`
- Options: `O`

All bindings can be remapped from the options menu; resets and new bindings are persisted automatically.
