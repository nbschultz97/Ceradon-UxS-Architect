# Ceradon UxS Architect

Offline-first UxS design sandbox inspired by the Ceradon Node Architect flow. It includes a CLI for rapid trade-space checks and a static web UI that can run from `file://` on an air-gapped laptop.

## Layout
- `data/catalog.json` — shared component library (frames, propulsion, batteries, compute, radios, payloads).
- `data/whitefrost_mission_project.json` — Project WHITEFROST preset in MissionProject format.
- `cli/uxs_architect` — Python 3.9+ CLI package for design checks.
- `web/` — static site that mirrors the CLI calculations.
- `docs/mission_project_schema.md` — shared MissionProject schema used across Architect tools.
- `docs/atak_exports.md` — notes on the GeoJSON and CoT stubs emitted for TAK-style tools.

## CLI usage
Run with system Python (no third-party deps):

```bash
python -m cli.uxs_architect.cli list frames
python -m cli.uxs_architect.cli roles recon
python -m cli.uxs_architect.cli evaluate \
  --frame skyeye_vtol \
  --propulsion vtol_heavy_lift \
  --battery hv_6s_lipo \
  --compute nvidia_orin_nx \
  --radio cband_ofdm \
  --payload eo_ir_ball --payload csi_pose_array
```

Use `--json` to emit structured output for logging or dashboards.

### MissionProject import/export and TAK handoff
- Emit a MissionProject bundle with `python -m cli.uxs_architect.cli mission --whitefrost` or `--file my_project.json --geojson-out` / `--cot-out` to generate TAK-friendly overlays. See `docs/mission_project_schema.md` and `docs/atak_exports.md` for field-level notes.

## Web usage
Open https://nbschultz97.github.io/Ceradon-UxS-Architect/ (or load `web/index.html` locally). It automatically redirects to the static UI under `/web/`, loads the catalog, and mirrors the CLI calculations (weight, power budget, endurance, role tags, and warnings).

### Importing Node Architect designs
- Use **Import Node designs** in the payloads section to load the JSON emitted by Node Architect. Imported nodes appear in the library, can be mounted as payloads, and their IDs are preserved in exports for traceability.
- Saved platforms and the last environment selection are cached in `localStorage` so offline tweaks survive refreshes.

### Environment effects
- Select an altitude band and temperature band to model thinner air (reduced thrust, higher hover power) and cold-soaked packs (reduced available Wh). The UI and CLI both surface nominal and environment-adjusted endurance plus a second thrust-to-weight value.
- Optional constraints let you flag stacks that fall under a minimum adjusted thrust-to-weight, minimum adjusted endurance, or a maximum AUW.

### MissionProject, GeoJSON, and CoT exports
- Use **Import MissionProject** / **Export MissionProject** in the UI to round-trip the schema described in `docs/mission_project_schema.md`. Exports tag each entity with `origin_tool`, include environment/constraint references, and stay tolerant of partial inputs (e.g., mesh links without coordinates).
- **Export GeoJSON** and **Export CoT stub** buttons emit TAK-friendly overlays derived from the MissionProject bundle. See `docs/atak_exports.md` for the exact fields.
- A **WHITEFROST Demo** button loads the preset cold-weather scenario from `data/whitefrost_mission_project.json` (mesh relays, recon quad, sustainment cache).

## Extending
- Expand `data/catalog.json` with new components or role tags.
- Keep payload definitions granular so future CSI-based pose overlays have clean hooks for labeling and power budgeting.
- For alternate catalogs, point both CLI and web to a different JSON using `--catalog` (CLI) or swapping out the `web/catalog.json` file.
