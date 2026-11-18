import type { TimeRange } from '@/components/MapContainer';
import { t } from '@/services/i18n';

const HEADER_TIME_RANGE_VALUES: ReadonlyArray<TimeRange> = [
  '1h',
  '6h',
  '24h',
  '48h',
  '7d',
  'all',
];

function labelForTimeRange(range: TimeRange): string {
  if (range !== 'all') return range;
  // Resolve at render time — module-scope t() runs before i18n is ready.
  const localized = t('components.deckgl.timeAll');
  return localized && localized !== 'components.deckgl.timeAll' ? localized : 'ALL';
}

export function syncHeaderTimeRange(range: TimeRange): void {
  const mount = document.getElementById('headerTimeRangeMount');
  if (!mount) return;
  mount.querySelectorAll<HTMLElement>('.time-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.range === range);
  });
}

/** Render the map time-range control into the header mount (right of Indicators). */
export function renderHeaderTimeRange(
  currentRange: TimeRange,
  onSelect: (range: TimeRange) => void,
): void {
  const mount = document.getElementById('headerTimeRangeMount');
  if (!mount) return;

  mount.replaceChildren();
  const slider = document.createElement('div');
  slider.className = 'header-time-range';
  slider.setAttribute('role', 'group');
  slider.setAttribute('aria-label', 'Time range');

  const options = document.createElement('div');
  options.className = 'time-options';

  for (const value of HEADER_TIME_RANGE_VALUES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `time-btn${value === currentRange ? ' active' : ''}`;
    btn.dataset.range = value;
    btn.textContent = labelForTimeRange(value);
    btn.addEventListener('click', () => {
      onSelect(value);
      syncHeaderTimeRange(value);
    });
    options.appendChild(btn);
  }

  slider.appendChild(options);
  mount.appendChild(slider);
}
