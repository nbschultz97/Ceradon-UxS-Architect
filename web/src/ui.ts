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

const APP_VERSION = 'UxS Architect v0.3.0';
const MISSIONPROJECT_SCHEMA_VERSION = '2.0.0';
const CHANGE_LOG = [
  {
    version: 'UxS Architect v0.3.0',
    date: '2024-06-05',
    changes: [
      'Added MissionProject schema v2.0.0 badge, helper text, and footer mirroring.',
      'Change Log panel plus chain-of-tools explainer aligned with Architect hub.',
      'Mobile-friendly form stacking and scrollable platform comparison tables.'
    ]
  },
  {
    version: 'UxS Architect v0.2.1',
    date: '2024-05-12',
    changes: [
      'Improved MissionProject export to keep node payloads synced with imported catalogs.',
      'Tweaked mesh/node library cards for offline field edits.'
    ]
  }
];

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
  exportPlatformsStandalone: document.querySelector('#exportPlatformsStandalone'),
  importMission: document.querySelector('#importMission'),
  exportMission: document.querySelector('#exportMission'),
  exportGeojson: document.querySelector('#exportGeojson'),
  exportCot: document.querySelector('#exportCot'),
  missionPreview: document.querySelector('#missionProjectJson'),
  copyMissionPreview: document.querySelector('#copyMissionProject'),
  downloadMissionPreview: document.querySelector('#downloadMissionProject'),
  copyGeojson: document.querySelector('#copyGeojson'),
  downloadGeojson: document.querySelector('#downloadGeojson'),
  downloadCot: document.querySelector('#downloadCot'),
  startWhitefrostWizard: document.querySelector('#startWhitefrostWizard'),
  whitefrostFlow: document.querySelector('#whitefrostFlow'),
  missionFile: document.querySelector('#missionFile'),
  loadWhitefrost: document.querySelector('#loadWhitefrost'),
  loadDemo: document.querySelector('#loadDemo'),
  savedPlatforms: document.querySelector('#savedPlatforms'),
  importNodes: document.querySelector('#importNodes'),
  nodeFile: document.querySelector('#nodeFile'),
  platformOutputs: document.querySelector('#platformOutputs'),
  exportPlatformsBottom: document.querySelector('#exportPlatformsBottom'),
  exportPlatformsStandaloneBottom: document.querySelector('#exportPlatformsStandaloneBottom')
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
let importedMissionProject = null;
let lastResult = null;
let lastStack = null;
let lastMissionProjectText = '';

function pickField(entry: any, ...names: string[]) {
  for (const name of names) {
    if (entry && entry[name] !== undefined) return entry[name];
  }
  return undefined;
}

