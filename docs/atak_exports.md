# ATAK / Tactical-app exports

UxS Architect can emit TAK-friendly JSON without any external services. The exports are derived from the MissionProject bundle to keep nodes, platforms, and mesh links aligned across Architect tools.

## GeoJSON
- Button: **Export GeoJSON** (web UI) or `python -m cli.uxs_architect.cli mission --file mission_project.json --geojson-out whitefrost.geojson`.
- Shape: `FeatureCollection` containing:
  - **Point features** for `nodes` and `platforms` that include latitude/longitude (optional `elevation_m`).
  - **LineString features** for `mesh_links` when both endpoints can be resolved to coordinates.
- Core properties per feature:
  - `id`, `name`, `type` (`node`, `platform`, or `mesh_link`)
  - `origin_tool` (node, uxs, mesh, kit, mission, hub)
  - `role` / `mission_roles`
  - `rf_band_ghz` or `rf_bands_ghz`
  - `power_draw_w` or `power_budget_w`
  - `environment_ref` and `constraints_ref` when present

Consumers can drop the file directly into ATAK as an overlay or pre-process it into a TAK map package. Missing coordinates simply omit a feature; the rest of the dataset remains intact.

## CoT-like JSON stub
- Button: **Export CoT stub** or CLI `--cot-out whitefrost_cot.json`.
- Structure:

```json
{
  "events": [
    {
      "id": "plt-recon-quad-01",
      "type": "a-f-A-M-UxS",
      "how": "m-g",
      "remarks": "WHITEFROST Recon Quad (recon, relay)",
      "point": {"lat": 39.6107, "lon": -105.9372, "hae": 2980},
      "detail": {
        "origin_tool": "uxs",
        "rf_bands_ghz": [5.8, 0.9],
        "power_budget_w": 185,
        "constraints_ref": "cst-1"
      }
    }
  ]
}
```

This is intentionally minimal (JSON instead of XML) so it can be shimmed into TAK gateways or companion apps without extra dependencies. IDs and `origin_tool` tags stay stable for cross-tool traceability.
