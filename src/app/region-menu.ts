import type { MapView } from '@/components/MapContainer';
import { getIndiaState, isIndiaStateId } from '@/config/india-regions';
import { t } from '@/services/i18n';

export type RegionMenuSelection = {
  id: string;
  label: string;
};

const TOP_LEVEL_VIEWS = new Set<string>(['global', 'india']);

function labelForRegionId(id: string): string {
  if (id === 'global') return t('components.deckgl.views.global');
  if (id === 'india') return t('components.deckgl.views.india');
  const state = getIndiaState(id);
  if (state) return state.name;
  return t('components.deckgl.views.global');
}

/** Apply a header/mobile region choice to the live map. */
export function applyRegionMenuChoice(
  map: { setView: (view: MapView, zoom?: number) => unknown; setCenter: (lat: number, lon: number, zoom?: number) => unknown } | null | undefined,
  regionId: string,
): RegionMenuSelection | null {
  if (!map || !regionId) return null;

  if (isIndiaStateId(regionId)) {
    const state = getIndiaState(regionId)!;
    map.setView('india');
    map.setCenter(state.lat, state.lon, state.zoom);
    return { id: regionId, label: state.name };
  }

  if (TOP_LEVEL_VIEWS.has(regionId) || regionId === 'america' || regionId === 'mena'
    || regionId === 'eu' || regionId === 'asia' || regionId === 'latam'
    || regionId === 'africa' || regionId === 'oceania') {
    map.setView(regionId as MapView);
    return { id: regionId, label: labelForRegionId(regionId) };
  }

  return null;
}

/** Keep the custom region trigger label/selection in sync with map or menu choice. */
export function syncRegionMenuSelection(selection: RegionMenuSelection): void {
  const trigger = document.getElementById('regionMenuTrigger');
  const label = document.getElementById('regionMenuLabel');
  if (trigger) trigger.dataset.selected = selection.id;
  if (label) label.textContent = selection.label;

  document.querySelectorAll<HTMLElement>('[data-region]').forEach((el) => {
    const active = el.dataset.region === selection.id
      || (selection.id.startsWith('in-') && el.dataset.region === 'india' && el.classList.contains('region-menu-parent'));
    el.classList.toggle('active', active);
    const check = el.querySelector('.region-sheet-check');
    if (check) check.textContent = el.dataset.region === selection.id ? '✓' : '';
  });
}

/** Map a live MapView value back onto the curated Global/India menu. */
export function selectionFromMapView(view: string | undefined): RegionMenuSelection {
  if (view === 'india') {
    return { id: 'india', label: labelForRegionId('india') };
  }
  if (view === 'global' || !view) {
    return { id: 'global', label: labelForRegionId('global') };
  }
  // Legacy views (america, asia, …) stay on the map but the curated menu
  // collapses them to Global so the trigger never shows removed options.
  return { id: 'global', label: labelForRegionId('global') };
}
