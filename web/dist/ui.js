import { loadCatalog, filterByDomain, defaultSelections, filterByRoleTags, findById } from './catalog.js';
import { buildStack, evaluateStack } from './evaluator.js';
import {
  altitudeBands,
  downloadJson,
  formatCurrency,
  formatPower,
  formatWeight,
  parseMultiSelect,
  persistState,
  readStoredState,
  resolveAltitude,
  resolveTemperature,
  setOptions,
  temperatureBands
} from './utils.js';

const missionRoles = [
  'trainer',
  'recon',
  'long_range',
  'strike_capable',
  'resupply',
  'sensor_node',
  'c_uas',
  'decoy',
  'multi'
];

const emconModes = ['covert', 'normal', 'decoy'];
const STORAGE_KEY = 'uxsArchitectState';

const selectors = {
  frame: document.querySelector('#frame'),
  motorEsc: document.querySelector('#motorEsc'),
  flightController: document.querySelector('#flightController'),
  vtx: document.querySelector('#vtx'),
  rcReceiver: document.querySelector('#rcReceiver'),
  rcAntenna: document.querySelector('#rcAntenna'),
  vtxAntenna: document.querySelector('#vtxAntenna'),
  auxRadio: document.querySelector('#auxRadio'),
  auxRadioAntenna: document.querySelector('#auxRadioAntenna'),
  camera: document.querySelector('#camera'),
  battery: document.querySelector('#battery'),
  compute: document.querySelector('#compute'),
  payloads: document.querySelector('#payloads'),
  nodePayloads: document.querySelector('#nodePayloads'),
  missionRole: document.querySelector('#missionRole'),
  emcon: document.querySelector('#emcon'),
  domain: document.querySelector('#domain'),
  stackName: document.querySelector('#stackName'),
  altitude: document.querySelector('#altitudeBand'),
  temperature: document.querySelector('#temperatureBand'),
  minTwr: document.querySelector('#minTwr'),
  minEndurance: document.querySelector('#minEndurance'),
  maxAuw: document.querySelector('#maxAuw'),
  savePlatform: document.querySelector('#savePlatform'),
  exportPlatforms: document.querySelector('#exportPlatforms'),
  importMission: document.querySelector('#importMission'),
  exportMission: document.querySelector('#exportMission'),
  exportGeojson: document.querySelector('#exportGeojson'),
  exportCot: document.querySelector('#exportCot'),
  missionFile: document.querySelector('#missionFile'),
  loadWhitefrost: document.querySelector('#loadWhitefrost'),
  savedPlatforms: document.querySelector('#savedPlatforms'),
  importNodes: document.querySelector('#importNodes'),
  nodeFile: document.querySelector('#nodeFile')
};

let catalog;
let catalogWithNodes;
let selection = {};
let nodeLibrary = [];
let savedPlatforms = [];
let missionMeta = { id: 'mission-local', name: 'Ad hoc mission', origin_tool: 'uxs' };
let meshLinks = [];
let kits = [];
let environment = { altitude: 'sea_level', temperature: 'standard' };
let constraintPrefs = { minTwr: null, minEndurance: null, maxAuw: null };
let lastResult = null;
let lastStack = null;


function deriveNodeComponents(nodes = []) {
  const payloads = [];
  const compute = [];
  const radios = [];
  nodes.forEach((node) => {
    const baseId = node.id;
    const weight = node.weight_grams || 0;
    const power = node.power_draw_typical_w || node.power_draw_w || 0;
    const roles = node.role_tags || node.role || [];
    const name = node.name || 'Imported node';
    payloads.push({
      id: `${baseId}-payload`,
      name: `${name} (payload)`,
      category: 'payload',
      subtype: 'sensor_pod',
      domain: 'any',
      weight_grams: weight,
      cost_usd: node.cost_usd || 0,
      notes: node.notes || 'Imported from MissionProject',
      payload_class: 'sensor_pod',
      power_draw_typical_w: power,
      role_tags: roles,
      mount_pattern: 'quick_plate',
      max_payload_mass_grams: null
    });
    compute.push({
      id: `${baseId}-compute`,
      name: `${name} (compute)`,
      category: 'compute',
      subtype: 'imported_node',
      domain: 'any',
      weight_grams: weight,
      cost_usd: node.cost_usd || 0,
      notes: node.notes || 'Imported from MissionProject',
      compute_class: 'other',
      power_draw_idle_w: power * 0.6,
      power_draw_typical_w: power || 5,
      power_draw_max_w: power || 5,
      ports: { usb: 2, m2: 0, gpio: 20, camera: 1 },
      role_tags: roles
    });
    radios.push({
      id: `${baseId}-radio`,
      name: `${name} (radio)`,
      category: 'aux_radio',
      subtype: 'data_link',
      domain: 'any',
      weight_grams: weight,
      cost_usd: node.cost_usd || 0,
      notes: node.notes || 'Imported from MissionProject',
      radio_class: 'data_link',
      rf_band_ghz: node.rf_band_ghz,
      max_eirp_dbm: 24,
      range_class: 'medium',
      duty_cycle_profile: 'continuous',
      voltage_input_min_v: 10,
      voltage_input_max_v: 24,
      role_tags: roles
    });
  });
  return { payloads, compute, radios };
}

