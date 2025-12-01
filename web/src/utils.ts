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
