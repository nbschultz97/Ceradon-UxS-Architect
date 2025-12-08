# Ceradon UxS Architect

Offline-first UxS design sandbox inspired by the Ceradon Node Architect flow. It includes a CLI for rapid trade-space checks and a static web UI that can run from `file://` on an air-gapped laptop.

## Layout
- `data/catalog.json` — shared component library (frames, propulsion, batteries, compute, radios, payloads).
- `cli/uxs_architect` — Python 3.9+ CLI package for design checks.
- `web/` — static site that mirrors the CLI calculations.

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

## Web usage
Open https://nbschultz97.github.io/Ceradon-UxS-Architect/ (or load `web/index.html` locally). It automatically redirects to the static UI under `/web/`, loads the catalog, and mirrors the CLI calculations (weight, power budget, endurance, role tags, and warnings).

### Importing Node Architect designs
- Use **Import Node designs** in the payloads section to load the JSON emitted by Node Architect. Imported nodes appear in the library, can be mounted as payloads, and their IDs are preserved in exports for traceability.
- Saved platforms and the last environment selection are cached in `localStorage` so offline tweaks survive refreshes.

### Environment effects
- Select an altitude band and temperature band to model thinner air (reduced thrust, higher hover power) and cold-soaked packs (reduced available Wh). The UI and CLI both surface nominal and environment-adjusted endurance plus a second thrust-to-weight value.
- Optional constraints let you flag stacks that fall under a minimum adjusted thrust-to-weight, minimum adjusted endurance, or a maximum AUW.

### Exporting platform JSON
- Click **Export platforms** to download a Mission Architect/KitSmith-friendly JSON bundle:
  ```json
  {
    "platforms": [
      {
        "id": "uuid",
        "name": "Long range scout",
        "frame_type": "quad",
        "auw_kg": 4.2,
        "nominal_endurance_min": 28.5,
        "adjusted_endurance_min": 24.3,
        "thrust_to_weight": 1.45,
        "adjusted_thrust_to_weight": 1.32,
        "mounted_node_ids": ["node-123"],
        "intended_roles": ["recon", "relay"],
        "environment": {"altitude": "high_desert", "temperature": "cold"}
      }
    ],
    "exported_at": "2024-01-01T00:00:00Z"
  }
  ```

## Extending
- Expand `data/catalog.json` with new components or role tags.
- Keep payload definitions granular so future CSI-based pose overlays have clean hooks for labeling and power budgeting.
- For alternate catalogs, point both CLI and web to a different JSON using `--catalog` (CLI) or swapping out the `web/catalog.json` file.