function refreshCatalogWithNodes() {
  if (!catalog) return;
  const derived = deriveNodeComponents(nodeLibrary);
  catalogWithNodes = {
    ...catalog,
    payloads: [...catalog.payloads, ...derived.payloads],
    compute: [...catalog.compute, ...derived.compute],
    auxRadios: [...catalog.auxRadios, ...derived.radios]
  };
}

function loadPersistedState() {
  const fallback = {
    selection: {},
    nodeLibrary: [],
    savedPlatforms: [],
    missionMeta,
    meshLinks,
    kits,
    environment,
    constraints: constraintPrefs
  };
  const state = readStoredState(STORAGE_KEY, fallback);
  selection = state.selection || selection;
  nodeLibrary = state.nodeLibrary || [];
  savedPlatforms = state.savedPlatforms || [];
  missionMeta = state.missionMeta || missionMeta;
  meshLinks = state.meshLinks || [];
  kits = state.kits || [];
  environment = state.environment || environment;
  constraintPrefs = state.constraints || constraintPrefs;
}

function getCatalog() {
  return catalogWithNodes || catalog;
}

function persistAppState() {
  persistState(STORAGE_KEY, {
    selection,
    nodeLibrary,
    savedPlatforms,
    missionMeta,
    meshLinks,
    kits,
    environment,
    constraints: constraintPrefs
  });
}

function ensureSelection() {
  const domain = selection.domain || selectors.domain.value;
  selectors.domain.value = domain;
  if (!selection.frame) selection = { ...selection, ...defaultSelections(getCatalog(), domain) };
  selection = { ...selection, nodePayloads: selection.nodePayloads || [], domain };
}

function populateStaticControls() {
  setOptions(selectors.missionRole, missionRoles.map((r) => ({ id: r, name: r })), (i) => i.name);
  setOptions(selectors.emcon, emconModes.map((r) => ({ id: r, name: r })), (i) => i.name);
  setOptions(selectors.altitude, altitudeBands, (i) => i.name);
  setOptions(selectors.temperature, temperatureBands, (i) => i.name);
  selectors.altitude.value = environment.altitude;
  selectors.temperature.value = environment.temperature;
  hydrateConstraintInputs();
}

function hydrateConstraintInputs() {
  selectors.minTwr.value = constraintPrefs.minTwr ?? '';
  selectors.minEndurance.value = constraintPrefs.minEndurance ?? '';
  selectors.maxAuw.value = constraintPrefs.maxAuw ?? '';
}

function bindPayloadFilter() {
  const filterSelect = document.querySelector('#payloadRoleFilter');
  const roles = new Set();
  const workingCatalog = getCatalog();
  workingCatalog.payloads.forEach((p) => (p.role_tags || []).forEach((r) => roles.add(r)));
  setOptions(filterSelect, Array.from(roles).map((r) => ({ id: r, name: r })), (i) => i.name);
  filterSelect.addEventListener('change', () => renderPayloadLibrary(filterSelect.value));
  filterSelect.value = filterSelect.options[0]?.value || '';
  renderPayloadLibrary(filterSelect.value);
}

function renderPayloadLibrary(role) {
  const list = document.querySelector('#payloadLibrary');
  list.innerHTML = '';
  const workingCatalog = getCatalog();
  const payloads = role ? filterByRoleTags(workingCatalog.payloads, role) : workingCatalog.payloads;
  payloads.slice(0, 40).forEach((p) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="item-title">${p.name}</div>
      <div class="item-meta">${formatWeight(p.weight_grams)} · ${formatPower(p.power_draw_typical_w)} · ${p.role_tags?.join(', ')}</div>
      <div class="item-notes">${p.notes}</div>`;
    list.appendChild(li);
  });
}

function renderNodeOptions() {
  if (!selectors.nodePayloads) return;
  setOptions(selectors.nodePayloads, nodeLibrary, (n) => `${n.name} (${formatWeight(n.weight_grams)})`);
  if (selection.nodePayloads?.length) {
    Array.from(selectors.nodePayloads.options).forEach((opt) => {
      opt.selected = selection.nodePayloads.includes(opt.value);
    });
  }
}

function renderNodeLibrary() {
  const list = document.querySelector('#nodeLibrary');
  if (!list) return;
  list.innerHTML = '';
  if (!nodeLibrary.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Import Node Architect JSON to mount nodes as payloads.';
    list.appendChild(li);
    return;
  }
  nodeLibrary.forEach((node) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="item-title">${node.name}</div>
      <div class="item-meta">${formatWeight(node.weight_grams)} · ${node.role_tags?.join(', ')}</div>
      <div class="item-notes">${node.notes || 'Imported node design'}</div>`;
    list.appendChild(li);
  });
}

