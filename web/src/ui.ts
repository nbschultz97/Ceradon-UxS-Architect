import { loadCatalog, filterByDomain, defaultSelections, filterByRoleTags } from './catalog.js';
import { buildStack, evaluateStack } from './evaluator.js';
import { formatWeight, formatPower, formatCurrency, parseMultiSelect, setOptions } from './utils.js';

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
  missionRole: document.querySelector('#missionRole'),
  emcon: document.querySelector('#emcon'),
  domain: document.querySelector('#domain'),
  stackName: document.querySelector('#stackName')
};

let catalog;
let selection = {};

function ensureSelection() {
  const domain = selectors.domain.value;
  if (!selection.frame) selection = { ...selection, ...defaultSelections(catalog, domain) };
}

function populateStaticControls() {
  setOptions(selectors.missionRole, missionRoles.map((r) => ({ id: r, name: r })), (i) => i.name);
  setOptions(selectors.emcon, emconModes.map((r) => ({ id: r, name: r })), (i) => i.name);
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

  Object.entries(selectors).forEach(([key, el]) => {
    if (selection[key] && Array.from(el.options).some((o) => o.value === selection[key])) {
      el.value = selection[key];
    }
  });
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
    payloads: parseMultiSelect(selectors.payloads)
  };
}

function renderMetrics(stack, result) {
  const metrics = document.querySelector('#metrics');
  metrics.innerHTML = '';
  const rows = [
    ['All-up weight', formatWeight(result.totalWeight)],
    ['Payload mass', formatWeight(result.payloadMass)],
    ['Payload allowance', formatWeight((result.payloadCapacity || 0) - result.payloadMass)],
    ['Thrust-to-weight', result.thrustToWeight.toFixed(2)],
    ['Power budget', formatPower(result.powerBudget)],
    ['Est. endurance', `${result.enduranceMinutes.toFixed(1)} min`],
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
    ['Payloads', stack.payloads]
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
}

function evaluateAndRender() {
  readSelectionFromDom();
  const domain = selectors.domain.value;
  const stack = buildStack(catalog, selection, selectors.missionRole.value, selectors.emcon.value, domain);
  const result = evaluateStack(stack);
  renderMetrics(stack, result);
  renderStackCards(stack);
  renderLibrary(domain);
}

function wireEvents() {
  Object.values(selectors).forEach((el) => {
    el?.addEventListener('change', () => evaluateAndRender());
  });
  document.querySelector('#refreshBtn').addEventListener('click', evaluateAndRender);
  document.querySelector('#resetBtn').addEventListener('click', () => {
    const domain = selectors.domain.value;
    selection = defaultSelections(catalog, domain);
    renderSelectionOptions(domain);
    evaluateAndRender();
  });
}

async function main() {
  catalog = await loadCatalog();
  populateStaticControls();
  ensureSelection();
  const domain = selectors.domain.value;
  renderSelectionOptions(domain);
  bindPayloadFilter();
  wireEvents();
  evaluateAndRender();
}

main().catch((err) => {
  const warning = document.querySelector('#appWarning');
  warning.textContent = err.message;
});
