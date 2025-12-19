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

const FALLBACK_CATALOG = {
  frames: [
    {
      id: 'fallback_frame_quad',
      name: 'Fallback quad frame',
      domain: 'air',
      category: 'frame',
      subtype: 'multirotor',
      weight_grams: 820,
      cost_usd: 150,
      notes: 'Embedded fallback frame; edit /web/data to restore full catalog.',
      max_auw_grams: 3200,
      recommended_battery_s_cells: [4, 6],
      max_prop_size_in: 7,
      mount_pattern: '30x30',
      typical_role_tags: ['recon', 'relay'],
      form_factor: 'quad'
    }
  ],
  motorsEsc: [
    {
      id: 'fallback_motor',
      name: 'Fallback propulsion pack',
      category: 'motor_esc',
      subtype: 'multirotor',
      domain: 'air',
      weight_grams: 360,
      cost_usd: 120,
      notes: 'Fallback propulsion for offline safety.',
      motor_count: 4,
      motor_kv: 1400,
      max_thrust_per_motor_g: 1000,
      max_current_per_motor_a: 22,
      voltage_range_s_cells: [4, 6],
      mount_pattern: '16x16',
      compatible_frame_form_factors: ['quad', 'hex'],
      thrust_class: '5in'
    }
  ],
  flightControllers: [
    {
      id: 'fallback_fc',
      name: 'Fallback FC',
      category: 'flight_controller',
      subtype: 'multirotor',
      domain: 'air',
      weight_grams: 18,
      cost_usd: 65,
      notes: 'Minimal autopilot entry used when catalog is unavailable.',
      supported_s_cells: [3, 4, 6],
      on_board_bec_current_a: 3,
      uart_count: 5,
      i2c_bus_count: 2,
      mount_pattern: '30x30',
      supported_firmware: ['betaflight', 'ardupilot'],
      max_motor_outputs: 8
    }
  ],
  vtx: [
    {
      id: 'fallback_vtx',
      name: 'Fallback VTX',
      category: 'vtx',
      subtype: 'digital',
      domain: 'air',
      weight_grams: 28,
      cost_usd: 110,
      notes: 'Baseline digital video link placeholder.',
      vtx_type: 'digital',
      rf_band_ghz: 5.8,
      power_levels_mw: [25, 200],
      channels_count: 8,
      voltage_input_min_v: 7,
      voltage_input_max_v: 25,
      connector_type: 'u_fl'
    }
  ],
  rcReceivers: [
    {
      id: 'fallback_rc',
      name: 'Fallback RC',
      category: 'rc_receiver',
      subtype: 'elrs',
      domain: 'air',
      weight_grams: 7,
      cost_usd: 30,
      notes: 'Basic ELRS link to keep UI selectable.',
      protocol: 'elrs',
      rf_band_ghz: 2.4,
      voltage_input_min_v: 5,
      voltage_input_max_v: 8.4,
      antenna_ports: 2
    }
  ],
  antennas: [
    {
      id: 'fallback_rc_antenna',
      name: 'Fallback RC antenna',
      category: 'antenna',
      subtype: 'omni',
      domain: 'any',
      weight_grams: 5,
      cost_usd: 8,
      notes: 'Generic 2.4 GHz monopole.',
      antenna_type: 'omni',
      rf_band_ghz: 2.4,
      gain_dbi: 2,
      connector_type: 'u_fl',
      application: 'rc'
    },
    {
      id: 'fallback_vtx_antenna',
      name: 'Fallback VTX antenna',
      category: 'antenna',
      subtype: 'omni',
      domain: 'any',
      weight_grams: 6,
      cost_usd: 12,
      notes: '5.8 GHz whip.',
      antenna_type: 'omni',
      rf_band_ghz: 5.8,
      gain_dbi: 1.5,
      connector_type: 'u_fl',
      application: 'vtx'
    },
    {
      id: 'fallback_aux_antenna',
      name: 'Fallback aux antenna',
      category: 'antenna',
      subtype: 'omni',
      domain: 'any',
      weight_grams: 7,
      cost_usd: 10,
      notes: 'Generic aux radio whip.',
      antenna_type: 'omni',
      rf_band_ghz: 2.4,
      gain_dbi: 2,
      connector_type: 'sma',
      application: 'aux_radio'
    }
  ],
  cameras: [
    {
      id: 'fallback_cam',
      name: 'Fallback HD cam',
      category: 'camera',
      subtype: 'fpv_hd',
      domain: 'air',
      weight_grams: 32,
      cost_usd: 90,
      notes: 'Default camera placeholder when catalog fails.',
      camera_type: 'fpv_hd',
      resolution_class: 'hd',
      voltage_input_min_v: 5,
      voltage_input_max_v: 16,
      required_interface: 'digital_link'
    }
  ],
  batteries: [
    {
      id: 'fallback_battery',
      name: 'Fallback 4S 5200',
      category: 'battery',
      subtype: 'lipo',
      domain: 'any',
      weight_grams: 520,
      cost_usd: 75,
      notes: 'Keeps selectors alive when catalog JSON is unavailable.',
      s_cells: 4,
      capacity_mah: 5200,
      c_rating: 60,
      voltage_nominal: 14.8
    }
  ],
  compute: [
    {
      id: 'fallback_compute',
      name: 'Fallback compute',
      category: 'compute',
      subtype: 'pi4',
      domain: 'any',
      weight_grams: 48,
      cost_usd: 85,
      notes: 'Baseline SBC entry to keep exports consistent.',
      compute_class: 'pi4',
      power_draw_idle_w: 3.5,
      power_draw_typical_w: 7,
      power_draw_max_w: 12,
      ports: { usb: 4, m2: 0, gpio: 40, camera: 1 }
    }
  ],
  auxRadios: [
    {
      id: 'fallback_aux',
      name: 'Fallback telemetry',
      category: 'aux_radio',
      subtype: 'telemetry',
      domain: 'any',
      weight_grams: 42,
      cost_usd: 150,
      notes: 'Fallback IP mesh/telemetry radio.',
      radio_class: 'telemetry',
      rf_band_ghz: 2.4,
      max_eirp_dbm: 27,
      range_class: 'medium',
      duty_cycle_profile: 'burst',
      voltage_input_min_v: 6,
      voltage_input_max_v: 18
    }
  ],
  payloads: [
    {
      id: 'fallback_payload',
      name: 'Fallback EO payload',
      category: 'payload',
      subtype: 'camera',
      domain: 'air',
      weight_grams: 320,
      cost_usd: 400,
      notes: 'Minimal EO payload placeholder.',
      payload_class: 'camera_payload',
      power_draw_typical_w: 8,
      role_tags: ['recon'],
      mount_pattern: 'universal',
      max_payload_mass_grams: null
    }
  ]
};

async function fetchJson(path) {
  const url = new URL(path, window.location.href);
  const res = await fetch(url.toString(), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

export async function loadCatalog() {
  try {
    const entries = await Promise.all(
      Object.entries(dataFiles).map(async ([key, path]) => {
        const json = await fetchJson(path);
        return [key, json];
      })
    );
    return { catalog: Object.fromEntries(entries), fallbackUsed: false };
  } catch (err) {
    console.error('Catalog failed, using fallback', err);
    return { catalog: FALLBACK_CATALOG, fallbackUsed: true, error: err };
  }
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