function renderSelectionOptions(domain) {
  const workingCatalog = getCatalog();
  const frameOptions = filterByDomain(workingCatalog.frames, domain);
  const batteryOptions = workingCatalog.batteries;
  const motorOptions = filterByDomain(workingCatalog.motorsEsc, domain);
  const fcOptions = filterByDomain(workingCatalog.flightControllers, domain);
  const vtxOptions = workingCatalog.vtx;
  const rcOptions = workingCatalog.rcReceivers;
  const antennaOptions = workingCatalog.antennas;
  const auxOptions = filterByDomain(workingCatalog.auxRadios, domain);
  const camOptions = filterByDomain(workingCatalog.cameras, domain);
  const computeOptions = workingCatalog.compute;
  const payloadOptions = filterByDomain(workingCatalog.payloads, domain);

  setOptions(selectors.frame, frameOptions, (i) => `${i.name} (${i.form_factor})`);
  setOptions(selectors.motorEsc, motorOptions, (i) => `${i.name} (${i.motor_count}x @ ${i.motor_kv}KV)`);
  setOptions(selectors.flightController, fcOptions, (i) => `${i.name}`);
  setOptions(selectors.vtx, vtxOptions, (i) => `${i.name} (${i.vtx_type})`);
  setOptions(selectors.rcReceiver, rcOptions, (i) => `${i.name} (${i.protocol})`);
  setOptions(selectors.rcAntenna, antennaOptions.filter((a) => a.application === 'rc'));
  setOptions(selectors.vtxAntenna, antennaOptions.filter((a) => a.application === 'vtx'));
  setOptions(selectors.auxRadioAntenna, antennaOptions.filter((a) => a.application === 'aux_radio'));
  setOptions(selectors.auxRadio, auxOptions, (i) => `${i.name}`);
  setOptions(selectors.camera, camOptions, (i) => `${i.name} (${i.resolution_class})`);
  setOptions(selectors.battery, batteryOptions, (i) => `${i.name} (${i.s_cells}S ${i.capacity_mah}mAh)`);
  setOptions(selectors.compute, computeOptions, (i) => `${i.name}`);
  setOptions(selectors.payloads, payloadOptions, (i) => `${i.name} (${i.payload_class})`);
  renderNodeOptions();

  Object.entries(selectors).forEach(([key, el]) => {
    if (!el || !selection[key]) return;
    if (el.multiple) {
      Array.from(el.options).forEach((opt) => {
        opt.selected = selection[key].includes(opt.value);
      });
    } else if (Array.from(el.options).some((o) => o.value === selection[key])) {
      el.value = selection[key];
    }
  });
}

function readConstraintsFromDom() {
  const parse = (val) => {
    const num = parseFloat(val);
    return Number.isFinite(num) ? num : null;
  };
  constraintPrefs = {
    minTwr: parse(selectors.minTwr.value),
    minEndurance: parse(selectors.minEndurance.value),
    maxAuw: parse(selectors.maxAuw.value)
  };
}

function readSelectionFromDom() {
  selection = {
    ...selection,
    name: selectors.stackName.value,
    frame: selectors.frame.value,
    motorEsc: selectors.motorEsc.value,
    flightController: selectors.flightController.value,
    vtx: selectors.vtx.value,
    rcReceiver: selectors.rcReceiver.value,
    rcAntenna: selectors.rcAntenna.value,
    vtxAntenna: selectors.vtxAntenna.value,
    auxRadio: selectors.auxRadio.value,
    auxRadioAntenna: selectors.auxRadioAntenna.value,
    camera: selectors.camera.value,
    battery: selectors.battery.value,
    compute: selectors.compute.value,
    payloads: parseMultiSelect(selectors.payloads),
    nodePayloads: parseMultiSelect(selectors.nodePayloads),
    domain: selectors.domain.value
  };
  environment = { altitude: selectors.altitude.value, temperature: selectors.temperature.value };
  readConstraintsFromDom();
}

