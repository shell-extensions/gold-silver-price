# Repository Guidelines

## Project Structure & Module Organization
- `gold-silver-price@arononak.github.io/extension.js` holds the GNOME Shell extension logic (GJS).
- `gold-silver-price@arononak.github.io/metadata.json` is the extension manifest (uuid, shell versions, metadata).
- `gold-silver-price@arononak.github.io/prefs.js` defines the preferences UI for custom metals.
- `gold-silver-price@arononak.github.io/schemas/` contains the GSettings schema for persisted options.
- `get-it.png` and `preview.png` are store/listing assets.
- `makefile` provides build/install/run helpers.

## Build, Test, and Development Commands
- `make build` packages the extension with `gnome-extensions pack` into a zip in the repo root.
- `make install` builds and installs the zip locally, then removes the archive.
- `make run` launches a nested GNOME Shell session and enables the extension for manual testing.

## Coding Style & Naming Conventions
- Use 4-space indentation, single quotes, and semicolons to match the current GJS style.
- Prefer camelCase for functions/variables and PascalCase for classes.
- Instance fields use a leading underscore (example: `_goldButton`, `_silverIndicator`).

## Testing Guidelines
- No automated test suite is present; rely on manual validation.
- Run `make run` and verify the menu lists all prices, toggles visibility, and the Options entry opens preferences.
- Add a custom metal and confirm it appears in the menu and can be shown in the top bar.

## Commit & Pull Request Guidelines
- Recent history uses short, imperative summaries (example: "Update metadata for GNOME Shell 49", "Version upgrade 1 -> 2") and does not follow conventional commits.
- PRs should include a concise description, manual test notes (commands run), and screenshots for UI/panel changes; link issues when available.

## Configuration & Dependencies
- Runtime requires `curl` for price fetching.
- Development requires GNOME Shell and the `gnome-extensions` CLI; `make run` expects a Wayland session.

## Agent Notes (Latest Work)
- Consolidated the top bar into a single indicator with a menu listing all prices and visibility toggles.
- Added a preferences window for custom metals (name + Google Finance URL).
- Introduced GSettings keys for visible metals and custom metal storage.
