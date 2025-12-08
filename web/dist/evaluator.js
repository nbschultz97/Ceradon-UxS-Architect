import { calculateEnergyWh, formatWeight, resolveAltitude, resolveTemperature, sum } from './utils.js';
import { findById } from './catalog.js';

export function buildStack(
  catalog,
  selection,
  missionRole,
  emconPosture,
  domain,
  nodeLibrary = [],
  environment = { altitude: 'sea_level', temperature: 'standard' }
) {
  const stack = {
    name: selection.name || 'New Stack',
    domain,
    frame: findById(catalog.frames, selection.frame),
    motorEsc: findById(catalog.motorsEsc, selection.motorEsc),
    flightController: findById(catalog.flightControllers, selection.flightController),
    vtx: findById(catalog.vtx, selection.vtx),
    rcReceiver: findById(catalog.rcReceivers, selection.rcReceiver),
    rcAntenna: findById(catalog.antennas, selection.rcAntenna),
    vtxAntenna: findById(catalog.antennas, selection.vtxAntenna),
    auxRadio: findById(catalog.auxRadios, selection.auxRadio),
    auxRadioAntenna: findById(catalog.antennas, selection.auxRadioAntenna),
    camera: findById(catalog.cameras, selection.camera),
    battery: findById(catalog.batteries, selection.battery),
    compute: findById(catalog.compute, selection.compute),
    payloads: (selection.payloads || []).map((id) => findById(catalog.payloads, id)).filter(Boolean),
    nodePayloads: (selection.nodePayloads || []).map((id) => nodeLibrary.find((n) => n.id === id)).filter(Boolean),
    mountedNodeIds: selection.nodePayloads || [],
    missionRole,
    emconPosture,
    environment
  };
  return stack;
}

function propulsionPower(stack) {
  if (!stack.motorEsc || !stack.battery) return 0;
  const throttleFactor = stack.domain === 'air' ? 0.38 : 0.22;
  const voltage = stack.battery.voltage_nominal;
  return stack.motorEsc.max_current_per_motor_a * stack.motorEsc.motor_count * voltage * throttleFactor;
}

function avionicsPower(stack) {
  const computePower = stack.compute?.power_draw_typical_w || 0;
  const auxPower = stack.auxRadio ? (stack.auxRadio.duty_cycle_profile === 'continuous' ? 10 : 6) : 0;
  const vtxPower = stack.vtx ? Math.max(...stack.vtx.power_levels_mw) / 1000 * 1.3 : 0;
  const rcPower = stack.rcReceiver ? 1.2 : 0.8;
  const fcPower = stack.flightController ? 2 : 1;
  return computePower + auxPower + vtxPower + rcPower + fcPower;
}

