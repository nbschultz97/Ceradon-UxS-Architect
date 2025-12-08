export function formatWeight(grams) {
  if (!Number.isFinite(grams)) return '—';
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${grams.toFixed(0)} g`;
}

export function formatPower(watts) {
  if (!Number.isFinite(watts)) return '—';
  return `${watts.toFixed(1)} W`;
}

export function formatCurrency(val) {
  if (!Number.isFinite(val)) return '—';
  return `$${val.toFixed(0)}`;
}

export function sum(array, fn) {
  return array.reduce((acc, item) => acc + (fn ? fn(item) : item), 0);
}

export function calculateEnergyWh(battery) {
  if (!battery) return 0;
  return (battery.capacity_mah * battery.voltage_nominal) / 1000;
}

export const altitudeBands = [
  { id: 'sea_level', name: 'Sea level (0-500m)', thrustEfficiency: 1.0, powerPenalty: 0.0 },
  { id: 'high_desert', name: 'High desert (1.5-2.5km)', thrustEfficiency: 0.9, powerPenalty: 0.12 },
  { id: 'mountain', name: 'Mountain (2.5-3.5km)', thrustEfficiency: 0.82, powerPenalty: 0.22 }
];

export const temperatureBands = [
  { id: 'hot', name: 'Hot (30C)', capacityFactor: 0.97 },
  { id: 'standard', name: 'Standard (15C)', capacityFactor: 1.0 },
  { id: 'cold', name: 'Cold (0C)', capacityFactor: 0.9 },
  { id: 'freezing', name: 'Freezing (-10C)', capacityFactor: 0.8 }
];

export function resolveAltitude(id) {
  return altitudeBands.find((b) => b.id === id) || altitudeBands[0];
}

export function resolveTemperature(id) {
  return temperatureBands.find((b) => b.id === id) || temperatureBands[1];
}

export function parseMultiSelect(selectEl) {
  return Array.from(selectEl.selectedOptions).map((opt) => opt.value);
}

export function setOptions(select, items, labelFn = (i) => `${i.name}`) {
  select.innerHTML = '';
  items.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = labelFn(item);
    select.appendChild(option);
  });
}

export function readStoredState(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Falling back to default state', err);
    return fallback;
  }
}

export function persistState(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('Unable to persist state', err);
  }
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