function renderMetrics(stack, result) {
  const metrics = document.querySelector('#metrics');
  metrics.innerHTML = '';
  const altitude = resolveAltitude(result.environment.altitude);
  const temperature = resolveTemperature(result.environment.temperature);
  const auwLimit = constraintPrefs.maxAuw;
  const auwOk = !auwLimit || result.totalWeight <= auwLimit * 1000;
  const enduranceOk = !constraintPrefs.minEndurance || result.adjustedEnduranceMinutes >= constraintPrefs.minEndurance;
  const twrOk = !constraintPrefs.minTwr || result.adjustedThrustToWeight >= constraintPrefs.minTwr;
  const statusPill = (ok) => `<span class="status ${ok ? 'ok' : 'warn'}">${ok ? 'PASS' : 'CHECK'}</span>`;
  const rows = [
    ['All-up weight', formatWeight(result.totalWeight)],
    ['Payload mass', formatWeight(result.payloadMass)],
    ['Payload allowance', formatWeight((result.payloadCapacity || 0) - result.payloadMass)],
    [
      'Thrust-to-weight',
      `${result.thrustToWeight.toFixed(2)} (adj ${result.adjustedThrustToWeight.toFixed(2)}) ${statusPill(twrOk)}`
    ],
    ['Power budget', formatPower(result.powerBudget)],
    ['Nominal endurance', `${result.enduranceMinutes.toFixed(1)} min`],
    [
      'Env-adjusted endurance',
      `${result.adjustedEnduranceMinutes.toFixed(1)} min @ ${altitude.name} / ${temperature.name} ${statusPill(enduranceOk)}`
    ],
    ['Est. cost', formatCurrency(result.totalCost)]
  ];
  if (auwLimit) rows.unshift(['AUW limit', `${formatWeight(auwLimit * 1000)} ${statusPill(auwOk)}`]);
  rows.forEach(([label, value]) => {
    const div = document.createElement('div');
    div.className = 'metric';
    div.innerHTML = `<div class="label">${label}</div><div class="value">${value}</div>`;
    metrics.appendChild(div);
  });

  const roles = document.querySelector('#roles');
  roles.innerHTML = '';
  result.roleTags.forEach((tag) => {
    const pill = document.createElement('span');
    pill.className = 'tag';
    pill.textContent = tag;
    roles.appendChild(pill);
  });

  const warnings = document.querySelector('#warnings');
  warnings.innerHTML = '';
  result.warnings.forEach((w) => {
    const li = document.createElement('li');
    li.textContent = w;
    warnings.appendChild(li);
  });
}

function renderStackCards(stack) {
  const list = document.querySelector('#stackCards');
  list.innerHTML = '';
  const items = [
    ['Frame', stack.frame],
    ['Motor/ESC', stack.motorEsc],
    ['Flight controller', stack.flightController],
    ['Battery', stack.battery],
    ['Compute', stack.compute],
    ['RC link', stack.rcReceiver],
    ['VTX', stack.vtx],
    ['Aux radio', stack.auxRadio],
    ['Camera', stack.camera],
    ['Payloads', stack.payloads],
    ['Node payloads', stack.nodePayloads]
  ];
  items.forEach(([label, item]) => {
    const card = document.createElement('div');
    card.className = 'card';
    if (Array.isArray(item)) {
      card.innerHTML = `<div class="card-title">${label}</div><div class="card-body">${item
        .map((p) => `<div>${p.name}</div>`)
        .join('') || 'None selected'}</div>`;
    } else if (item) {
      card.innerHTML = `<div class="card-title">${label}</div><div class="card-body">${item.name}<div class="item-notes">${item.notes}</div></div>`;
    } else {
      card.innerHTML = `<div class="card-title">${label}</div><div class="card-body muted">None</div>`;
    }
    list.appendChild(card);
  });
}

