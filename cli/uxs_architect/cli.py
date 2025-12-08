from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

from .catalog_loader import load_catalog
from .design import (
    ComponentSelection,
    ConstraintSettings,
    DesignResult,
    Environment,
    ALTITUDE_BANDS,
    TEMPERATURE_BANDS,
    evaluate_design,
    list_category,
    recommended_roles,
)

BASE_DIR = Path(__file__).resolve().parents[2]
WHITEFROST_PATH = BASE_DIR / "data" / "whitefrost_mission_project.json"


class CompactJSONEncoder(json.JSONEncoder):
    def default(self, o: Any):  # type: ignore[override]
        if isinstance(o, DesignResult):
            return o.__dict__
        if isinstance(o, ComponentSelection):
            return o.__dict__
        if isinstance(o, Environment):
            return o.__dict__
        if isinstance(o, ConstraintSettings):
            return o.__dict__
        return super().default(o)


def _print_table(items: List[Dict[str, Any]], columns: List[str]) -> None:
    if not items:
        print("(no entries)")
        return
    widths = {col: max(len(col), max(len(str(item.get(col, ""))) for item in items)) for col in columns}
    header = " | ".join(col.ljust(widths[col]) for col in columns)
    print(header)
    print("-+-".join("-" * widths[col] for col in columns))
    for item in items:
        print(" | ".join(str(item.get(col, "")).ljust(widths[col]) for col in columns))


def handle_list(catalog: Dict[str, Any], args: argparse.Namespace) -> None:
    items = list_category(catalog, args.category)
    columns = ["id", "name"]
    sample = items[0] if items else {}
    for key in ("type", "mass_kg", "power_w", "capacity_wh", "thrust_kg"):
        if key in sample:
            columns.append(key)
    _print_table(items, columns)


def handle_roles(catalog: Dict[str, Any], args: argparse.Namespace) -> None:
    matches = recommended_roles(catalog, args.role)
    if not matches:
        print(f"No payloads tagged with role '{args.role}'")
        return
    _print_table(matches, ["id", "name", "mass_kg", "power_w", "role_tags"])


def _sanitize_location(loc: Dict[str, Any] | None) -> Dict[str, float] | None:
    if not isinstance(loc, dict):
        return None
    lat = loc.get("lat")
    lon = loc.get("lon")
    if lat is None or lon is None:
        return None
    cleaned: Dict[str, float] = {"lat": float(lat), "lon": float(lon)}
    if "elevation_m" in loc:
        cleaned["elevation_m"] = float(loc["elevation_m"])
    return cleaned


def load_mission_project(path: str | Path) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def mission_project_to_geojson(project: Dict[str, Any]) -> Dict[str, Any]:
    bundle = project.get("mission_project") or project
    features: List[Dict[str, Any]] = []

    def push_point(item: Dict[str, Any], feature_type: str) -> None:
        loc = _sanitize_location(item.get("location"))
        if not loc:
            return
        coords = [loc["lon"], loc["lat"]]
        if "elevation_m" in loc:
            coords.append(loc["elevation_m"])
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": coords},
                "properties": {
                    "id": item.get("id"),
                    "name": item.get("name"),
                    "type": feature_type,
                    "origin_tool": item.get("origin_tool", bundle.get("origin_tool", "uxs")),
                    "role": item.get("role") or item.get("mission_roles") or [],
                    "rf_band_ghz": item.get("rf_band_ghz"),
                    "rf_bands_ghz": item.get("rf_bands_ghz"),
                    "power_draw_w": item.get("power_draw_w"),
                    "power_budget_w": item.get("power_budget_w"),
                    "environment_ref": item.get("environment_ref"),
                    "constraints_ref": item.get("constraints_ref"),
                },
            }
        )

    for node in bundle.get("nodes", []):
        push_point(node, "node")
    for platform in bundle.get("platforms", []):
        push_point(platform, "platform")

    loc_index: Dict[str, Dict[str, float]] = {}
    for node in bundle.get("nodes", []):
        loc = _sanitize_location(node.get("location"))
        if loc:
            loc_index[node.get("id")] = loc
    for platform in bundle.get("platforms", []):
        loc = _sanitize_location(platform.get("location"))
        if loc:
            loc_index[platform.get("id")] = loc

    for link in bundle.get("mesh_links", []):
        a = loc_index.get(link.get("from"))
        b = loc_index.get(link.get("to"))
        if not a or not b:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": [[a["lon"], a["lat"]], [b["lon"], b["lat"]]]},
                "properties": {
                    "id": link.get("id"),
                    "name": link.get("name", link.get("id")),
                    "type": "mesh_link",
                    "origin_tool": link.get("origin_tool", "mesh"),
                    "rf_band_ghz": link.get("rf_band_ghz"),
                    "notes": link.get("notes"),
                },
            }
        )

    return {"type": "FeatureCollection", "features": features}


