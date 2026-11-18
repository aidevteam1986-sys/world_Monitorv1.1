import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  autoTagDocument,
  getNexusIngestBaseUrl,
  uploadRawFileWithProgress,
} from '../src/services/nexus-ingest.ts';

describe('nexus upload progress helpers', () => {
  const originalFetch = globalThis.fetch;
  const OriginalXHR = globalThis.XMLHttpRequest;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = OriginalXHR;
  });

  it('autoTagDocument posts to the validation endpoint', async () => {
    const calls = [];
    globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), method: init?.method });
      return new Response(
        JSON.stringify({
          validation_result: {
            document_id: 'doc-9',
            domains: ['political'],
            categories: ['Governance'],
            subjects: ['Elections'],
          },
          processing_result: { status: 'ok' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const result = await autoTagDocument('doc-9');
    assert.equal(result.document_id, 'doc-9');
    assert.deepEqual(result.domains, ['political']);
    assert.equal(result.processingStatus, 'ok');
    assert.equal(calls[0].method, 'POST');
    assert.match(calls[0].url, /\/api\/v1\/ingestion\/validation\/auto-tag\/document\/doc-9$/);
  });

  it('uploadRawFileWithProgress reports XHR percent and returns document_id', async () => {
    const percents = [];

    class FakeXHR {
      constructor() {
        this.upload = { onprogress: null };
        this.status = 200;
        this.responseText = '';
        this.onload = null;
        this.onerror = null;
        this.onabort = null;
      }

      open(method, url) {
        this.method = method;
        this.url = url;
      }

      send() {
        assert.equal(this.method, 'POST');
        assert.match(this.url, new RegExp(`${getNexusIngestBaseUrl().replace(/\./g, '\\.')}/api/v1/ingestion/upload/raw`));
        this.upload.onprogress?.({ lengthComputable: true, loaded: 40, total: 100 });
        this.upload.onprogress?.({ lengthComputable: true, loaded: 100, total: 100 });
        this.status = 200;
        this.responseText = JSON.stringify({
          status: 'ok',
          data: { document_id: 'raw-1', filename: 'brief.pdf', status: 'pending' },
        });
        this.onload?.();
      }
    }

    globalThis.XMLHttpRequest = FakeXHR;

    const file = new File(['hello'], 'brief.pdf', { type: 'application/pdf' });
    const result = await uploadRawFileWithProgress(file, { source: 'test' }, (pct) => percents.push(pct));
    assert.equal(result.document_id, 'raw-1');
    assert.deepEqual(percents, [40, 100, 100]);
  });
});
