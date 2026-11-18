import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * Regression: DomainFeedPanel used debounced setSafeContent for the loading
 * shell, then raced a fast listPanelDocuments response. paintCards set the
 * count badge but missed [data-domain-feed-root], leaving "Loading…" until
 * the next ingest event.
 */
describe('DomainFeedPanel load paint', () => {
  it('commits the feed shell and list paint immediately (no debounce race)', async () => {
    const path = fileURLToPath(new URL('../src/components/DomainFeedPanel.ts', import.meta.url));
    const src = await readFile(path, 'utf8');

    assert.match(
      src,
      /setSafeContentImmediate\(\s*safeHtml`<div class="domain-feed-list" data-domain-feed-root>/,
      'constructor must mount the loading shell with setSafeContentImmediate',
    );
    assert.match(
      src,
      /private paintFeed\(body: SafeHtml\): void \{\s*this\.setSafeContentImmediate\(/,
      'list/error paints must use setSafeContentImmediate so they cancel any pending debounce',
    );
    assert.doesNotMatch(
      src,
      /this\.setSafeContent\(/,
      'DomainFeedPanel must not use debounced setSafeContent (refresh stuck-loading race)',
    );
  });
});