def mission_project_to_cot(project: Dict[str, Any]) -> Dict[str, Any]:
    bundle = project.get("mission_project") or project
    events: List[Dict[str, Any]] = []

    def push_event(item: Dict[str, Any], type_code: str) -> None:
        loc = _sanitize_location(item.get("location"))
        if not loc:
            return
        roles = item.get("mission_roles") or item.get("role") or []
        events.append(
            {
                "id": item.get("id"),
                "type": type_code,
                "how": "m-g",
                "remarks": f"{item.get('name')} ({', '.join(roles) or 'unspecified'})",
                "point": {"lat": loc["lat"], "lon": loc["lon"], "hae": loc.get("elevation_m")},
                "detail": {
                    "origin_tool": item.get("origin_tool", bundle.get("origin_tool", "uxs")),
                    "rf_band_ghz": item.get("rf_band_ghz"),
                    "rf_bands_ghz": item.get("rf_bands_ghz"),
                    "power_draw_w": item.get("power_draw_w"),
                    "power_budget_w": item.get("power_budget_w"),
                    "constraints_ref": item.get("constraints_ref"),
                    "environment_ref": item.get("environment_ref"),
                },
            }
        )

    for platform in bundle.get("platforms", []):
        push_event(platform, "a-f-A-M-UxS")
    for node in bundle.get("nodes", []):
        push_event(node, "b-r-f")
    return {"events": events}


def handle_evaluate(catalog: Dict[str, Any], args: argparse.Namespace) -> None:
    selection = ComponentSelection(
        frame=args.frame,
        propulsion=args.propulsion,
        battery=args.battery,
        compute=args.compute,
        radio=args.radio,
        payloads=tuple(args.payloads or ()),
        mounted_nodes=tuple(args.nodes or ()),
    )
    environment = Environment(
        altitude_band=args.altitude_band,
        temperature_band=args.temperature_band,
    )
    constraints = ConstraintSettings(
        min_thrust_to_weight=args.min_twr,
        min_adjusted_endurance_min=args.min_endurance,
        max_auw_kg=args.max_auw,
    )
    result = evaluate_design(catalog, selection, environment=environment, constraints=constraints)
    if args.json:
        print(json.dumps(result, cls=CompactJSONEncoder, indent=2))
        return

    print(f"Frame: {selection.frame}\nPropulsion: {selection.propulsion}\nBattery: {selection.battery}")
    print(f"Compute: {selection.compute}\nRadio: {selection.radio}\nPayloads: {', '.join(selection.payloads) or 'none'}\n")
    print(f"All-up weight: {result.mass_kg:.2f} kg")
    print(f"Payload margin: {result.payload_margin_kg:.2f} kg")
    print(f"Thrust-to-weight: {result.thrust_to_weight:.2f} (adjusted: {result.adjusted_thrust_to_weight:.2f})")
    print(f"Power budget: {result.power_budget_w:.1f} W")
    print(
        "Est. endurance: "
        f"{result.estimated_endurance_min:.1f} min nominal / {result.adjusted_endurance_min:.1f} min env-adjusted"
    )
    print(
        f"Environment: {ALTITUDE_BANDS[result.environment.altitude_band]['label']}, "
        f"{TEMPERATURE_BANDS[result.environment.temperature_band]['label']}"
    )
    print(f"Role tags: {', '.join(result.role_tags)}")
    if result.warnings:
        print("\nWarnings:")
        for warn in result.warnings:
            print(f"- {warn}")


