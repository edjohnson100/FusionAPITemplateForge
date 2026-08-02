# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

This repo started from `_Templates/Fusion_Addins`, Ed's starter template for a Fusion 360 add-in (Python) with a persistent, dockable HTML palette UI (`adsk.core.Palettes`). It follows the same structural conventions as the rest of his Fusion add-in fleet (GridfinityGeneratorPlus, ChangelogSidecar, LiveConfig, LiveUtilities, FingerJointsLive, etc.).

**First things to do after copying this template into a new project folder:**
1. Rename the project folder itself to the real add-in name (PascalCase, no spaces) — `config.py`'s `ADDIN_NAME` is derived from this folder name automatically, so nothing else needs editing for that.
2. Rename `{{NAME}}.py` → `<{{NAME}}>.py`, `{{NAME}}.manifest` → `<{{NAME}}>.manifest`, `{{NAME}}AppIcon.png` → `<{{NAME}}>AppIcon.png`, and `resources/{{NAME}}_Index.html` → `resources/<{{NAME}}>_Index.html`.
3. In `config.py`, set `COMPANY_NAME` to your own tag.
4. In `{{NAME}}.manifest`, fill in `id` (a fresh GUID), `description`, and confirm `iconFilename` matches the renamed icon.
5. In `resources/<{{NAME}}>_Index.html`, replace the `<h2>` title text and the footer's add-in name/version line.
6. Grep the tree for any leftover `{{NAME}}` strings you missed (there should be none left referencing the placeholder once the steps above are done).

There is no build system, package manager, linter, or test suite — this only runs inside Fusion 360's embedded Python interpreter via the Fusion 360 add-in loader. There are no `requirements.txt`/`pyproject.toml`.

## Running / testing changes

There is no CLI entry point or headless test runner — `adsk.core`/`adsk.fusion` are Fusion 360's runtime API modules and only exist inside the Fusion 360 process. To verify a change:

