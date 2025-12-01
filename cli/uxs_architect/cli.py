from __future__ import annotations

import argparse
import json
from typing import Any, Dict, List

from .catalog_loader import load_catalog
from .design import ComponentSelection, DesignResult, evaluate_design, list_category, recommended_roles


class CompactJSONEncoder(json.JSONEncoder):
    def default(self, o: Any):  # type: ignore[override]
        if isinstance(o, DesignResult):
            return o.__dict__
        if isinstance(o, ComponentSelection):
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


def handle_evaluate(catalog: Dict[str, Any], args: argparse.Namespace) -> None:
    selection = ComponentSelection(
        frame=args.frame,
        propulsion=args.propulsion,
        battery=args.battery,
        compute=args.compute,
        radio=args.radio,
        payloads=tuple(args.payloads or ()),
    )
    result = evaluate_design(catalog, selection)
    if args.json:
        print(json.dumps(result, cls=CompactJSONEncoder, indent=2))
        return

    print(f"Frame: {selection.frame}\nPropulsion: {selection.propulsion}\nBattery: {selection.battery}")
    print(f"Compute: {selection.compute}\nRadio: {selection.radio}\nPayloads: {', '.join(selection.payloads) or 'none'}\n")
    print(f"All-up weight: {result.mass_kg:.2f} kg")
    print(f"Payload margin: {result.payload_margin_kg:.2f} kg")
    print(f"Thrust-to-weight: {result.thrust_to_weight:.2f}")
    print(f"Power budget: {result.power_budget_w:.1f} W")
    print(f"Est. endurance: {result.estimated_endurance_min:.1f} min")
    print(f"Role tags: {', '.join(result.role_tags)}")
    if result.warnings:
        print("\nWarnings:")
        for warn in result.warnings:
            print(f"- {warn}")


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
    eval_parser.add_argument("--json", action="store_true", help="Emit JSON instead of text")
    eval_parser.set_defaults(func=handle_evaluate)

    return parser


def main(argv: List[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    catalog = load_catalog(args.catalog)
    args.func(catalog, args)


if __name__ == "__main__":
    main()
