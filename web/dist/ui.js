import { loadCatalog, filterByDomain, defaultSelections, filterByRoleTags } from './catalog.js';
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
  savedPlatforms: document.querySelector('#savedPlatforms'),
  importNodes: document.querySelector('#importNodes'),
  nodeFile: document.querySelector('#nodeFile')
};

let catalog;
let selection = {};
let nodeLibrary = [];
let savedPlatforms = [];
let environment = { altitude: 'sea_level', temperature: 'standard' };
let constraintPrefs = { minTwr: null, minEndurance: null, maxAuw: null };
let lastResult = null;
let lastStack = null;

function loadPersistedState() {
  const fallback = { selection: {}, nodeLibrary: [], savedPlatforms: [], environment, constraints: constraintPrefs };
  const state = readStoredState(STORAGE_KEY, fallback);
  selection = state.selection || selection;
  nodeLibrary = state.nodeLibrary || [];
  savedPlatforms = state.savedPlatforms || [];
  environment = state.environment || environment;
  constraintPrefs = state.constraints || constraintPrefs;
}

function persistAppState() {
  persistState(STORAGE_KEY, {
    selection,
    nodeLibrary,
    savedPlatforms,
    environment,
    constraints: constraintPrefs
  });
}

function ensureSelection() {
  const domain = selection.domain || selectors.domain.value;
  selectors.domain.value = domain;
  if (!selection.frame) selection = { ...selection, ...defaultSelections(catalog, domain) };
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
  catalog.payloads.forEach((p) => (p.role_tags || []).forEach((r) => roles.add(r)));
  setOptions(filterSelect, Array.from(roles).map((r) => ({ id: r, name: r })), (i) => i.name);
  filterSelect.addEventListener('change', () => renderPayloadLibrary(filterSelect.value));
  filterSelect.value = filterSelect.options[0]?.value || '';
  renderPayloadLibrary(filterSelect.value);
}

function renderPayloadLibrary(role) {
  const list = document.querySelector('#payloadLibrary');
  list.innerHTML = '';
  const payloads = role ? filterByRoleTags(catalog.payloads, role) : catalog.payloads;
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
  const frameOptions = filterByDomain(catalog.frames, domain);
  const batteryOptions = catalog.batteries;
  const motorOptions = filterByDomain(catalog.motorsEsc, domain);
  const fcOptions = filterByDomain(catalog.flightControllers, domain);
  const vtxOptions = catalog.vtx;
  const rcOptions = catalog.rcReceivers;
  const antennaOptions = catalog.antennas;
  const auxOptions = filterByDomain(catalog.auxRadios, domain);
  const camOptions = filterByDomain(catalog.cameras, domain);
  const computeOptions = catalog.compute;
  const payloadOptions = filterByDomain(catalog.payloads, domain);

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
  const rows = [
    ['All-up weight', formatWeight(result.totalWeight)],
    ['Payload mass', formatWeight(result.payloadMass)],
    ['Payload allowance', formatWeight((result.payloadCapacity || 0) - result.payloadMass)],
    ['Thrust-to-weight', `${result.thrustToWeight.toFixed(2)} (adj ${result.adjustedThrustToWeight.toFixed(2)})`],
    ['Power budget', formatPower(result.powerBudget)],
    ['Nominal endurance', `${result.enduranceMinutes.toFixed(1)} min`],
    ['Env-adjusted endurance', `${result.adjustedEnduranceMinutes.toFixed(1)} min @ ${altitude.name} / ${temperature.name}`],
    ['Est. cost', formatCurrency(result.totalCost)]
  ];
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
  const frames = filterByDomain(catalog.frames, domain).slice(0, 8);
  const radios = filterByDomain(catalog.auxRadios, domain).slice(0, 6);
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
      <div class="item-notes">${resolveAltitude(entry.environment.altitude).name} · ${resolveTemperature(entry.environment.temperature).name}</div>`;
    const loadBtn = document.createElement('button');
    loadBtn.className = 'ghost';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => {
      selection = { ...entry.selection };
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
    selection: { ...selection },
    environment: { ...environment },
    constraints: { ...constraintPrefs },
    metrics: {
      totalWeight: lastResult.totalWeight,
      thrustToWeight: lastResult.thrustToWeight,
      adjustedThrustToWeight: lastResult.adjustedThrustToWeight,
      enduranceMinutes: lastResult.enduranceMinutes,
      adjustedEnduranceMinutes: lastResult.adjustedEnduranceMinutes,
      payloadMass: lastResult.payloadMass
    },
    roleTags: lastResult.roleTags,
    mountedNodes: selection.nodePayloads || []
  };
  savedPlatforms = [entry, ...savedPlatforms.filter((p) => p.id !== entry.id)];
  persistAppState();
  renderSavedPlatforms();
}

function exportPlatformJson() {
  if (!savedPlatforms.length) {
    alert('No saved platforms to export yet.');
    return;
  }
  const payload = savedPlatforms.map((p) => ({
    id: p.id,
    name: p.name,
    frame_type: p.frameType,
    auw_kg: Number((p.metrics.totalWeight / 1000).toFixed(3)),
    nominal_endurance_min: Number(p.metrics.enduranceMinutes.toFixed(1)),
    adjusted_endurance_min: Number(p.metrics.adjustedEnduranceMinutes.toFixed(1)),
    thrust_to_weight: Number(p.metrics.thrustToWeight.toFixed(2)),
    adjusted_thrust_to_weight: Number(p.metrics.adjustedThrustToWeight.toFixed(2)),
    mounted_node_ids: p.mountedNodes || [],
    intended_roles: p.roleTags || [],
    environment: p.environment
  }));
  downloadJson('uxs_platforms.json', { platforms: payload, exported_at: new Date().toISOString() });
}

function evaluateAndRender() {
  readSelectionFromDom();
  const domain = selectors.domain.value;
  const stack = buildStack(catalog, selection, selectors.missionRole.value, selectors.emcon.value, domain, nodeLibrary, environment);
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
    selection = defaultSelections(catalog, domain);
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
}

async function main() {
  loadPersistedState();
  catalog = await loadCatalog();
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
