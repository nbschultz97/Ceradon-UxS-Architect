from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Tuple

Catalog = Dict[str, List[Dict[str, object]]]


@dataclass
class ComponentSelection:
    frame: str
    propulsion: str
    battery: str
    compute: str
    radio: str
    payloads: Tuple[str, ...] = field(default_factory=tuple)


@dataclass
class DesignResult:
    mass_kg: float
    payload_margin_kg: float
    thrust_to_weight: float
    estimated_endurance_min: float
    role_tags: List[str]
    power_budget_w: float
    warnings: List[str]


def _lookup(catalog: Catalog, category: str, component_id: str) -> Dict[str, object]:
    for item in catalog.get(category, []):
        if item.get("id") == component_id:
            return item
    raise KeyError(f"{category} component '{component_id}' not found")


def summarize_selection(catalog: Catalog, selection: ComponentSelection) -> Dict[str, Dict[str, object]]:
    return {
        "frame": _lookup(catalog, "frames", selection.frame),
        "propulsion": _lookup(catalog, "propulsion", selection.propulsion),
        "battery": _lookup(catalog, "batteries", selection.battery),
        "compute": _lookup(catalog, "compute", selection.compute),
        "radio": _lookup(catalog, "radios", selection.radio),
        "payloads": [_lookup(catalog, "payloads", pid) for pid in selection.payloads],
    }


def evaluate_design(catalog: Catalog, selection: ComponentSelection) -> DesignResult:
    items = summarize_selection(catalog, selection)
    frame = items["frame"]
    propulsion = items["propulsion"]
    battery = items["battery"]
    compute = items["compute"]
    radio = items["radio"]
    payloads = items["payloads"]

    total_payload_mass = sum(p["mass_kg"] for p in payloads)
    component_mass = total_payload_mass + propulsion["mass_kg"] + battery["mass_kg"] + compute["mass_kg"] + radio["mass_kg"]
    mass_kg = frame["empty_mass_kg"] + component_mass

    payload_margin = frame["max_payload_kg"] - total_payload_mass
    thrust_to_weight = propulsion["thrust_kg"] / mass_kg if mass_kg else 0.0

    hover_power = propulsion["hover_power_w"] if frame["type"] != "ground" else propulsion["hover_power_w"] * 0.35
    payload_power = sum(p.get("power_w", 0) for p in payloads)
    avionics_power = compute["power_w"] + radio["power_w"]
    power_budget = hover_power + payload_power + avionics_power

    endurance_hours = max((battery["capacity_wh"] * 0.92) / max(power_budget, 1), 0)
    endurance_minutes = endurance_hours * 60

    role_tags = sorted({
        *frame.get("role_tags", []),
        *radio.get("role_tags", []),
        *compute.get("role_tags", []),
        *[tag for p in payloads for tag in p.get("role_tags", [])],
    })

    warnings: List[str] = []
    if payload_margin < 0:
        warnings.append(f"Payload exceeds frame allowance by {abs(payload_margin):.2f} kg")
    if mass_kg > frame["max_takeoff_kg"]:
        warnings.append(
            f"All-up weight {mass_kg:.2f} kg exceeds frame MTOW {frame['max_takeoff_kg']:.2f} kg"
        )
    if selection.frame not in propulsion.get("compatible_frames", []):
        warnings.append("Propulsion does not list this frame as compatible")
    if thrust_to_weight < 1.3 and frame["type"] != "ground":
        warnings.append("Thrust-to-weight below 1.3: limited climb/station-keep margin")
    if power_budget > battery["continuous_discharge_w"]:
        warnings.append("Power draw exceeds battery continuous rating")

    return DesignResult(
        mass_kg=round(mass_kg, 2),
        payload_margin_kg=round(payload_margin, 2),
        thrust_to_weight=round(thrust_to_weight, 2),
        estimated_endurance_min=round(endurance_minutes, 1),
        role_tags=role_tags,
        power_budget_w=round(power_budget, 1),
        warnings=warnings,
    )


def list_category(catalog: Catalog, category: str) -> List[Dict[str, object]]:
    if category not in catalog:
        raise KeyError(f"Unknown category: {category}")
    return catalog[category]


def recommended_roles(catalog: Catalog, role: str) -> List[Dict[str, object]]:
    results: List[Dict[str, object]] = []
    for payload in catalog.get("payloads", []):
        if role in payload.get("role_tags", []):
            results.append(payload)
    return results