export function evaluateStack(stack, environment, constraints = {}) {
  const altitude = resolveAltitude(environment?.altitude || 'sea_level');
  const temperature = resolveTemperature(environment?.temperature || 'standard');
  const weights = [
    stack.frame?.weight_grams || 0,
    stack.motorEsc?.weight_grams || 0,
    stack.flightController?.weight_grams || 0,
    stack.vtx?.weight_grams || 0,
    stack.rcReceiver?.weight_grams || 0,
    stack.rcAntenna?.weight_grams || 0,
    stack.vtxAntenna?.weight_grams || 0,
    stack.auxRadio?.weight_grams || 0,
    stack.auxRadioAntenna?.weight_grams || 0,
    stack.camera?.weight_grams || 0,
    stack.battery?.weight_grams || 0,
    stack.compute?.weight_grams || 0,
    sum(stack.payloads, (p) => p.weight_grams || 0),
    sum(stack.nodePayloads || [], (p) => p.weight_grams || 0)
  ];
  const totalWeight = sum(weights);

  const totalCost = sum(
    [
      stack.frame,
      stack.motorEsc,
      stack.flightController,
      stack.vtx,
      stack.rcReceiver,
      stack.rcAntenna,
      stack.vtxAntenna,
      stack.auxRadio,
      stack.auxRadioAntenna,
      stack.camera,
      stack.battery,
      stack.compute,
      ...stack.payloads
    ].filter(Boolean),
    (item) => item.cost_usd || 0
  );

  const thrustTotal = stack.motorEsc ? stack.motorEsc.max_thrust_per_motor_g * stack.motorEsc.motor_count : 0;
  const thrustToWeight = totalWeight > 0 ? thrustTotal / totalWeight : 0;
  const adjustedThrustToWeight = totalWeight > 0 ? (thrustTotal * altitude.thrustEfficiency) / totalWeight : 0;

  const payloadCapacity = stack.frame?.max_auw_grams || 0;
  const payloadMass = sum(stack.payloads, (p) => p.weight_grams || 0) + sum(stack.nodePayloads || [], (p) => p.weight_grams || 0);

  const propulsion = propulsionPower(stack);
  const payloadPower = sum([...stack.payloads, ...(stack.nodePayloads || [])], (p) => p.power_draw_typical_w || 0);
  const powerBudget = propulsion + avionicsPower(stack) + payloadPower;
  const adjustedPower = powerBudget * (1 + altitude.powerPenalty);
  const nominalCapacity = calculateEnergyWh(stack.battery) * 0.9;
  const adjustedCapacity = nominalCapacity * temperature.capacityFactor;
  const enduranceMinutes = powerBudget > 0 ? (nominalCapacity / powerBudget) * 60 : 0;
  const adjustedEnduranceMinutes = adjustedPower > 0 ? (adjustedCapacity / adjustedPower) * 60 : 0;

  const warnings = [];
  if (stack.frame && stack.battery && !stack.frame.recommended_battery_s_cells.includes(stack.battery.s_cells)) {
    warnings.push('Battery cell count outside frame recommendation');
  }
  if (stack.motorEsc && stack.battery) {
    const cells = stack.battery.s_cells;
    if (!stack.motorEsc.voltage_range_s_cells.includes(cells)) warnings.push('Battery cells outside motor/ESC range');
  }
  if (stack.frame && payloadCapacity && totalWeight > payloadCapacity) warnings.push('All-up weight exceeds frame limit');
  if (stack.domain === 'air' && thrustToWeight < 1.3) warnings.push('Thrust-to-weight under 1.3 limits climb margin');
  if (stack.domain === 'air' && adjustedThrustToWeight < 1.3) {
    warnings.push('Adjusted thrust-to-weight under 1.3 in current environment band');
  } else if (stack.domain === 'air' && adjustedThrustToWeight < 1.4) {
    warnings.push('Adjusted thrust margin is thin; consider more thrust or lighter payloads');
  }
  if (stack.motorEsc && stack.frame && !stack.motorEsc.compatible_frame_form_factors.includes(stack.frame.form_factor)) {
    warnings.push('Motor/ESC set not tagged for this frame form factor');
  }
  if (stack.vtx && stack.vtxAntenna && Math.abs(stack.vtx.rf_band_ghz - stack.vtxAntenna.rf_band_ghz) > 0.5) {
    warnings.push('VTX antenna band mismatch');
  }
  if (stack.rcReceiver && stack.rcAntenna && Math.abs(stack.rcReceiver.rf_band_ghz - stack.rcAntenna.rf_band_ghz) > 0.5) {
    warnings.push('RC antenna band mismatch');
  }
  if (stack.auxRadio && stack.auxRadioAntenna && Math.abs(stack.auxRadio.rf_band_ghz - stack.auxRadioAntenna.rf_band_ghz) > 0.5) {
    warnings.push('Aux radio antenna band mismatch');
  }

  const roleTags = new Set(stack.frame?.typical_role_tags || []);
  stack.payloads.forEach((p) => (p.role_tags || []).forEach((r) => roleTags.add(r)));
  (stack.nodePayloads || []).forEach((p) => (p.role_tags || []).forEach((r) => roleTags.add(r)));

  if (constraints?.maxAuw && totalWeight > constraints.maxAuw * 1000) {
    warnings.push(`All-up weight ${formatWeight(totalWeight)} exceeds configured max ${constraints.maxAuw} kg`);
  }
  if (constraints?.minTwr && adjustedThrustToWeight < constraints.minTwr) {
    warnings.push(`Adjusted thrust-to-weight ${adjustedThrustToWeight.toFixed(2)} below minimum ${constraints.minTwr}`);
  }
  if (constraints?.minEndurance && adjustedEnduranceMinutes < constraints.minEndurance) {
    warnings.push(`Adjusted endurance ${adjustedEnduranceMinutes.toFixed(1)} min below minimum ${constraints.minEndurance} min`);
  }

  return {
    totalWeight,
    totalCost,
    thrustToWeight,
    adjustedThrustToWeight,
    enduranceMinutes,
    adjustedEnduranceMinutes,
    powerBudget,
    payloadMass,
    payloadCapacity,
    warnings,
    roleTags: Array.from(roleTags),
    environment: { altitude: altitude.id, temperature: temperature.id }
  };
}