function renderLibrary(domain) {
  const libraryList = document.querySelector('#library');
  libraryList.innerHTML = '';
  const workingCatalog = getCatalog();
  const frames = filterByDomain(workingCatalog.frames, domain).slice(0, 8);
  const radios = filterByDomain(workingCatalog.auxRadios, domain).slice(0, 6);
  [...frames, ...radios].forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="item-title">${item.name}</div><div class="item-meta">${formatWeight(item.weight_grams)} · ${formatCurrency(item.cost_usd)}</div><div class="item-notes">${item.notes}</div>`;
    libraryList.appendChild(li);
  });
  renderNodeLibrary();
}

function renderSavedPlatforms() {
  if (!selectors.savedPlatforms) return;
  selectors.savedPlatforms.innerHTML = '';
  if (!savedPlatforms.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Saved platform snapshots will show up here.';
    selectors.savedPlatforms.appendChild(li);
    return;
  }
  savedPlatforms.forEach((entry) => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="item-title">${entry.name || 'Platform'} (${entry.frameType || 'frame'})</div>
      <div class="item-meta">${formatWeight(entry.metrics.totalWeight)} · TW ${entry.metrics.thrustToWeight.toFixed(2)} (adj ${entry.metrics.adjustedThrustToWeight.toFixed(2)}) · ${entry.metrics.adjustedEnduranceMinutes.toFixed(1)} min adj</div>
      <div class="item-notes">${resolveAltitude(entry.environment.altitude).name} · ${resolveTemperature(entry.environment.temperature).name} · ${entry.origin_tool || 'uxs'}</div>`;
    const loadBtn = document.createElement('button');
    loadBtn.className = 'ghost';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => {
      const defaults = defaultSelections(catalog, entry.selection?.domain || 'air');
      selection = { ...defaults, ...entry.selection };
      environment = { ...entry.environment };
      constraintPrefs = { ...entry.constraints };
      selectors.domain.value = selection.domain || selectors.domain.value;
      selectors.altitude.value = environment.altitude;
      selectors.temperature.value = environment.temperature;
      hydrateConstraintInputs();
      renderSelectionOptions(selectors.domain.value);
      renderNodeOptions();
      evaluateAndRender();
    });
    li.appendChild(loadBtn);
    selectors.savedPlatforms.appendChild(li);
  });
}

function sanitizeLocation(loc) {
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return null;
  const cleaned = { lat: Number(loc.lat), lon: Number(loc.lon) };
  if (Number.isFinite(loc.elevation_m)) cleaned.elevation_m = Number(loc.elevation_m);
  return cleaned;
}

function missionPlatformToSnapshot(p) {
  const domain = p.domain || selection.domain || 'air';
  const defaults = getCatalog() ? defaultSelections(getCatalog(), domain) : {};
  const env = p.environment || {};
  return {
    id: p.id || p.platform_id || `platform-${Date.now()}`,
    name: p.name || 'Imported platform',
    frameType: p.frame_type || p.frame || defaults.frame || 'frame',
    origin_tool: p.origin_tool || 'uxs',
    selection: {
      ...defaults,
      ...(p.selection || {}),
      payloads: p.payload_ids || p.payloads || defaults.payloads || [],
      nodePayloads: p.mounted_node_ids || [],
      domain,
      frame: p.frame || p.frame_type || defaults.frame
    },
    environment: {
      altitude: env.altitude_band || p.altitude || environment.altitude,
      temperature: env.temperature_band || p.temperature || environment.temperature
    },
    constraints: { ...constraintPrefs },
    metrics: {
      totalWeight: Number.isFinite(p.auw_kg) ? p.auw_kg * 1000 : 0,
      thrustToWeight: Number(p.thrust_to_weight || 0),
      adjustedThrustToWeight: Number(p.adjusted_thrust_to_weight || p.thrust_to_weight || 0),
      enduranceMinutes: Number(p.nominal_endurance_min || p.adjusted_endurance_min || 0),
      adjustedEnduranceMinutes: Number(p.adjusted_endurance_min || p.nominal_endurance_min || 0),
      payloadMass: Number.isFinite(p.payload_mass_kg) ? p.payload_mass_kg * 1000 : 0,
      powerBudget: p.power_budget_w || null
    },
    roleTags: p.mission_roles || p.intended_roles || [],
    mountedNodes: p.mounted_node_ids || [],
    geo: sanitizeLocation(p.location)
  };
}

function applyMissionProject(project) {
  const bundle = project.mission_project || project;
  missionMeta = { ...missionMeta, ...(bundle.mission || {}) };
  meshLinks = bundle.mesh_links || [];
  kits = bundle.kits || [];

  const env = (bundle.environment && bundle.environment[0]) || {};
  environment = {
    altitude: env.altitude_band || environment.altitude,
    temperature: env.temperature_band || environment.temperature
  };
  selectors.altitude.value = environment.altitude;
  selectors.temperature.value = environment.temperature;

  const c = (bundle.constraints && bundle.constraints[0]) || {};
  constraintPrefs = {
    minTwr: Number.isFinite(c.min_thrust_to_weight) ? c.min_thrust_to_weight : constraintPrefs.minTwr,
    minEndurance: Number.isFinite(c.min_adjusted_endurance_min) ? c.min_adjusted_endurance_min : constraintPrefs.minEndurance,
    maxAuw: Number.isFinite(c.max_auw_kg) ? c.max_auw_kg : constraintPrefs.maxAuw
  };
  hydrateConstraintInputs();

  nodeLibrary = (bundle.nodes || []).map((n) => ({
    id: n.id || n.node_id || n.uuid || n.name,
    name: n.name || 'Imported node',
    weight_grams: n.weight_grams || (Number.isFinite(n.mass_kg) ? Math.round(n.mass_kg * 1000) : 0),
    power_draw_typical_w: n.power_w || n.power_draw_w || 0,
    role_tags: n.role || n.role_tags || [],
    origin_tool: n.origin_tool || 'node',
    notes: n.notes || 'Imported from MissionProject',
    location: sanitizeLocation(n.location)
  }));

  savedPlatforms = (bundle.platforms || []).map((p) => missionPlatformToSnapshot(p)).filter((p) => p.id);
  renderNodeOptions();
  renderNodeLibrary();
  renderSavedPlatforms();
  evaluateAndRender();
  persistAppState();
}

