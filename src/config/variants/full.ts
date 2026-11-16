// Full geopolitical variant - worldmonitor.app
import type { PanelConfig, MapLayers } from '@/types';
import type { VariantConfig } from './base';

// Re-export base config
export * from './base';

// Geopolitical-specific exports
export * from '../feeds';
export * from '../geo';
export * from '../irradiators';
export * from '../pipelines';
export * from '../ports';
export * from '../military';
// airports intentionally not re-exported here — keeps the airports table off the
// eager variant/@/config barrel; AviationCommandBar imports it directly. (#4404)
export * from '../entities';

// Panel configuration for geopolitical analysis (mirrors curated FULL_PANELS).
export const DEFAULT_PANELS: Record<string, PanelConfig> = {
  map: { name: 'Global Map', enabled: true, priority: 1 },
  'threat-timeline': { name: 'Probable Scenarios', enabled: true, priority: 1 },
  'strategic-risk': { name: 'Strategic Risk Overview', enabled: true, priority: 1 },
  'military-correlation': { name: 'Force Posture', enabled: true, priority: 1 },
  'domain-political': { name: 'Political', enabled: true, priority: 1 },
  'domain-diplomatic': { name: 'Diplomatic', enabled: true, priority: 1 },
  'domain-international': { name: 'International', enabled: true, priority: 1 },
  'domain-cyber': { name: 'Cyber', enabled: true, priority: 1 },
  'domain-economy': { name: 'Economy', enabled: true, priority: 1 },
  'domain-tech': { name: 'Technological', enabled: true, priority: 1 },
  'domain-health': { name: 'Health & Env', enabled: true, priority: 1 },
};

// Map layers for geopolitical view
export const DEFAULT_MAP_LAYERS: MapLayers = {
  aircraftEmergencies: false,
  gpsJamming: false,
  satellites: false,


  conflicts: true,
  bases: true,
  cables: false,
  pipelines: false,
  hotspots: true,
  ais: false,
  nuclear: true,
  irradiators: false,
  sanctions: true,
  weather: true,
  // Opt-in: all five road feeds are on-demand bootstrap keys. Default-on made
  // every visitor fetch them, which is exactly what the on-demand tier is meant
  // to prevent. Narrowest surface on the map, so it follows military/flights/fires
  // rather than the global layers above it (#6763).
  canadaRoads: false,
  // Stays on: it rides the fast tier already hydrated, so enabling it costs no
  // extra request, and it carries provincial emergency alerts.
  canadaAlerts: true,
  economic: false,
  waterways: true,
  outages: true,
  cyberThreats: false,
  datacenters: false,
  protests: false,
  flights: false,
  military: false,
  natural: false,
  spaceports: false,
  minerals: false,
  fires: false,
  ucdpEvents: false,
  displacement: false,
  climate: false,
  // Tech layers (disabled in full variant)
  startupHubs: false,
  cloudRegions: false,
  accelerators: false,
  techHQs: false,
  techEvents: false,
  // Finance layers (disabled in full variant)
  stockExchanges: false,
  financialCenters: false,
  centralBanks: false,
  commodityHubs: false,
  gulfInvestments: false,
  // Happy variant layers
  positiveEvents: false,
  kindness: false,
  happiness: false,
  speciesRecovery: false,
  renewableInstallations: false,
  tradeRoutes: false,
  iranAttacks: true,
  ciiChoropleth: false,
  resilienceScore: false,
  no2Activity: false,
  dayNight: false,
  // Commodity variant layers (disabled in full variant)
  miningSites: false,
  processingPlants: false,
  commodityPorts: false,
  webcams: false,
  diseaseOutbreaks: false,
};

// Mobile-specific defaults for geopolitical
export const MOBILE_DEFAULT_MAP_LAYERS: MapLayers = {
  gpsJamming: false,
  satellites: false,


  conflicts: true,
  bases: false,
  cables: false,
  pipelines: false,
  hotspots: true,
  ais: false,
  nuclear: false,
  irradiators: false,
  sanctions: true,
  weather: true,
  canadaRoads: false,
  canadaAlerts: false,
  economic: false,
  waterways: false,
  outages: true,
  cyberThreats: false,
  datacenters: false,
  protests: false,
  flights: false,
  military: false,
  natural: true,
  spaceports: false,
  minerals: false,
  fires: false,
  ucdpEvents: false,
  displacement: false,
  climate: false,
  // Tech layers (disabled in full variant)
  startupHubs: false,
  cloudRegions: false,
  accelerators: false,
  techHQs: false,
  techEvents: false,
  // Finance layers (disabled in full variant)
  stockExchanges: false,
  financialCenters: false,
  centralBanks: false,
  commodityHubs: false,
  gulfInvestments: false,
  // Happy variant layers
  positiveEvents: false,
  kindness: false,
  happiness: false,
  speciesRecovery: false,
  renewableInstallations: false,
  tradeRoutes: false,
  iranAttacks: true,
  ciiChoropleth: false,
  resilienceScore: false,
  no2Activity: false,
  dayNight: false,
  // Commodity variant layers (disabled in full variant)
  miningSites: false,
  processingPlants: false,
  commodityPorts: false,
  webcams: false,
  diseaseOutbreaks: false,
};

export const VARIANT_CONFIG: VariantConfig = {
  name: 'full',
  description: 'Full geopolitical intelligence dashboard',
  panels: DEFAULT_PANELS,
  mapLayers: DEFAULT_MAP_LAYERS,
  mobileMapLayers: MOBILE_DEFAULT_MAP_LAYERS,
};
