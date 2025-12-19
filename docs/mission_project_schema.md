# MissionProject JSON schema (Ceradon Architect Stack)

The Ceradon Architect tools exchange mission context using a shared **MissionProject** JSON envelope. UxS Architect reads and writes this structure for mission imports, WHITEFROST presets, and ATAK-style exports.

- Bundles should include `schemaVersion` alongside `version` to mirror the Hub serializer. UxS Architect currently writes `"schemaVersion": "1.0"` by default and preserves any version present on import.

```jsonc
{
  "version": "2.0.0",
  "schemaVersion": "2.0.0",
  "origin_tool": "uxs",                // node | uxs | mesh | kit | mission | hub
  "mission": {
    "id": "mission-whitefrost",
    "name": "WHITEFROST Demo",
    "objective": "Cold-weather recon and sustainment",
    "ao": "Mountain ridge",
    "origin_tool": "mission"
  },
  "environment": [
    {
      "id": "env-1",
      "altitudeBand": "mountain",     // sea_level | high_desert | mountain (matching UI/CLI bands)
      "temperatureBand": "freezing",  // hot | standard | cold | freezing
      "notes": "Thin air, cold-soaked packs"
    }
  ],
  "constraints": [
    {
      "id": "cst-1",
      "minAdjustedEnduranceMin": 18,
      "minThrustToWeight": 1.3,
      "maxAuwKg": 6
    }
  ],
  "nodes": [
    {
      "id": "node-ridge-relay",
      "name": "Ridge relay node",
      "role": ["mesh_relay", "sensor_node"],
      "origin_tool": "node",
      "powerDrawW": 4.5,
      "weightGrams": 620,
      "rfBandGhz": 2.4,
      "location": { "lat": 39.6121, "lon": -105.9449, "elevation_m": 3120 }
    }
  ],
  "platforms": [
    {
      "id": "plt-recon-quad-01",
      "name": "WHITEFROST Recon Quad",
      "origin_tool": "uxs",
      "domain": "air",
      "frameType": "quad",
      "mountedNodeIds": ["node-ridge-relay"],
      "payloadIds": ["eo_ir_ball"],
      "rfBandsGhz": [5.8, 0.9],
      "powerBudgetW": 185,
      "auwKg": 4.9,
      "adjustedEnduranceMin": 23.4,
      "missionRoles": ["recon", "relay"],
      "environmentRef": "env-1",
      "location": { "lat": 39.6107, "lon": -105.9372, "elevation_m": 2980 }
    }
  ],
  "meshLinks": [
    {
      "id": "link-ridge-hop",
      "from": "node-ridge-relay",
      "to": "plt-recon-quad-01",
      "rfBandGhz": 2.4,
      "notes": "LoS ridge hop"
    }
  ],
  "kits": [
    {
      "id": "kit-linehaul",
      "name": "Snowmobile resupply kit",
      "origin_tool": "kit",
      "supportedPlatformIds": ["plt-recon-quad-01"],
      "powerBudgetW": 120,
      "batteryWh": 260,
      "notes": "Low-temp cells and rugged connectors"
    }
  ]
}
```

## Field notes
- **Stable IDs**: every object must provide an `id` that stays stable across exports/imports. Use UUIDs or deterministic slugs.
- **Origins**: `origin_tool` tags trace which Architect tool authored the object (`node`, `uxs`, `mesh`, `kit`, `mission`, or `hub`).
- **RF bands**: express bands in GHz under `rf_band_ghz` or an array `rf_bands_ghz` for platforms.
- **Power/battery**: include `power_draw_w`, `power_budget_w`, and `battery_wh` (for kits/platforms) when available. Absent values are allowed; consumers must degrade gracefully.
- **Geo fields**: `location` objects accept `lat`, `lon`, and optional `elevation_m`. Objects without coordinates stay in the export but are omitted from GeoJSON features.
- **Partial data**: All arrays are optional; importers should accept missing kits, mesh links, or payload IDs without failing the rest of the load.

## UxS Architect usage
- The web UI and CLI export the current session state as a MissionProject bundle (`mission_project.json`).
- Imports accept the MissionProject shape, merge nodes/platforms into the local library, and preserve `origin_tool` tags for downstream stacking.
- WHITEFROST demo content ships as `data/whitefrost_mission_project.json` and can be loaded from the UI or CLI (`--whitefrost`).