1. Open Fusion 360 → Utilities → Add-Ins → Scripts and Add-Ins → add this folder as an add-in (or point Fusion at the `.manifest` file).
2. Run/reload the add-in, then use its toolbar button (Solid Create panel by default — see `config.py`'s `DEFAULT_PANEL_ID`) to open the palette and exercise the change interactively.
3. Use `futil.log(...)` (see `lib/fusionAddInUtils/general_utils.py`) to write to the Fusion 360 Text Command window / console for debugging; toggle verbose logging via `config.DEBUG`.

Since there's no automated test suite, manually exercise the changed inputs and confirm the result in Fusion's viewport/browser before considering a change done.

## Architecture

### Add-in bootstrap
- `<{{NAME}}>.py` is the add-in entry point Fusion 360 calls (`run(context)`/`stop(context)`), delegating to `commands.start()`/`commands.stop()`.
- `commands/__init__.py` is the registry of top-level commands (currently just `PaletteCommand`).
- `config.py` holds add-in-wide constants: `DEBUG`, `ADDIN_NAME` (folder-derived), `COMPANY_NAME`, workspace/panel IDs, `PALETTE_ID`/`CMD_ID`, and `ADDIN_VERSION` (read from the `.manifest` file at import time — never hardcode a version string elsewhere, this is the single source of truth).

### `commands/PaletteCommand.py` — the palette
Everything palette-related lives in this one file: lifecycle (`start()`/`stop()`, `open_palette()`), the Python↔HTML bridge (`PaletteHtmlEventHandler`), the config manager (named-preset Save As/Load/Delete/Update Current/Factory Reset), theme persistence, and the grouped-undo helper.

- **Python ↔ HTML bridge**: HTML → Python via `window.adsk.fusionSendData('message', JSON.stringify({action, ...}))` in `script.js`'s `sendToFusion()`, routed through `PaletteHtmlEventHandler.notify()`, which parses the JSON and dispatches on the `action` field. Python → HTML via `palette.sendInfoToHTML(action, jsonString)`, received by `window.fusionJavaScriptHandler.handle(action, data)` in `script.js`.
- **Startup data request pattern**: `script.js` requests its initial state on load (`get_defaults` action) and **must** wrap that first send in a retry loop — `window.adsk` is not guaranteed to exist the instant the script runs, and a single unconditional send can silently no-op forever if the bridge isn't ready yet. This exact bug has shipped in this fleet before (see `Archive/!Dev_Notes.md` conventions in sibling repos) — don't remove the retry loop when refactoring startup.
- **Grouped Undo**: Fusion has no Revit-style `Design.startTransactionGroup()`/`assimilate()` API for scripts/add-ins. The only documented way to bundle several API calls into one Undo entry outside of a command dialog is to run them from a headless command's `execute` event handler. `_run_grouped(work, name)` stashes a callable and `.execute()`s a hidden, never-shown `UNDO_GROUP_CMD_ID` command definition (registered in `start()`) to get this. Use it for any handler that calls multiple `adsk.fusion` mutation APIs in a row (preview/generate-style actions), not for read-only or single-call handlers.
- **Config manager**: named presets live as individual JSON files under `commandConfig/presets/main/<name>.json` (tracked in git — these are deliberately-saved, shareable content, unlike the gitignored live/per-machine state below). `commandConfig/ui_defaults.json` remembers which preset is currently active per tab; `commandConfig/config.ini` holds the toolbar button's promoted state. Both of the latter, plus `commandConfig/presets/`, are gitignored (see `.gitignore`) since they mutate on every edit rather than being deliberately saved content.
- **Preview/Generate/Clear Preview**: the Main tab ships `Update Preview`/`Generate`/`Clear Preview` action buttons wired through the grouped-undo helper, calling a stub `commands/generation.py::create_and_build(form)`. Replace that stub with real `adsk.fusion` geometry construction when you build the add-in's actual feature — keep the preview/generate/clear-preview *shape* (build a not-yet-finalized "preview" component, track it, let Generate finalize or Clear Preview delete it) since it's the established UX pattern across this fleet, even if you don't need every part of it.

### Theming
`resources/style.css` follows this fleet's "Theme Designer Pro" CSS-variable standard: every themeable value is a `var(--name)` custom property, `:root` holds the default ("Light") values, and `:root[data-theme="Name"]` blocks (`Dark`, `Midnight`, `Sandstone`) override them. Switching is `document.documentElement.setAttribute('data-theme', name)`/`removeAttribute` (must target `<html>`, not `<body>`).

- Host-side persistence: `config.json` (gitignored) remembers the active theme's name plus `fontFamily`/`fontSize`; `imported_themes.json` (gitignored) holds every theme the user has ever imported (`{themeId: varsDict}`), so switching back to a previously-imported theme still works after a restart.
- Users can import a `.theme.json` (`{id, vars, fontFamily, fontSize}`) or a full `style.css` bundle (multiple themes at once, parsed client-side via `parseStyleCSS()`/round-tripped via `generateFullCSS()`) — see `resources/script.js`. Sample theme files ship in `resources/themes/`.
- Font Family/Base Font Size are edited independently of which theme is selected and apply on top of any of them via a separate `#font-overrides` `<style>` tag — don't bake font settings into a theme's own `vars`, that causes CSS-specificity fights with `:root[data-theme="X"]` on import (a bug this fleet has hit before).
- Never use `localStorage` for durable palette state — all of it is Python-owned JSON pushed via a `set_state` message, so it survives a browser-cache clear inside Fusion's embedded webview and stays consistent across the Python↔HTML bridge.

## Palette layout (structural, fleet-wide)

The palette starts with exactly **two tabs**: **Main** (the add-in's actual feature — currently a single example field, replace it) and **Themes**. Structure, sourced from `Archive/!Fleet_Standardization_Prompt.md` (the fleet-wide UI standard doc — read it before restructuring the palette):

- **Header**: a `.header` flex row — title (`<h2>`) + `#versionTag` stacked left, the theme `<select id="theme.name">` on the right, vertically centered with the title block.
- **Themes tab**: plural "Themes", one collapsible `<details class="section">` containing Font Family/Base Font Size selects, JSON theme import/export, CSS-bundle import/export, Remove Selected Theme, and Factory Reset Themes.
- **Footer**: a single `.field-hint.version-footer` div (two centered lines: add-in name, then `vX.Y.Z, Month Year`) at the very end of `#app`, outside every `.tab-panel`, so it's visible regardless of active tab. Version is sourced from `config.ADDIN_VERSION` (manifest-read), never hardcoded.
- **Common Settings**: not present by default — only add a `<details class="section"><summary>...</summary>` collapsible above the tab bar if you actually introduce fields shared across multiple tabs. Don't invent one just to have one.

Every field input uses `id="{tab}.{fieldName}"` (e.g. `main.exampleValue`, `theme.fontFamily`) — `script.js`'s generic form read/write helpers rely on this convention.