def handle_mission(_: Dict[str, Any], args: argparse.Namespace) -> None:
    if args.whitefrost:
        project = load_mission_project(args.file or WHITEFROST_PATH)
    else:
        project = load_mission_project(args.file)

    bundle = project.get("mission_project") or project
    mission = bundle.get("mission", {})
    print(
        f"Mission: {mission.get('name', 'Unknown')} | platforms: {len(bundle.get('platforms', []))} | "
        f"nodes: {len(bundle.get('nodes', []))} | mesh links: {len(bundle.get('mesh_links', []))}"
    )

    if args.geojson_out:
        geojson = mission_project_to_geojson(project)
        Path(args.geojson_out).write_text(json.dumps(geojson, indent=2), encoding="utf-8")
        print(f"GeoJSON written to {args.geojson_out}")
    if args.cot_out:
        cot = mission_project_to_cot(project)
        Path(args.cot_out).write_text(json.dumps(cot, indent=2), encoding="utf-8")
        print(f"CoT stub written to {args.cot_out}")
    if not args.geojson_out and not args.cot_out:
        print(json.dumps(project, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Ceradon UxS Architect CLI")
    parser.add_argument("--catalog", default=None, help="Path to catalog JSON (defaults to data/catalog.json)")

    sub = parser.add_subparsers(dest="command", required=True)

    list_parser = sub.add_parser("list", help="List catalog entries")
    list_parser.add_argument("category", choices=["frames", "propulsion", "batteries", "compute", "radios", "payloads"])
    list_parser.set_defaults(func=handle_list)

    role_parser = sub.add_parser("roles", help="Show payloads that satisfy a role tag")
    role_parser.add_argument("role")
    role_parser.set_defaults(func=handle_roles)

    eval_parser = sub.add_parser("evaluate", help="Evaluate a specific design stack")
    eval_parser.add_argument("--frame", required=True)
    eval_parser.add_argument("--propulsion", required=True)
    eval_parser.add_argument("--battery", required=True)
    eval_parser.add_argument("--compute", required=True)
    eval_parser.add_argument("--radio", required=True)
    eval_parser.add_argument("--payload", dest="payloads", action="append")
    eval_parser.add_argument("--node", dest="nodes", action="append", help="Mounted node IDs (for traceability)")
    eval_parser.add_argument(
        "--altitude-band",
        choices=list(ALTITUDE_BANDS.keys()),
        default="sea_level",
        help="Environment altitude band for thrust margin",
    )
    eval_parser.add_argument(
        "--temperature-band",
        choices=list(TEMPERATURE_BANDS.keys()),
        default="standard",
        help="Environment temperature band for battery performance",
    )
    eval_parser.add_argument("--min-twr", type=float, help="Minimum acceptable thrust-to-weight (adjusted)")
    eval_parser.add_argument("--min-endurance", type=float, help="Minimum environment-adjusted endurance (minutes)")
    eval_parser.add_argument("--max-auw", type=float, help="Maximum AUW (kg)")
    eval_parser.add_argument("--json", action="store_true", help="Emit JSON instead of text")
    eval_parser.set_defaults(func=handle_evaluate)

    mission_parser = sub.add_parser("mission", help="Import/export MissionProject bundles")
    mission_source = mission_parser.add_mutually_exclusive_group(required=True)
    mission_source.add_argument("--whitefrost", action="store_true", help="Emit the Project WHITEFROST preset")
    mission_source.add_argument("--file", help="Path to MissionProject JSON")
    mission_parser.add_argument("--geojson-out", help="Write GeoJSON overlay to file")
    mission_parser.add_argument("--cot-out", help="Write CoT-like JSON stub to file")
    mission_parser.set_defaults(func=handle_mission)

    return parser


def main(argv: List[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    catalog = load_catalog(args.catalog)
    args.func(catalog, args)


if __name__ == "__main__":
    main()