function collectRfBands(entry) {
  const rfSet = new Set(entry.rf_bands_ghz || []);
  const sel = entry.selection || {};
  const workingCatalog = getCatalog();
  const rc = findById(workingCatalog.rcReceivers, sel.rcReceiver || sel.rc_receiver);
  const vtx = findById(workingCatalog.vtx, sel.vtx);
  const aux = findById(workingCatalog.auxRadios, sel.auxRadio || sel.aux_radio);
  const rcAnt = findById(workingCatalog.antennas, sel.rcAntenna || sel.rc_antenna);
  const vtxAnt = findById(workingCatalog.antennas, sel.vtxAntenna || sel.vtx_antenna);
  const auxAnt = findById(workingCatalog.antennas, sel.auxRadioAntenna || sel.aux_radio_antenna);
  [rc, vtx, aux, rcAnt, vtxAnt, auxAnt]
    .filter((item) => item && Number.isFinite(item.rf_band_ghz))
    .forEach((item) => rfSet.add(Number(item.rf_band_ghz)));
  return Array.from(rfSet);
}

function buildMissionProjectPayload() {
  const envId = missionMeta.environment_id || 'env-local';
  const constraintId = missionMeta.constraint_id || 'cst-local';
  const environmentEntry = {
    id: envId,
    altitude_band: environment.altitude,
    temperature_band: environment.temperature,
    notes: missionMeta.environment_notes || 'Captured from UI environment selectors'
  };
  const constraintEntry = {
    id: constraintId,
    min_thrust_to_weight: constraintPrefs.minTwr ?? undefined,
    min_adjusted_endurance_min: constraintPrefs.minEndurance ?? undefined,
    max_auw_kg: constraintPrefs.maxAuw ?? undefined
  };

  const platforms = savedPlatforms.map((p) => {
    const rfBands = collectRfBands(p);
    const battery = p.selection?.battery ? findById(workingCatalog.batteries, p.selection.battery) : null;
    const batteryWh = battery ? (battery.capacity_mah * battery.voltage_nominal) / 1000 : undefined;
    return {
      id: p.id,
      name: p.name,
      origin_tool: p.origin_tool || 'uxs',
      domain: p.selection?.domain || 'air',
      frame_type: p.frameType || p.selection?.frame || 'frame',
      payload_ids: p.selection?.payloads || [],
      mounted_node_ids: p.mountedNodes || [],
      rf_bands_ghz: rfBands,
      power_budget_w: p.metrics?.powerBudget || undefined,
      battery_wh: batteryWh,
      auw_kg: Number.isFinite(p.metrics?.totalWeight) ? Number((p.metrics.totalWeight / 1000).toFixed(3)) : undefined,
      nominal_endurance_min: p.metrics?.enduranceMinutes || undefined,
      adjusted_endurance_min: p.metrics?.adjustedEnduranceMinutes || undefined,
      thrust_to_weight: p.metrics?.thrustToWeight || undefined,
      adjusted_thrust_to_weight: p.metrics?.adjustedThrustToWeight || undefined,
      mission_roles: p.roleTags || [],
      environment_ref: envId,
      constraints_ref: constraintId,
      location: p.geo || null,
      notes: p.notes || undefined
    };
  });

  const nodes = (nodeLibrary || []).map((n) => ({
    id: n.id,
    name: n.name,
    role: n.role_tags || [],
    origin_tool: n.origin_tool || 'node',
    power_draw_w: n.power_draw_typical_w || 0,
    weight_grams: n.weight_grams || 0,
    rf_band_ghz: n.rf_band_ghz || undefined,
    location: sanitizeLocation(n.location),
    notes: n.notes
  }));

  return {
    version: '1.0',
    origin_tool: 'uxs',
    mission: { ...missionMeta, origin_tool: missionMeta.origin_tool || 'uxs' },
    environment: [environmentEntry],
    constraints: [constraintEntry],
    nodes,
    platforms,
    mesh_links: meshLinks || [],
    kits: kits || []
  };
}

