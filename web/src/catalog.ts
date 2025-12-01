const dataFiles = {
  frames: 'data/frames.json',
  motorsEsc: 'data/motors_esc.json',
  flightControllers: 'data/flight_controllers.json',
  vtx: 'data/vtx.json',
  rcReceivers: 'data/rc_receivers.json',
  antennas: 'data/antennas.json',
  cameras: 'data/cameras.json',
  batteries: 'data/batteries.json',
  compute: 'data/compute.json',
  auxRadios: 'data/aux_radios.json',
  payloads: 'data/payloads.json'
};

export async function loadCatalog() {
  const entries = await Promise.all(
    Object.entries(dataFiles).map(async ([key, path]) => {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`Failed to load ${path}`);
      const json = await res.json();
      return [key, json];
    })
  );
  return Object.fromEntries(entries);
}

export function filterByDomain(items, domain) {
  if (!domain) return items;
  return items.filter((item) => item.domain === domain || item.domain === 'any' || item.domain === 'multi');
}

export function filterByRoleTags(items, role) {
  if (!role) return items;
  return items.filter((item) => Array.isArray(item.role_tags) && item.role_tags.includes(role));
}

export function findById(items, id) {
  return items.find((item) => item.id === id) || null;
}

export function defaultSelections(catalog, domain) {
  const pickFirst = (arr) => filterByDomain(arr, domain)[0]?.id || arr[0]?.id;
  return {
    frame: pickFirst(catalog.frames),
    motorEsc: pickFirst(catalog.motorsEsc),
    flightController: pickFirst(catalog.flightControllers),
    vtx: pickFirst(catalog.vtx),
    rcReceiver: pickFirst(catalog.rcReceivers),
    rcAntenna: pickFirst(catalog.antennas.filter((a) => a.application === 'rc')),
    vtxAntenna: pickFirst(catalog.antennas.filter((a) => a.application === 'vtx')),
    auxRadio: pickFirst(catalog.auxRadios),
    auxRadioAntenna: pickFirst(catalog.antennas.filter((a) => a.application === 'aux_radio')),
    camera: pickFirst(catalog.cameras),
    battery: pickFirst(catalog.batteries),
    compute: pickFirst(catalog.compute),
    payloads: []
  };
}
