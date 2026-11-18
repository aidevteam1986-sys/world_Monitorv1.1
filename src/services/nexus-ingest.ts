/**
 * Client for the local nexus_ingest FastAPI pipeline (upload → ES → panels).
 * Base URL is env-driven so another PC / model stack only needs Vite env changes.
 */

export type NexusDomainKind =
  | 'political'
  | 'diplomatic'
  | 'international'
  | 'cyber'
  | 'economy'
  | 'tech'
  | 'health';

export interface NexusPanelDocument {
  document_id: string;
  title: string;
  filename: string;
  domains: string[];
  categories: string[];
  subjects: string[];
  source: string;
  geo_tag: string;
  confidence?: number | string | null;
  validated_at?: string | null;
  linked_threats?: unknown[];
  related_documents?: Array<{
    document_id?: string;
    title?: string;
    relation?: string;
    shared_threats?: string[];
    confidence?: string;
  }>;
  summary?: string;
  gist?: string;
  full_text?: string;
}

export interface NexusIngestResult {
  document_id: string;
  filename?: string;
  domains: string[];
  categories: string[];
  subjects: string[];
}

export interface NexusTaxonomySubject {
  name: string;
}

export interface NexusTaxonomyCategory {
  name: string;
  subjects?: NexusTaxonomySubject[];
}

export interface NexusTaxonomyDomain {
  domain: string;
  categories?: NexusTaxonomyCategory[];
}

const DEFAULT_BASE = 'http://127.0.0.1:8088';

export function getNexusIngestBaseUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const fromEnv = env?.VITE_NEXUS_INGEST_URL?.trim();
  return (fromEnv || DEFAULT_BASE).replace(/\/$/, '');
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json() as { detail?: unknown };
    if (typeof body.detail === 'string') return body.detail;
    return JSON.stringify(body.detail ?? body);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

export type NexusUploadOpts = {
  documentType?: 'digital' | 'scanned';
  source?: string;
  geoTag?: string;
};

export type NexusRawUploadResult = {
  document_id: string;
  filename?: string;
  status?: string;
};

export type NexusAutoTagResult = {
  document_id: string;
  domains: string[];
  categories: string[];
  subjects: string[];
  processingStatus?: string;
};

export type NexusIngestionWsMessage =
  | { type: 'document_update'; document_id: string; status: 'validated' | 'processed' }
  | {
      type: 'vectorization_progress';
      document_id: string;
      current_chunk: number;
      total_chunks: number;
      progress_percent: number;
    };

function appendUploadFields(form: FormData, file: File, opts: NexusUploadOpts): void {
  form.append('file', file);
  form.append('document_type', opts.documentType ?? 'digital');
  if (opts.source) form.append('source', opts.source);
  if (opts.geoTag) form.append('geo_tag', opts.geoTag);
}

/** Step 1: multipart upload to raw index with XHR progress events. */
export function uploadRawFileWithProgress(
  file: File,
  opts: NexusUploadOpts = {},
  onProgress?: (percent: number) => void,
): Promise<NexusRawUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    appendUploadFields(form, file, opts);

    xhr.open('POST', `${getNexusIngestBaseUrl()}/api/v1/ingestion/upload/raw`);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100))));
    };
    xhr.onload = () => {
      let json: { detail?: unknown; data?: NexusRawUploadResult } = {};
      try {
        json = JSON.parse(xhr.responseText) as typeof json;
      } catch {
        /* fall through */
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const detail = typeof json.detail === 'string'
          ? json.detail
          : (json.detail ? JSON.stringify(json.detail) : (xhr.statusText || `HTTP ${xhr.status}`));
        reject(new Error(detail));
        return;
      }
      const documentId = json.data?.document_id;
      if (!documentId) {
        reject(new Error('Upload response missing document_id'));
        return;
      }
      onProgress?.(100);
      resolve({
        document_id: documentId,
        filename: json.data?.filename,
        status: json.data?.status,
      });
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload aborted'));
    xhr.send(form);
  });
}