function missionProjectToGeoJson(project) {
  const bundle = project.mission_project || project;
  const features = [];
  const pushPoint = (item, type) => {
    const loc = sanitizeLocation(item.location);
    if (!loc) return;
    const coords = Number.isFinite(loc.elevation_m)
      ? [loc.lon, loc.lat, loc.elevation_m]
      : [loc.lon, loc.lat];
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: {
        id: item.id,
        name: item.name,
        type,
        origin_tool: item.origin_tool || bundle.origin_tool || 'uxs',
        role: item.role || item.mission_roles || [],
        rf_band_ghz: item.rf_band_ghz,
        rf_bands_ghz: item.rf_bands_ghz,
        power_draw_w: item.power_draw_w,
        power_budget_w: item.power_budget_w,
        environment_ref: item.environment_ref,
        constraints_ref: item.constraints_ref
      }
    });
  };

  (bundle.nodes || []).forEach((n) => pushPoint(n, 'node'));
  (bundle.platforms || []).forEach((p) => pushPoint(p, 'platform'));

  const locIndex = new Map();
  (bundle.nodes || []).forEach((n) => {
    const loc = sanitizeLocation(n.location);
    if (loc) locIndex.set(n.id, loc);
  });
  (bundle.platforms || []).forEach((p) => {
    const loc = sanitizeLocation(p.location);
    if (loc) locIndex.set(p.id, loc);
  });

  (bundle.mesh_links || []).forEach((link) => {
    const a = locIndex.get(link.from);
    const b = locIndex.get(link.to);
    if (!a || !b) return;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] },
      properties: {
        id: link.id,
        name: link.name || link.id,
        type: 'mesh_link',
        origin_tool: link.origin_tool || 'mesh',
        rf_band_ghz: link.rf_band_ghz,
        notes: link.notes
      }
    });
  });

  return { type: 'FeatureCollection', features };
}

function missionProjectToCot(project) {
  const bundle = project.mission_project || project;
  const events = [];
  const pushEvent = (item, type) => {
    const loc = sanitizeLocation(item.location);
    if (!loc) return;
    const roles = item.mission_roles || item.role || [];
    events.push({
      id: item.id,
      type,
      how: 'm-g',
      remarks: `${item.name} (${roles.join(', ') || 'unspecified'})`,
      point: { lat: loc.lat, lon: loc.lon, hae: loc.elevation_m },
      detail: {
        origin_tool: item.origin_tool || bundle.origin_tool || 'uxs',
        rf_band_ghz: item.rf_band_ghz,
        rf_bands_ghz: item.rf_bands_ghz,
        power_draw_w: item.power_draw_w,
        power_budget_w: item.power_budget_w,
        constraints_ref: item.constraints_ref,
        environment_ref: item.environment_ref
      }
    });
  };

  (bundle.platforms || []).forEach((p) => pushEvent(p, 'a-f-A-M-UxS'));
  (bundle.nodes || []).forEach((n) => pushEvent(n, 'b-r-f'));
  return { events };
}

async function handleMissionImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    applyMissionProject(json);
    document.querySelector('#appWarning').textContent = 'MissionProject imported successfully.';
  } catch (err) {
    document.querySelector('#appWarning').textContent = err.message;
  } finally {
    selectors.missionFile.value = '';
  }
}

async function loadWhitefrostDemo() {
  try {
    const res = await fetch('./data/whitefrost_mission_project.json');
    const json = await res.json();
    applyMissionProject(json);
    document.querySelector('#appWarning').textContent = 'Loaded WHITEFROST demo mission.';
  } catch (err) {
    document.querySelector('#appWarning').textContent = err.message;
  }
}

function exportMissionProjectJson() {
  const payload = buildMissionProjectPayload();
  downloadJson('mission_project.json', payload);
}

function exportGeojsonFromState() {
  const payload = buildMissionProjectPayload();
  const geo = missionProjectToGeoJson(payload);
  downloadJson('mission_project_geojson.json', geo);
}

function exportCotFromState() {
  const payload = buildMissionProjectPayload();
  const cot = missionProjectToCot(payload);
  downloadJson('mission_project_cot.json', cot);
}

function parseNodeDesigns(json) {
  const nodes = Array.isArray(json) ? json : json.nodes || json.designs || [];
  return nodes
    .map((n) => {
      const massKg = n.mass_kg ?? n.weight_kg ?? null;
      const weightGrams = n.weight_grams || (Number.isFinite(massKg) ? Math.round(massKg * 1000) : 0);
      return {
        id: n.id || n.node_id || n.uuid || n.name,
        name: n.name || 'Imported node',
        weight_grams: weightGrams,
        power_draw_typical_w: n.power_w || n.power_draw_w || 0,
        role_tags: n.roles || n.role_tags || [],
        origin_tool: n.origin_tool || 'node',
        notes: n.notes || 'Imported from Node Architect export'
      };
    })
    .filter((n) => n.id);
}