function upgradeMissionBundle(input: any) {
  const bundle = input?.mission_project || input || {};
  const upgraded: any = { ...bundle };

  const mapEnv = (env: any) => ({
    ...env,
    altitudeBand: pickField(env, 'altitudeBand', 'altitude_band'),
    temperatureBand: pickField(env, 'temperatureBand', 'temperature_band')
  });

  const mapConstraint = (c: any) => ({
    ...c,
    minThrustToWeight: pickField(c, 'minThrustToWeight', 'min_thrust_to_weight'),
    minAdjustedEnduranceMin: pickField(c, 'minAdjustedEnduranceMin', 'min_adjusted_endurance_min'),
    maxAuwKg: pickField(c, 'maxAuwKg', 'max_auw_kg')
  });

  const mapNode = (n: any) => ({
    ...n,
    weightGrams: pickField(n, 'weightGrams', 'weight_grams'),
    powerDrawW: pickField(n, 'powerDrawW', 'power_draw_w', 'power_w'),
    rfBandGhz: pickField(n, 'rfBandGhz', 'rf_band_ghz'),
    role: pickField(n, 'role', 'role_tags') || []
  });

  const mapPlatform = (p: any) => ({
    ...p,
    frameType: pickField(p, 'frameType', 'frame_type', 'frame'),
    mountedNodeIds: pickField(p, 'mountedNodeIds', 'mounted_node_ids') || [],
    payloadIds: pickField(p, 'payloadIds', 'payload_ids') || [],
    rfBandsGhz: pickField(p, 'rfBandsGhz', 'rf_bands_ghz') || [],
    powerBudgetW: pickField(p, 'powerBudgetW', 'power_budget_w'),
    batteryWh: pickField(p, 'batteryWh', 'battery_wh'),
    auwKg: pickField(p, 'auwKg', 'auw_kg'),
    nominalEnduranceMin: pickField(p, 'nominalEnduranceMin', 'nominal_endurance_min'),
    adjustedEnduranceMin: pickField(p, 'adjustedEnduranceMin', 'adjusted_endurance_min'),
    thrustToWeight: pickField(p, 'thrustToWeight', 'thrust_to_weight'),
    adjustedThrustToWeight: pickField(p, 'adjustedThrustToWeight', 'adjusted_thrust_to_weight', 'thrust_to_weight'),
    missionRoles: pickField(p, 'missionRoles', 'mission_roles') || [],
    intendedRoles: pickField(p, 'intendedRoles', 'intended_roles') || [],
    environmentRef: pickField(p, 'environmentRef', 'environment_ref'),
    constraintsRef: pickField(p, 'constraintsRef', 'constraints_ref')
  });

  const mapLink = (l: any) => ({ ...l, rfBandGhz: pickField(l, 'rfBandGhz', 'rf_band_ghz') });

  upgraded.schemaVersion = upgraded.schemaVersion || MISSIONPROJECT_SCHEMA_VERSION;
  upgraded.version = upgraded.version || MISSIONPROJECT_SCHEMA_VERSION;
  upgraded.environment = (bundle.environment || []).map(mapEnv);
  upgraded.constraints = (bundle.constraints || []).map(mapConstraint);
  upgraded.nodes = (bundle.nodes || []).map(mapNode);
  upgraded.platforms = (bundle.platforms || []).map(mapPlatform);
  upgraded.meshLinks = ([...(bundle.meshLinks || []), ...(bundle.mesh_links || [])] as any[]).map(mapLink);
  upgraded.kits = (bundle.kits || []).map((k: any) => ({
    ...k,
    supportedPlatformIds: pickField(k, 'supportedPlatformIds', 'supported_platform_ids')
  }));

  return input?.mission_project ? { mission_project: upgraded } : upgraded;
}


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

function renderVersionBadges() {
  const label = `${APP_VERSION} · MissionProject schema v${MISSIONPROJECT_SCHEMA_VERSION}`;
  const badge = document.querySelector('#versionBadge');
  const schemaBadge = document.querySelector('#schemaVersionBadge');
  const footer = document.querySelector('#footerVersion');
  const helper = document.querySelector('#schemaHelper');
  if (badge) badge.textContent = label;
  if (schemaBadge) schemaBadge.textContent = label;
  if (footer) footer.textContent = label;
  if (helper) helper.textContent = `MissionProject schema v${MISSIONPROJECT_SCHEMA_VERSION} import/export with platform origin_tool tags preserved.`;
}

