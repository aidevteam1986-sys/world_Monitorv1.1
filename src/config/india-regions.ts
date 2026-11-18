/** Indian states and union territories for the header region flyout. */
export interface IndiaStateRegion {
  id: string;
  name: string;
  lat: number;
  lon: number;
  zoom: number;
}

/** Country-level India camera used by `setView('india')`. */
export const INDIA_VIEW = {
  longitude: 79,
  latitude: 22,
  zoom: 4.2,
  globeAltitude: 1.05,
} as const;

export const INDIA_STATES: readonly IndiaStateRegion[] = [
  { id: 'in-ap', name: 'Andhra Pradesh', lat: 15.91, lon: 79.74, zoom: 6.2 },
  { id: 'in-ar', name: 'Arunachal Pradesh', lat: 28.22, lon: 94.73, zoom: 6.4 },
  { id: 'in-as', name: 'Assam', lat: 26.20, lon: 92.94, zoom: 6.5 },
  { id: 'in-br', name: 'Bihar', lat: 25.10, lon: 85.31, zoom: 6.5 },
  { id: 'in-ct', name: 'Chhattisgarh', lat: 21.28, lon: 81.87, zoom: 6.3 },
  { id: 'in-ga', name: 'Goa', lat: 15.30, lon: 74.12, zoom: 8.2 },
  { id: 'in-gj', name: 'Gujarat', lat: 22.26, lon: 71.19, zoom: 6.2 },
  { id: 'in-hr', name: 'Haryana', lat: 29.06, lon: 76.09, zoom: 7.0 },
  { id: 'in-hp', name: 'Himachal Pradesh', lat: 31.10, lon: 77.17, zoom: 6.8 },
  { id: 'in-jh', name: 'Jharkhand', lat: 23.61, lon: 85.28, zoom: 6.6 },
  { id: 'in-ka', name: 'Karnataka', lat: 15.32, lon: 75.71, zoom: 6.2 },
  { id: 'in-kl', name: 'Kerala', lat: 10.85, lon: 76.27, zoom: 6.8 },
  { id: 'in-mp', name: 'Madhya Pradesh', lat: 22.97, lon: 78.66, zoom: 5.9 },
  { id: 'in-mh', name: 'Maharashtra', lat: 19.75, lon: 75.71, zoom: 5.9 },
  { id: 'in-mn', name: 'Manipur', lat: 24.66, lon: 93.91, zoom: 7.4 },
  { id: 'in-ml', name: 'Meghalaya', lat: 25.47, lon: 91.37, zoom: 7.4 },
  { id: 'in-mz', name: 'Mizoram', lat: 23.16, lon: 92.94, zoom: 7.4 },
  { id: 'in-nl', name: 'Nagaland', lat: 26.16, lon: 94.56, zoom: 7.4 },
  { id: 'in-od', name: 'Odisha', lat: 20.95, lon: 85.10, zoom: 6.4 },
  { id: 'in-pb', name: 'Punjab', lat: 31.15, lon: 75.34, zoom: 7.0 },
  { id: 'in-rj', name: 'Rajasthan', lat: 27.02, lon: 74.22, zoom: 5.8 },
  { id: 'in-sk', name: 'Sikkim', lat: 27.53, lon: 88.51, zoom: 8.0 },
  { id: 'in-tn', name: 'Tamil Nadu', lat: 11.13, lon: 78.66, zoom: 6.3 },
  { id: 'in-tg', name: 'Telangana', lat: 18.11, lon: 79.02, zoom: 6.5 },
  { id: 'in-tr', name: 'Tripura', lat: 23.94, lon: 91.99, zoom: 7.6 },
  { id: 'in-up', name: 'Uttar Pradesh', lat: 26.85, lon: 80.95, zoom: 5.9 },
  { id: 'in-uk', name: 'Uttarakhand', lat: 30.07, lon: 79.02, zoom: 7.0 },
  { id: 'in-wb', name: 'West Bengal', lat: 22.99, lon: 87.86, zoom: 6.4 },
  { id: 'in-an', name: 'Andaman and Nicobar', lat: 11.74, lon: 92.66, zoom: 6.5 },
  { id: 'in-ch', name: 'Chandigarh', lat: 30.73, lon: 76.78, zoom: 10 },
  { id: 'in-dh', name: 'Dadra and Nagar Haveli and Daman and Diu', lat: 20.18, lon: 73.02, zoom: 8.5 },
  { id: 'in-dl', name: 'Delhi', lat: 28.61, lon: 77.21, zoom: 9.2 },
  { id: 'in-jk', name: 'Jammu and Kashmir', lat: 33.28, lon: 75.34, zoom: 6.5 },
  { id: 'in-la', name: 'Ladakh', lat: 34.15, lon: 77.58, zoom: 6.2 },
  { id: 'in-ld', name: 'Lakshadweep', lat: 10.57, lon: 72.64, zoom: 8.0 },
  { id: 'in-py', name: 'Puducherry', lat: 11.94, lon: 79.81, zoom: 9.0 },
] as const;

const INDIA_STATE_BY_ID = new Map(INDIA_STATES.map((state) => [state.id, state]));

export function getIndiaState(id: string): IndiaStateRegion | undefined {
  return INDIA_STATE_BY_ID.get(id);
}

export function isIndiaStateId(id: string): boolean {
  return INDIA_STATE_BY_ID.has(id);
}
