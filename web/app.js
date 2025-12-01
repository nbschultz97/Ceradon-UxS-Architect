async function loadCatalog() {
  const res = await fetch('catalog.json');
  if (!res.ok) throw new Error('Failed to load catalog');
  return res.json();
}

function optionize(select, items) {
  select.innerHTML = '';
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = `${item.name} (${item.id})`;
    select.appendChild(opt);
  }
}

function getSelection() {
  return {
    frame: document.querySelector('#frame').value,
    propulsion: document.querySelector('#propulsion').value,
    battery: document.querySelector('#battery').value,
    compute: document.querySelector('#compute').value,
    radio: document.querySelector('#radio').value,
    payloads: Array.from(document.querySelector('#payloads').selectedOptions).map(o => o.value),
  };
}

function computeDesign(catalog, selection) {
  const find = (cat, id) => catalog[cat].find(i => i.id === id);
  const frame = find('frames', selection.frame);
  const propulsion = find('propulsion', selection.propulsion);
  const battery = find('batteries', selection.battery);
  const compute = find('compute', selection.compute);
  const radio = find('radios', selection.radio);
  const payloads = selection.payloads.map(p => find('payloads', p));

  const payloadMass = payloads.reduce((sum, p) => sum + (p?.mass_kg || 0), 0);
  const mass = frame.empty_mass_kg + propulsion.mass_kg + battery.mass_kg + compute.mass_kg + radio.mass_kg + payloadMass;
  const thrustToWeight = (propulsion.thrust_kg || 0) / mass;

  const hoverPower = frame.type === 'ground' ? propulsion.hover_power_w * 0.35 : propulsion.hover_power_w;
  const payloadPower = payloads.reduce((sum, p) => sum + (p?.power_w || 0), 0);
  const avionicsPower = compute.power_w + radio.power_w;
  const powerBudget = hoverPower + payloadPower + avionicsPower;
  const enduranceMin = ((battery.capacity_wh * 0.92) / Math.max(powerBudget, 1)) * 60;

  const roleTags = new Set([...(frame.role_tags || []), ...(payloads.flatMap(p => p?.role_tags || []))]);

  const warnings = [];
  if (payloadMass > frame.max_payload_kg) warnings.push('Payload exceeds frame allowance');
  if (mass > frame.max_takeoff_kg) warnings.push('All-up weight exceeds MTOW');
  if (frame.type !== 'ground' && thrustToWeight < 1.3) warnings.push('Thrust-to-weight below 1.3: limited climb margin');
  if (powerBudget > battery.continuous_discharge_w) warnings.push('Power draw exceeds battery continuous rating');
  if (!propulsion.compatible_frames.includes(frame.id)) warnings.push('Propulsion not listed as compatible with frame');

  return {
    mass: mass.toFixed(2),
    payloadMargin: (frame.max_payload_kg - payloadMass).toFixed(2),
    thrustToWeight: thrustToWeight.toFixed(2),
    endurance: enduranceMin.toFixed(1),
    powerBudget: powerBudget.toFixed(1),
    roles: Array.from(roleTags),
    warnings,
  };
}

function renderMetrics(result) {
  const metrics = document.querySelector('#metrics');
  metrics.innerHTML = '';
  const make = (label, value) => {
    const el = document.createElement('div');
    el.className = 'metric';
    el.innerHTML = `<div class="label">${label}</div><div class="value">${value}</div>`;
    metrics.appendChild(el);
  };
  make('All-up weight', `${result.mass} kg`);
  make('Payload margin', `${result.payloadMargin} kg`);
  make('Thrust-to-weight', result.thrustToWeight);
  make('Power budget', `${result.powerBudget} W`);
  make('Est. endurance', `${result.endurance} min`);
}

function renderRoles(result) {
  const container = document.querySelector('#roles');
  container.innerHTML = '';
  result.roles.forEach(role => {
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = role;
    container.appendChild(tag);
  });
}

function renderWarnings(result) {
  const container = document.querySelector('#warnings');
  container.innerHTML = '';
  result.warnings.forEach(w => {
    const warn = document.createElement('div');
    warn.className = 'warning';
    warn.textContent = w;
    container.appendChild(warn);
  });
}

function renderRoleList(catalog, role) {
  const list = document.querySelector('#roleList');
  list.innerHTML = '';
  const payloads = catalog.payloads.filter(p => p.role_tags?.includes(role));
  payloads.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>${p.name}</strong><div class="small">${p.mass_kg} kg · ${p.power_w} W</div><div class="small">${p.role_tags.join(', ')}</div>`;
    list.appendChild(li);
  });
}

function populateRoleFilter(catalog) {
  const roles = new Set();
  catalog.payloads.forEach(p => (p.role_tags || []).forEach(r => roles.add(r)));
  const select = document.querySelector('#roleFilter');
  select.innerHTML = '';
  roles.forEach(role => {
    const opt = document.createElement('option');
    opt.value = role;
    opt.textContent = role;
    select.appendChild(opt);
  });
  const firstRole = select.options[0]?.value;
  if (firstRole) select.value = firstRole;
  select.addEventListener('change', () => renderRoleList(catalog, select.value));
  if (select.value) renderRoleList(catalog, select.value);
}

async function main() {
  const catalog = await loadCatalog();
  optionize(document.querySelector('#frame'), catalog.frames);
  optionize(document.querySelector('#propulsion'), catalog.propulsion);
  optionize(document.querySelector('#battery'), catalog.batteries);
  optionize(document.querySelector('#compute'), catalog.compute);
  optionize(document.querySelector('#radio'), catalog.radios);
  optionize(document.querySelector('#payloads'), catalog.payloads);
  populateRoleFilter(catalog);

  const evaluate = () => {
    const selection = getSelection();
    const result = computeDesign(catalog, selection);
    renderMetrics(result);
    renderRoles(result);
    renderWarnings(result);
  };

  document.querySelector('#evaluate').addEventListener('click', evaluate);
  evaluate();
}

main().catch(err => {
  console.error(err);
  document.querySelector('#controls').innerHTML = `<div class="warning">${err.message}</div>`;
});