/** Step 2: Qwen auto-tag → validated ES → embeddings. */
export async function autoTagDocument(documentId: string): Promise<NexusAutoTagResult> {
  const id = documentId.trim();
  if (!id) throw new Error('document_id required');
  const res = await fetch(
    `${getNexusIngestBaseUrl()}/api/v1/ingestion/validation/auto-tag/document/${encodeURIComponent(id)}`,
    { method: 'POST' },
  );
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json() as {
    validation_result?: { domains?: string[]; categories?: string[]; subjects?: string[]; document_id?: string };
    processing_result?: { status?: string };
    data?: NexusIngestResult;
  };
  const validation = json.validation_result ?? json.data;
  return {
    document_id: validation?.document_id || id,
    domains: validation?.domains ?? [],
    categories: validation?.categories ?? [],
    subjects: validation?.subjects ?? [],
    processingStatus: json.processing_result?.status,
  };
}

/** Optional ingest WebSocket (`/api/v1/ws/ingestion`). Returns null if unavailable. */
export function connectIngestionWebSocket(
  onMessage: (msg: NexusIngestionWsMessage) => void,
): WebSocket | null {
  try {
    const httpBase = getNexusIngestBaseUrl();
    const wsBase = httpBase.replace(/^http/i, 'ws');
    const ws = new WebSocket(`${wsBase}/api/v1/ws/ingestion`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as NexusIngestionWsMessage;
        if (!msg || typeof msg !== 'object' || !('type' in msg)) return;
        onMessage(msg);
      } catch {
        /* ignore malformed frames */
      }
    };
    return ws;
  } catch {
    return null;
  }
}

/** One-shot: OCR → tag → validated ES → embeddings. */
export async function ingestUploadedFile(
  file: File,
  opts: NexusUploadOpts = {},
): Promise<NexusIngestResult> {
  const form = new FormData();
  appendUploadFields(form, file, opts);

  const res = await fetch(`${getNexusIngestBaseUrl()}/api/v1/ingestion/upload/ingest`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json() as { data?: NexusIngestResult };
  if (!json.data?.document_id) throw new Error('Ingest response missing document_id');
  return {
    document_id: json.data.document_id,
    filename: json.data.filename,
    domains: json.data.domains ?? [],
    categories: json.data.categories ?? [],
    subjects: json.data.subjects ?? [],
  };
}

export async function listPanelDocuments(
  domain: NexusDomainKind,
  size = 40,
): Promise<NexusPanelDocument[]> {
  const url = new URL(`${getNexusIngestBaseUrl()}/api/v1/panels/documents`);
  url.searchParams.set('domain', domain);
  url.searchParams.set('size', String(size));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json() as { items?: NexusPanelDocument[] };
  return json.items ?? [];
}

/** Full validated Elasticsearch document (includes extracted `full_text`). */
export async function fetchPanelDocument(documentId: string): Promise<NexusPanelDocument> {
  const id = documentId.trim();
  if (!id) throw new Error('document_id required');
  const res = await fetch(
    `${getNexusIngestBaseUrl()}/api/v1/panels/documents/${encodeURIComponent(id)}`,
  );
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json() as { data?: NexusPanelDocument };
  if (!json.data?.document_id) throw new Error('Document response missing data');
  return json.data;
}

export async function generateQuickAction(
  documentId: string,
  mode: 'gist' | 'summary',
): Promise<string> {
  const res = await fetch(
    `${getNexusIngestBaseUrl()}/api/v1/production/quick/generate/${encodeURIComponent(documentId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json() as {
    data?: { text?: string; content?: string };
    text?: string;
    result?: string;
  };
  return json.data?.content || json.data?.text || json.text || json.result || '';
}

/** Notify open domain panels to reload from Elasticsearch. */
export function notifyNexusDocumentsChanged(domains?: string[]): void {
  window.dispatchEvent(
    new CustomEvent('nexus-ingest:documents-changed', {
      detail: { domains: domains ?? [] },
    }),
  );
}

/** Taxonomy used by Qwen auto-tag to classify uploads into domain panels. */
export async function fetchTaxonomyLibrary(): Promise<NexusTaxonomyDomain[]> {
  const res = await fetch(`${getNexusIngestBaseUrl()}/api/v1/admin/taxonomy/domains`);
  if (!res.ok) throw new Error(await readError(res));
  const json = await res.json() as { items?: NexusTaxonomyDomain[]; domains?: string[] };
  if (Array.isArray(json.items) && json.items.length) return json.items;
  return (json.domains ?? []).map((domain) => ({ domain, categories: [] }));
}
