export interface Frame {
  id: string;
  name: string;
  category: "frame";
  subtype: string;
  domain: "air" | "ground" | "maritime" | "multi" | "any";
  weight_grams: number;
  cost_usd: number;
  notes: string;
  max_auw_grams: number;
  recommended_battery_s_cells: number[];
  max_prop_size_in: number | null;
  mount_pattern: string | null;
  typical_role_tags: string[];
  form_factor: "quad" | "hex" | "fixed_wing" | "plane" | "ugv_wheeled" | "ugv_tracked" | "usv" | "other";
}

export interface MotorEsc {
  id: string;
  name: string;
  category: "motor_esc";
  subtype: string;
  domain: "air" | "ground" | "maritime" | "multi" | "any";
  weight_grams: number;
  cost_usd: number;
  notes: string;
  motor_count: number;
  motor_kv: number;
  max_thrust_per_motor_g: number;
  max_current_per_motor_a: number;
  voltage_range_s_cells: number[];
  mount_pattern: string | null;
  compatible_frame_form_factors: string[];
  thrust_class: "micro" | "5in" | "7in" | "heavy_lift";
}

export interface FlightController {
  id: string;
  name: string;
  category: "flight_controller";
  subtype: string;
  domain: "air" | "ground" | "maritime" | "multi" | "any";
  weight_grams: number;
  cost_usd: number;
  notes: string;
  supported_s_cells: number[];
  on_board_bec_current_a: number;
  uart_count: number;
  i2c_bus_count: number;
  mount_pattern: string;
  supported_firmware: string[];
  max_motor_outputs: number;
}

export interface Vtx {
  id: string;
  name: string;
  category: "vtx";
  subtype: string;
  domain: "air" | "ground" | "maritime" | "multi" | "any";
  weight_grams: number;
  cost_usd: number;
  notes: string;
  vtx_type: "analog" | "digital";
  rf_band_ghz: number;
  power_levels_mw: number[];
  channels_count: number;
  voltage_input_min_v: number;
  voltage_input_max_v: number;
  connector_type: "u_fl" | "mmcx" | "sma" | "rp_sma" | "integrated";
}

export interface RcReceiver {
  id: string;
  name: string;
  category: "rc_receiver";
  subtype: string;
  domain: "air" | "ground" | "maritime" | "multi" | "any";
  weight_grams: number;
  cost_usd: number;
  notes: string;
  protocol: "elrs" | "crsf" | "frsky" | "spektrum" | "generic";
  rf_band_ghz: number;
  voltage_input_min_v: number;
  voltage_input_max_v: number;
  antenna_ports: number;
}

export interface Antenna {
  id: string;
  name: string;
  category: "antenna";
  subtype: string;
  domain: "air" | "ground" | "maritime" | "multi" | "any";
  weight_grams: number;
  cost_usd: number;
  notes: string;
  antenna_type: "omni" | "patch" | "helical" | "dipole";
  rf_band_ghz: number;
  gain_dbi: number;
  connector_type: "u_fl" | "mmcx" | "sma" | "rp_sma" | "other";
  application: "rc" | "vtx" | "aux_radio" | "general";
}

export interface Camera {
  id: string;
  name: string;
  category: "camera";
  subtype: string;
  domain: "air" | "ground" | "maritime" | "multi" | "any";
  weight_grams: number;
  cost_usd: number;
  notes: string;
  camera_type: "fpv_analog" | "fpv_hd" | "hd_record" | "eo" | "eo_ir_approx";
  resolution_class: "sd" | "hd" | "4k";
  voltage_input_min_v: number;
  voltage_input_max_v: number;
  required_interface: "fpv_analog" | "digital_link" | "hdmi" | "usb" | "mipi";
}

export interface Battery {
  id: string;
  name: string;
  category: "battery";
  subtype: string;
  domain: "air" | "ground" | "maritime" | "multi" | "any";
  weight_grams: number;
  cost_usd: number;
  notes: string;
  s_cells: number;
  capacity_mah: number;
  c_rating: number;
  voltage_nominal: number;
}

export interface ComputeUnit {
  id: string;
  name: string;
  category: "compute";
  subtype: string;
  domain: "air" | "ground" | "maritime" | "multi" | "any";
  weight_grams: number;
  cost_usd: number;
  notes: string;
  compute_class: "pi3" | "pi4" | "pi5" | "jetson_nano" | "jetson_orin_nano" | "nuc" | "microcontroller" | "other";
  power_draw_idle_w: number;
  power_draw_typical_w: number;
  power_draw_max_w: number;
  ports: { usb: number; m2: number; gpio: number; camera: number };
}

export interface AuxRadio {
  id: string;
  name: string;
  category: "aux_radio";
  subtype: string;
  domain: "air" | "ground" | "maritime" | "multi" | "any";
  weight_grams: number;
  cost_usd: number;
  notes: string;
  radio_class: "ip_mesh" | "telemetry" | "data_link" | "c2_relay";
  rf_band_ghz: number;
  max_eirp_dbm: number;
  range_class: "short" | "medium" | "long";
  duty_cycle_profile: "continuous" | "burst" | "low_duty" | "receive_only";
  voltage_input_min_v: number;
  voltage_input_max_v: number;
}

export interface Payload {
  id: string;
  name: string;
  category: "payload";
  subtype: string;
  domain: "air" | "ground" | "maritime" | "multi" | "any";
  weight_grams: number;
  cost_usd: number;
  notes: string;
  payload_class: "camera_payload" | "strike_module" | "resupply_pod" | "sensor_pod" | "generic_node";
  power_draw_typical_w: number;
  role_tags: string[];
  mount_pattern: string | null;
  max_payload_mass_grams: number | null;
}

export interface UxSStack {
  name: string;
  domain: "air" | "ground" | "maritime";
  frame: Frame;
  motorEsc: MotorEsc | null;
  flightController: FlightController | null;
  vtx: Vtx | null;
  rcReceiver: RcReceiver | null;
  rcAntenna: Antenna | null;
  vtxAntenna: Antenna | null;
  auxRadio: AuxRadio | null;
  auxRadioAntenna: Antenna | null;
  camera: Camera | null;
  battery: Battery;
  compute: ComputeUnit | null;
  payloads: Payload[];
  missionRole:
    | "trainer"
    | "recon"
    | "long_range"
    | "strike_capable"
    | "resupply"
    | "sensor_node"
    | "c_uas"
    | "decoy"
    | "multi";
  emconPosture: "covert" | "normal" | "decoy";
}

export interface Catalog {
  frames: Frame[];
  motorsEsc: MotorEsc[];
  flightControllers: FlightController[];
  vtx: Vtx[];
  rcReceivers: RcReceiver[];
  antennas: Antenna[];
  cameras: Camera[];
  batteries: Battery[];
  compute: ComputeUnit[];
  auxRadios: AuxRadio[];
  payloads: Payload[];
}