async function handleNodeImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    const parsed = parseNodeDesigns(json);
    if (!parsed.length) throw new Error('No recognizable node designs in file');
    nodeLibrary = parsed;
    refreshCatalogWithNodes();
    renderNodeOptions();
    renderNodeLibrary();
    persistAppState();
    evaluateAndRender();
  } catch (err) {
    const warning = document.querySelector('#appWarning');
    warning.textContent = err.message;
  } finally {
    selectors.nodeFile.value = '';
  }
}

function savePlatformSnapshot() {
  if (!lastResult || !lastStack) {
    evaluateAndRender();
  }
  const id = crypto.randomUUID ? crypto.randomUUID() : `platform-${Date.now()}`;
  const entry = {
    id,
    name: selection.name || 'Platform',
    frameType: lastStack.frame?.form_factor || lastStack.frame?.subtype || lastStack.frame?.id,
    origin_tool: 'uxs',
    selection: { ...selection },
    environment: { ...environment },
    constraints: { ...constraintPrefs },
    metrics: {
      totalWeight: lastResult.totalWeight,
      thrustToWeight: lastResult.thrustToWeight,
      adjustedThrustToWeight: lastResult.adjustedThrustToWeight,
      enduranceMinutes: lastResult.enduranceMinutes,
      adjustedEnduranceMinutes: lastResult.adjustedEnduranceMinutes,
      payloadMass: lastResult.payloadMass,
      powerBudget: lastResult.powerBudget
    },
    roleTags: lastResult.roleTags,
    mountedNodes: selection.nodePayloads || []
  };
  savedPlatforms = [entry, ...savedPlatforms.filter((p) => p.id !== entry.id)];
  persistAppState();
  renderSavedPlatforms();
}

function exportPlatformJson() {
  const payload = buildMissionProjectPayload();
  downloadJson('mission_project.json', payload);
}

function evaluateAndRender() {
  readSelectionFromDom();
  const domain = selectors.domain.value;
  const workingCatalog = getCatalog();
  const stack = buildStack(workingCatalog, selection, selectors.missionRole.value, selectors.emcon.value, domain, nodeLibrary, environment);
  const result = evaluateStack(stack, environment, constraintPrefs);
  lastResult = result;
  lastStack = stack;
  renderMetrics(stack, result);
  renderStackCards(stack);
  renderLibrary(domain);
  renderSavedPlatforms();
  persistAppState();
}

function wireEvents() {
  Object.values(selectors).forEach((el) => {
    el?.addEventListener('change', () => evaluateAndRender());
  });
  document.querySelector('#refreshBtn').addEventListener('click', evaluateAndRender);
  document.querySelector('#resetBtn').addEventListener('click', () => {
    const domain = selectors.domain.value;
    selection = defaultSelections(getCatalog(), domain);
    selection.domain = domain;
    selection.nodePayloads = [];
    environment = { altitude: 'sea_level', temperature: 'standard' };
    selectors.altitude.value = environment.altitude;
    selectors.temperature.value = environment.temperature;
    hydrateConstraintInputs();
    renderSelectionOptions(domain);
    evaluateAndRender();
  });
  selectors.importNodes?.addEventListener('click', () => selectors.nodeFile?.click());
  selectors.nodeFile?.addEventListener('change', handleNodeImport);
  selectors.savePlatform?.addEventListener('click', savePlatformSnapshot);
  selectors.exportPlatforms?.addEventListener('click', exportPlatformJson);
  selectors.importMission?.addEventListener('click', () => selectors.missionFile?.click());
  selectors.missionFile?.addEventListener('change', handleMissionImport);
  selectors.exportMission?.addEventListener('click', exportMissionProjectJson);
  selectors.exportGeojson?.addEventListener('click', exportGeojsonFromState);
  selectors.exportCot?.addEventListener('click', exportCotFromState);
  selectors.loadWhitefrost?.addEventListener('click', loadWhitefrostDemo);
}

async function main() {
  loadPersistedState();
  catalog = await loadCatalog();
  refreshCatalogWithNodes();
  populateStaticControls();
  ensureSelection();
  const domain = selectors.domain.value;
  renderSelectionOptions(domain);
  bindPayloadFilter();
  renderNodeLibrary();
  renderSavedPlatforms();
  wireEvents();
  evaluateAndRender();
}

main().catch((err) => {
  const warning = document.querySelector('#appWarning');
  warning.textContent = err.message;
});
