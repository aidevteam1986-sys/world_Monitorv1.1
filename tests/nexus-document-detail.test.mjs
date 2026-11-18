import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { OverlayHistoryManager } from '../src/utils/overlay-history.ts';
import { fetchPanelDocument } from '../src/services/nexus-ingest.ts';

describe('nexus document detail fetch', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('requests the validated Elasticsearch document by id', async () => {
    const calls = [];
    globalThis.fetch = async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          status: 'ok',
          data: {
            document_id: 'doc-123',
            title: 'India Extends Agnipath',
            filename: 'agnipath.pdf',
            domains: ['political'],
            categories: ['Governance'],
            subjects: ['Legislation'],
            source: 'dashboard-upload',
            geo_tag: 'IN',
            full_text: 'Extracted body',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const doc = await fetchPanelDocument('doc-123');
    assert.equal(doc.document_id, 'doc-123');
    assert.equal(doc.full_text, 'Extracted body');
    assert.match(calls[0], /\/api\/v1\/panels\/documents\/doc-123$/);
  });

  it('rejects empty document ids before calling the network', async () => {
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return new Response('{}', { status: 200 });
    };
    await assert.rejects(() => fetchPanelDocument('  '), /document_id required/);
    assert.equal(called, false);
  });
});

describe('nexus-document overlay id', () => {
  it('registers on the shared overlay history stack', () => {
    const entries = [null];
    let index = 0;
    const listeners = new Set();
    const environment = {
      get state() {
        return entries[index];
      },
      pushState(state) {
        entries.splice(index + 1, entries.length, structuredClone(state));
        index += 1;
      },
      replaceState(state) {
        entries[index] = structuredClone(state);
      },
      back() {
        if (index === 0) return;
        index -= 1;
        const event = { state: entries[index] };
        listeners.forEach((listener) => listener(event));
      },
      addPopStateListener(listener) {
        listeners.add(listener);
      },
      removePopStateListener(listener) {
        listeners.delete(listener);
      },
    };

    const manager = new OverlayHistoryManager(environment);
    const closed = [];
    manager.open('nexus-document', () => closed.push('nexus-document'));
    assert.equal(manager.top(), 'nexus-document');
    environment.back();
    assert.deepEqual(closed, ['nexus-document']);
    manager.destroy();
  });
});