function renderChangeLog() {
  const container = document.querySelector('#changeLog');
  if (!container) return;
  container.innerHTML = '';
  CHANGE_LOG.forEach((entry) => {
    const card = document.createElement('div');
    card.className = 'change-log-entry';

    const title = document.createElement('h4');
    title.textContent = `${entry.version} — ${entry.date}`;
    card.appendChild(title);

    const list = document.createElement('ul');
    (entry.changes || []).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    card.appendChild(list);
    container.appendChild(card);
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
    const roles = (node.role_tags || []).join(', ');
    const power = node.power_draw_typical_w ? `${node.power_draw_typical_w.toFixed(1)} W` : '—';
    li.innerHTML = `<div class="item-title">${node.name}</div>
      <div class="item-meta">${formatWeight(node.weight_grams)} · ${power} · ${roles || 'role TBD'}</div>
      <div class="item-notes">${node.notes || 'Imported node design'}${node.rf_band_ghz ? ` · ${node.rf_band_ghz} GHz radio` : ''}</div>`;
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
    [
      'Hover throttle (env-adjusted)',
      result.propulsionProfile
        ? `${(result.propulsionProfile.hoverThrottle * 100).toFixed(0)}% · ${formatPower(result.propulsionProfile.hoverPower)}`
        : '—'
    ],
    [
      'Hover current per motor',
      result.propulsionProfile?.hoverCurrentPerMotor
        ? `${result.propulsionProfile.hoverCurrentPerMotor.toFixed(1)} A`
        : '—'
    ],
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

function loadSnapshot(entry) {
  const defaults = defaultSelections(getCatalog(), entry.selection?.domain || 'air');
  selection = { ...defaults, ...entry.selection };
  const env = entry.environment || {};
  environment = {
    altitude: env.altitude || 'sea_level',
    temperature: env.temperature || 'standard'
  };
  constraintPrefs = { ...constraintPrefs, ...(entry.constraints || {}) };
  selectors.stackName.value = selection.name || selectors.stackName.value;
  selectors.domain.value = selection.domain || selectors.domain.value;
  selectors.altitude.value = environment.altitude;
  selectors.temperature.value = environment.temperature;
  hydrateConstraintInputs();
  renderSelectionOptions(selectors.domain.value);
  renderNodeOptions();
  evaluateAndRender();
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
    loadBtn.addEventListener('click', () => loadSnapshot(entry));
    li.appendChild(loadBtn);
    selectors.savedPlatforms.appendChild(li);
  });
}

function renderPlatformOutputs() {
  const container = selectors.platformOutputs;
  if (!container) return;
  container.innerHTML = '';
  if (!savedPlatforms.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Design a platform and save it to see it listed here with quick export options.';
    container.appendChild(p);
    return;
  }

  const table = document.createElement('table');
  table.className = 'outputs-table';
  table.innerHTML = `<thead><tr><th>Name</th><th>Domain</th><th>AUW</th><th>Endurance (adj)</th><th>Roles</th><th></th></tr></thead>`;
  const tbody = document.createElement('tbody');

  savedPlatforms.forEach((entry) => {
    const tr = document.createElement('tr');
    const auwKg = entry.metrics?.totalWeight ? `${(entry.metrics.totalWeight / 1000).toFixed(2)} kg` : '—';
    const endurance = entry.metrics?.adjustedEnduranceMinutes ?? entry.metrics?.enduranceMinutes;
    const enduranceText = Number.isFinite(endurance) ? `${endurance.toFixed(1)} min` : '—';
    const roles = (entry.roleTags || []).join(', ');
    tr.innerHTML = `<td>${entry.name || 'Platform'}</td>
      <td class="muted">${entry.selection?.domain || 'air'}</td>
      <td>${auwKg}</td>
      <td>${enduranceText}</td>
      <td class="muted">${roles || 'unspecified'}</td>`;
    const action = document.createElement('td');
    const btn = document.createElement('button');
    btn.className = 'ghost small';
    btn.textContent = 'Load';
    btn.addEventListener('click', () => loadSnapshot(entry));
    action.appendChild(btn);
    tr.appendChild(action);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
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
      payloads: p.payload_ids || p.payloads || p.payloadIds || defaults.payloads || [],
      nodePayloads: p.mounted_node_ids || p.mountedNodeIds || [],
      domain,
      frame: pickField(p, 'frame', 'frame_type', 'frameType') || defaults.frame
    },
    environment: {
      altitude:
        pickField(env, 'altitudeBand', 'altitude_band') ||
        pickField(p.environment_envelope || {}, 'altitudeBand', 'altitude_band') ||
        p.altitude ||
        environment.altitude,
      temperature:
        pickField(env, 'temperatureBand', 'temperature_band') ||
        pickField(p.environment_envelope || {}, 'temperatureBand', 'temperature_band') ||
        p.temperature ||
        environment.temperature
    },
    constraints: { ...constraintPrefs },
    metrics: {
      totalWeight: Number.isFinite(p.auw_kg ?? p.auwKg) ? (p.auw_kg ?? p.auwKg) * 1000 : 0,
      thrustToWeight: Number(p.thrust_to_weight ?? p.thrustToWeight || 0),
      adjustedThrustToWeight: Number(p.adjusted_thrust_to_weight ?? p.adjustedThrustToWeight ?? p.thrust_to_weight || 0),
      enduranceMinutes: Number(p.nominal_endurance_min ?? p.nominalEnduranceMin ?? p.adjusted_endurance_min ?? 0),
      adjustedEnduranceMinutes: Number(p.adjusted_endurance_min ?? p.adjustedEnduranceMin ?? p.nominal_endurance_min || 0),
      payloadMass: Number.isFinite(p.payload_mass_kg) ? p.payload_mass_kg * 1000 : 0,
      powerBudget: p.power_budget_w || p.powerBudgetW || null
    },
    roleTags: p.mission_roles || p.missionRoles || p.intended_roles || [],
    mountedNodes: p.mounted_node_ids || p.mountedNodeIds || [],
    geo: sanitizeLocation(p.location)
  };
}

function applyMissionProject(project) {
  const normalized = upgradeMissionBundle(project);
  const bundle = normalized.mission_project || normalized;
  importedMissionProject = normalized;
  missionMeta = { ...missionMeta, ...(bundle.mission || {}) };
  meshLinks = bundle.meshLinks || bundle.mesh_links || [];
  kits = bundle.kits || [];

  const env = (bundle.environment && bundle.environment[0]) || {};
  environment = {
    altitude: pickField(env, 'altitudeBand', 'altitude_band') || environment.altitude,
    temperature: pickField(env, 'temperatureBand', 'temperature_band') || environment.temperature
  };
  selectors.altitude.value = environment.altitude;
  selectors.temperature.value = environment.temperature;

  const c = (bundle.constraints && bundle.constraints[0]) || {};
  constraintPrefs = {
    minTwr: Number.isFinite(c.minThrustToWeight ?? c.min_thrust_to_weight)
      ? c.minThrustToWeight ?? c.min_thrust_to_weight
      : constraintPrefs.minTwr,
    minEndurance: Number.isFinite(c.minAdjustedEnduranceMin ?? c.min_adjusted_endurance_min)
      ? c.minAdjustedEnduranceMin ?? c.min_adjusted_endurance_min
      : constraintPrefs.minEndurance,
    maxAuw: Number.isFinite(c.maxAuwKg ?? c.max_auw_kg)
      ? c.maxAuwKg ?? c.max_auw_kg
      : constraintPrefs.maxAuw
  };
  hydrateConstraintInputs();

  nodeLibrary = (bundle.nodes || []).map((n) => ({
    id: n.id || n.node_id || n.uuid || n.name,
    name: n.name || 'Imported node',
    weight_grams:
      n.weight_grams || n.weightGrams || (Number.isFinite(n.mass_kg) ? Math.round(n.mass_kg * 1000) : 0),
    power_draw_typical_w: n.power_w || n.power_draw_w || n.powerDrawW || 0,
    role_tags: n.role || n.role_tags || [],
    origin_tool: n.origin_tool || 'node',
    notes: n.notes || 'Imported from MissionProject',
    location: sanitizeLocation(n.location)
  }));

  savedPlatforms = (bundle.platforms || []).map((p) => missionPlatformToSnapshot(p)).filter((p) => p.id);
  refreshCatalogWithNodes();
  renderNodeOptions();
  renderNodeLibrary();
  renderSavedPlatforms();
  renderPlatformOutputs();
  evaluateAndRender();
  persistAppState();
}

function collectRfBands(entry) {
  const rfSet = new Set(entry.rf_bands_ghz || entry.rfBandsGhz || []);
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

function snapshotToPlatform(entry, envId, constraintId, workingCatalog) {
  const rfBands = collectRfBands(entry);
  const battery = entry.selection?.battery ? findById(workingCatalog.batteries, entry.selection.battery) : null;
  const batteryWh = battery ? (battery.capacity_mah * battery.voltage_nominal) / 1000 : undefined;
  const frame = entry.selection?.frame ? findById(workingCatalog.frames, entry.selection.frame) : null;
  const payloadCapacity = frame?.max_auw_grams;
  const payloadAllowance = payloadCapacity && entry.metrics?.totalWeight
    ? Math.max(payloadCapacity - entry.metrics.totalWeight, 0)
    : undefined;
  return {
    id: entry.id,
    name: entry.name,
    origin_tool: entry.origin_tool || 'uxs',
    domain: entry.selection?.domain || 'air',
    frameType: entry.frameType || entry.selection?.frame || 'frame',
    payloadIds: entry.selection?.payloads || [],
    mountedNodeIds: entry.mountedNodes || [],
    rfBandsGhz: rfBands,
    powerBudgetW: entry.metrics?.powerBudget || undefined,
    batteryWh: batteryWh,
    payloadCapacityGrams: payloadCapacity,
    payloadAllowanceGrams: payloadAllowance,
    auwKg: Number.isFinite(entry.metrics?.totalWeight) ? Number((entry.metrics.totalWeight / 1000).toFixed(3)) : undefined,
    nominalEnduranceMin: entry.metrics?.enduranceMinutes || undefined,
    adjustedEnduranceMin: entry.metrics?.adjustedEnduranceMinutes || undefined,
    thrustToWeight: entry.metrics?.thrustToWeight || undefined,
    adjustedThrustToWeight: entry.metrics?.adjustedThrustToWeight || undefined,
    hoverThrottle: entry.metrics?.hoverThrottle,
    hoverPowerW: entry.metrics?.hoverPower,
    missionRoles: entry.roleTags || [],
    intendedRoles: entry.roleTags || [],
    environmentRef: envId,
    environment: {
      altitudeBand: entry.environment?.altitude,
      temperatureBand: entry.environment?.temperature
    },
    constraintsRef: constraintId,
    location: entry.geo || null,
    notes: entry.notes || undefined
  };
}

function buildMissionProjectPayload() {
  const workingCatalog = getCatalog();
  const baseBundle = upgradeMissionBundle(importedMissionProject || {});
  const innerBase = baseBundle.mission_project || baseBundle;
  const envId = missionMeta.environment_id || innerBase.environment?.[0]?.id || 'env-local';
  const constraintId = missionMeta.constraint_id || innerBase.constraints?.[0]?.id || 'cst-local';

  const environmentEntry = {
    id: envId,
    altitudeBand: environment.altitude,
    temperatureBand: environment.temperature,
    notes: missionMeta.environment_notes || 'Captured from UI environment selectors'
  };
  const constraintEntry = {
    id: constraintId,
    minThrustToWeight: constraintPrefs.minTwr ?? undefined,
    minAdjustedEnduranceMin: constraintPrefs.minEndurance ?? undefined,
    maxAuwKg: constraintPrefs.maxAuw ?? undefined
  };

  const platformEntries = savedPlatforms.map((p) => snapshotToPlatform(p, envId, constraintId, workingCatalog));
  const mergedPlatforms = new Map();
  (innerBase.platforms || []).forEach((p) => {
    if (p.id) mergedPlatforms.set(p.id, p);
  });
  platformEntries.forEach((p) => {
    if (p.id) mergedPlatforms.set(p.id, { ...(mergedPlatforms.get(p.id) || {}), ...p });
  });

  const nodeEntries = new Map();
  (innerBase.nodes || []).forEach((n) => {
    if (n.id) nodeEntries.set(n.id, n);
  });
  (nodeLibrary || []).forEach((n) => {
    if (!n.id) return;
    const merged = {
      ...(nodeEntries.get(n.id) || {}),
      id: n.id,
      name: n.name,
      role: n.role_tags || [],
      origin_tool: n.origin_tool || 'node',
      power_draw_w: n.power_draw_typical_w || 0,
      weight_grams: n.weight_grams || 0,
      rf_band_ghz: n.rf_band_ghz || undefined,
      location: sanitizeLocation(n.location),
      notes: n.notes
    };
    nodeEntries.set(n.id, merged);
  });

  const environmentEntries = Array.isArray(innerBase.environment) ? [...innerBase.environment] : [];
  const envIndex = environmentEntries.findIndex((e) => e.id === envId);
  if (envIndex >= 0) environmentEntries[envIndex] = { ...environmentEntries[envIndex], ...environmentEntry };
  else environmentEntries.unshift(environmentEntry);

  const constraintEntries = Array.isArray(innerBase.constraints) ? [...innerBase.constraints] : [];
  const constraintIndex = constraintEntries.findIndex((c) => c.id === constraintId);
  if (constraintIndex >= 0) constraintEntries[constraintIndex] = { ...constraintEntries[constraintIndex], ...constraintEntry };
  else constraintEntries.unshift(constraintEntry);

  const bundle = {
    ...innerBase,
    schemaVersion: innerBase.schemaVersion || MISSIONPROJECT_SCHEMA_VERSION,
    version: innerBase.version || MISSIONPROJECT_SCHEMA_VERSION,
    origin_tool: innerBase.origin_tool || 'uxs',
    mission: { ...innerBase.mission, ...missionMeta, origin_tool: missionMeta.origin_tool || innerBase.origin_tool || 'uxs' },
    environment: environmentEntries,
    constraints: constraintEntries,
    nodes: Array.from(nodeEntries.values()),
    platforms: Array.from(mergedPlatforms.values()),
    meshLinks: innerBase.meshLinks ?? innerBase.mesh_links ?? meshLinks ?? [],
    kits: innerBase.kits ?? kits ?? []
  };

  return importedMissionProject?.mission_project ? { mission_project: bundle } : bundle;
}

function missionProjectToGeoJson(project) {
  const normalized = upgradeMissionBundle(project);
  const bundle = normalized.mission_project || normalized;
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
        role: item.role || item.mission_roles || item.missionRoles || [],
        rf_band_ghz: pickField(item, 'rf_band_ghz', 'rfBandGhz'),
        rf_bands_ghz: pickField(item, 'rf_bands_ghz', 'rfBandsGhz'),
        power_draw_w: pickField(item, 'power_draw_w', 'powerDrawW'),
        power_budget_w: pickField(item, 'power_budget_w', 'powerBudgetW'),
        environment_ref: pickField(item, 'environment_ref', 'environmentRef'),
        constraints_ref: pickField(item, 'constraints_ref', 'constraintsRef')
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
  const normalized = upgradeMissionBundle(project);
  const bundle = normalized.mission_project || normalized;
  const events = [];
  const pushEvent = (item, type) => {
    const loc = sanitizeLocation(item.location);
    if (!loc) return;
    const roles = item.mission_roles || item.missionRoles || item.role || [];
    events.push({
      id: item.id,
      type,
      how: 'm-g',
      remarks: `${item.name} (${roles.join(', ') || 'unspecified'})`,
      point: { lat: loc.lat, lon: loc.lon, hae: loc.elevation_m },
      detail: {
        origin_tool: item.origin_tool || bundle.origin_tool || 'uxs',
        rf_band_ghz: pickField(item, 'rf_band_ghz', 'rfBandGhz'),
        rf_bands_ghz: pickField(item, 'rf_bands_ghz', 'rfBandsGhz'),
        power_draw_w: pickField(item, 'power_draw_w', 'powerDrawW'),
        power_budget_w: pickField(item, 'power_budget_w', 'powerBudgetW'),
        constraints_ref: pickField(item, 'constraints_ref', 'constraintsRef'),
        environment_ref: pickField(item, 'environment_ref', 'environmentRef')
      }
    });
  };

  (bundle.platforms || []).forEach((p) => pushEvent(p, 'a-f-A-M-UxS'));
  (bundle.nodes || []).forEach((n) => pushEvent(n, 'b-r-f'));
  return { events };
}

function renderMissionProjectPreview() {
  const payload = buildMissionProjectPayload();
  lastMissionProjectText = JSON.stringify(payload, null, 2);
  if (selectors.missionPreview) selectors.missionPreview.textContent = lastMissionProjectText;
}

async function copyMissionProjectJson() {
  renderMissionProjectPreview();
  if (navigator?.clipboard) {
    await navigator.clipboard.writeText(lastMissionProjectText);
  }
  document.querySelector('#appWarning').textContent = 'MissionProject copied to clipboard.';
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
    renderWhitefrostWizard();
    renderMissionProjectPreview();
    return json;
  } catch (err) {
    document.querySelector('#appWarning').textContent = err.message;
  }
}

function loadDemoPlatform() {
  const workingCatalog = getCatalog();
  const domain = 'air';
  const demoNode = {
    id: 'node_recon_mesh',
    name: 'Recon mesh payload',
    weight_grams: 180,
    power_draw_typical_w: 9,
    role_tags: ['recon', 'sensor_node'],
    origin_tool: 'node',
    notes: 'Node Architect payload used for demo wiring',
    rf_band_ghz: 2.4
  };

  if (!nodeLibrary.some((n) => n.id === demoNode.id)) {
    nodeLibrary = [demoNode, ...nodeLibrary];
  }
  refreshCatalogWithNodes();
  renderNodeLibrary();

  const defaults = defaultSelections(workingCatalog, domain);
  const pick = (id, arr) => (findById(arr, id) ? id : undefined);
  selection = {
    ...defaults,
    name: 'Recon Quad Platform',
    frame: pick('frame_5in_fpv_trainer_01', workingCatalog.frames) || defaults.frame,
    motorEsc: pick('motor_2207_freestyle', workingCatalog.motorsEsc) || defaults.motorEsc,
    flightController: pick('fc_long_range_nav', workingCatalog.flightControllers) || defaults.flightController,
    vtx: pick('vtx_digital_hd', workingCatalog.vtx) || defaults.vtx,
    rcReceiver: pick('rc_elrs_24_nano', workingCatalog.rcReceivers) || defaults.rcReceiver,
    rcAntenna: pick('ant_omni_24_micro', workingCatalog.antennas) || defaults.rcAntenna,
    vtxAntenna: pick('ant_patch_58', workingCatalog.antennas) || defaults.vtxAntenna,
    auxRadio: pick('aux_data_link', workingCatalog.auxRadios) || defaults.auxRadio,
    auxRadioAntenna: pick('ant_panel_mesh', workingCatalog.antennas) || defaults.auxRadioAntenna,
    battery: pick('bat_4s_5000_lr', workingCatalog.batteries) || defaults.battery,
    compute: pick('comp_jetson_nano_lite', workingCatalog.compute) || defaults.compute,
    camera: pick('cam_fpv_hd_nano', workingCatalog.cameras) || defaults.camera,
    payloads: [pick('payload_eo_turret_light', workingCatalog.payloads) || defaults.payloads?.[0]].filter(Boolean),
    nodePayloads: [demoNode.id],
    domain
  };

  selectors.stackName.value = selection.name;
  selectors.domain.value = domain;
  renderSelectionOptions(domain);
  renderNodeOptions();
  evaluateAndRender();
  savePlatformSnapshot();
  document.querySelector('#appWarning').textContent = 'Loaded Recon Quad Platform demo with Node Architect payload.';
}

async function startWhitefrostWizard() {
  await loadWhitefrostDemo();
  environment = { altitude: 'mountain', temperature: 'freezing' };
  selectors.altitude.value = environment.altitude;
  selectors.temperature.value = environment.temperature;
  constraintPrefs = { minTwr: 1.3, minEndurance: 20, maxAuw: 6 };
  hydrateConstraintInputs();
  renderWhitefrostWizard();
  evaluateAndRender();
  document.querySelector('#appWarning').textContent =
    'WHITEFROST wizard loaded. Step through frame, propulsion, battery, and payload effects in cold/mountain air.';
}

function exportMissionProjectJson() {
  const payload = buildMissionProjectPayload();
  downloadJson('mission_project.json', payload);
}

function downloadMissionProjectPreview() {
  const payload = buildMissionProjectPayload();
  downloadJson('mission_project.json', payload);
}

function exportPlatformsOnly() {
  const envId = missionMeta.environment_id || 'env-local';
  const constraintId = missionMeta.constraint_id || 'cst-local';
  const workingCatalog = getCatalog();
  const payload = savedPlatforms.map((p) => snapshotToPlatform(p, envId, constraintId, workingCatalog));
  downloadJson('platforms.json', payload);
}

function exportGeojsonFromState() {
  const payload = buildMissionProjectPayload();
  const geo = missionProjectToGeoJson(payload);
  downloadJson('mission_project_geojson.json', geo);
}

async function copyGeojsonFromState() {
  const payload = buildMissionProjectPayload();
  const geo = missionProjectToGeoJson(payload);
  if (navigator?.clipboard) {
    await navigator.clipboard.writeText(JSON.stringify(geo, null, 2));
    document.querySelector('#appWarning').textContent = 'GeoJSON copied to clipboard.';
  }
}

function exportCotFromState() {
  const payload = buildMissionProjectPayload();
  const cot = missionProjectToCot(payload);
  downloadJson('mission_project_cot.json', cot);
}

async function copyCotFromState() {
  const payload = buildMissionProjectPayload();
  const cot = missionProjectToCot(payload);
  if (navigator?.clipboard) {
    await navigator.clipboard.writeText(JSON.stringify(cot, null, 2));
    document.querySelector('#appWarning').textContent = 'CoT stub copied to clipboard.';
  }
}

function renderWhitefrostWizard() {
  const target = selectors.whitefrostFlow;
  if (!target) return;
  const payload = buildMissionProjectPayload();
  const bundle = payload.mission_project || payload;
  const env = bundle.environment?.[0] || {};
  const envLabel = `${resolveAltitude(env.altitudeBand || env.altitude_band || environment.altitude).label} · ${resolveTemperature(
    env.temperatureBand || env.temperature_band || environment.temperature
  ).label}`;
  const platforms = (bundle.platforms || []).slice(0, 3);
  const platformCards = platforms
    .map((p) => {
      const enduranceHit = (p.nominalEnduranceMin || 0) - (p.adjustedEnduranceMin || 0);
      const thrust = p.adjustedThrustToWeight || p.thrustToWeight || 0;
      const liftNote = thrust ? `${thrust.toFixed(2)}g/g adjusted T/W` : 'Awaiting stack evaluation';
      const payloadCount = (p.payloadIds || p.payload_ids || []).length;
      const batteryWh = p.batteryWh || p.battery_wh || 'n/a';
      return `
        <div class="wizard-card">
          <h4>${p.name || p.id}</h4>
          <p class="muted">${p.frameType || p.frame_type || 'frame'} · ${batteryWh} Wh battery · ${payloadCount} payloads</p>
          <p>Adjusted endurance: ${p.adjustedEnduranceMin ?? 'n/a'} min (${enduranceHit > 0 ? `-${enduranceHit.toFixed(1)} min` : 'no penalty'})</p>
          <p>${liftNote}</p>
        </div>
      `;
    })
    .join('');
  const liveDelta = lastResult
    ? `<p class="muted">Current stack: ${lastResult.enduranceMinutes?.toFixed(1)} min nominal → ${
        lastResult.adjustedEnduranceMinutes?.toFixed(1)
      } min in freezing mountain air.</p>`
    : '';
  target.innerHTML = `
    <p class="muted">WHITEFROST demo uses ${envLabel}. Step through the preset frames, propulsion, batteries, and payload mixes to see the cold/high-altitude impact on lift and endurance.</p>
    <div class="wizard-grid">${platformCards}</div>
    ${liveDelta}
    <p class="small-note">Swap payloads or batteries, then re-run the wizard to compare endurance hits and thrust margins.</p>
  `;
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
      powerBudget: lastResult.powerBudget,
      hoverThrottle: lastResult.propulsionProfile?.hoverThrottle,
      hoverPower: lastResult.propulsionProfile?.hoverPower
    },
    roleTags: lastResult.roleTags,
    mountedNodes: selection.nodePayloads || []
  };
  savedPlatforms = [entry, ...savedPlatforms.filter((p) => p.id !== entry.id)];
  persistAppState();
  renderSavedPlatforms();
  renderPlatformOutputs();
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
  renderPlatformOutputs();
  renderMissionProjectPreview();
  renderWhitefrostWizard();
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
  selectors.exportPlatformsStandalone?.addEventListener('click', exportPlatformsOnly);
  selectors.exportPlatformsBottom?.addEventListener('click', exportPlatformJson);
  selectors.exportPlatformsStandaloneBottom?.addEventListener('click', exportPlatformsOnly);
  selectors.importMission?.addEventListener('click', () => selectors.missionFile?.click());
  selectors.missionFile?.addEventListener('change', handleMissionImport);
  selectors.exportMission?.addEventListener('click', exportMissionProjectJson);
  selectors.exportGeojson?.addEventListener('click', exportGeojsonFromState);
  selectors.exportCot?.addEventListener('click', exportCotFromState);
  selectors.copyMissionPreview?.addEventListener('click', copyMissionProjectJson);
  selectors.downloadMissionPreview?.addEventListener('click', downloadMissionProjectPreview);
  selectors.copyGeojson?.addEventListener('click', copyGeojsonFromState);
  selectors.downloadGeojson?.addEventListener('click', exportGeojsonFromState);
  selectors.downloadCot?.addEventListener('click', exportCotFromState);
  selectors.loadWhitefrost?.addEventListener('click', loadWhitefrostDemo);
  selectors.startWhitefrostWizard?.addEventListener('click', startWhitefrostWizard);
  selectors.loadDemo?.addEventListener('click', loadDemoPlatform);
}

async function main() {
  loadPersistedState();
  catalog = await loadCatalog();
  refreshCatalogWithNodes();
  populateStaticControls();
  ensureSelection();
  renderVersionBadges();
  renderChangeLog();
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
