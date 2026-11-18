/**
 * Multi-file upload modal for nexus_ingest (NEXUS_BD-style progress UX).
 * Flow: XHR /upload/raw → /auto-tag → optional WS vectorization progress.
 */
import {
  autoTagDocument,
  connectIngestionWebSocket,
  notifyNexusDocumentsChanged,
  uploadRawFileWithProgress,
  type NexusIngestionWsMessage,
} from '@/services/nexus-ingest';
import { createFocusTrap, type FocusTrap } from '@/utils/focus-trap';
import { declareOverlay } from '@/utils/open-modal';
import { escapeHtml } from '@/utils/sanitize';
import { setTrustedHtml, trustedHtml } from '@/utils/dom-utils';

export type NexusUploadFileStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'tagging'
  | 'success'
  | 'error';

type UploadRow = {
  id: string;
  file: File;
  status: NexusUploadFileStatus;
  uploadPercent: number;
  vectorPercent: number;
  chunkCurrent?: number;
  chunkTotal?: number;
  documentId?: string;
  error?: string;
  domains: string[];
};

let overlay: HTMLElement | null = null;
let focusTrap: FocusTrap | null = null;
let rows: UploadRow[] = [];
let running = false;
let ws: WebSocket | null = null;
const docToRow = new Map<string, string>();

function newRowId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function statusLabel(row: UploadRow): string {
  switch (row.status) {
    case 'uploading':
      return `Uploading ${row.uploadPercent}%`;
    case 'uploaded':
      return 'Uploaded';
    case 'tagging':
      if (row.chunkTotal && row.chunkTotal > 0) {
        return `Vectorizing... ${row.vectorPercent}% · Chunk ${row.chunkCurrent ?? 0} of ${row.chunkTotal}`;
      }
      if (row.vectorPercent > 0) return `Vectorizing... ${row.vectorPercent}%`;
      return 'Tagging...';
    case 'success':
      return row.chunkTotal != null ? 'Vectorized ✓' : 'Tagged ✓';
    case 'error':
      return row.error ? `Failed: ${row.error}` : 'Failed';
    default:
      return 'Pending';
  }
}

function barTone(row: UploadRow): string {
  if (row.status === 'success') return 'success';
  if (row.status === 'error') return 'error';
  if (row.status === 'uploading') return 'upload';
  if (row.status === 'tagging' || row.status === 'uploaded') return 'tag';
  return 'idle';
}

function barWidth(row: UploadRow): number {
  if (row.status === 'success') return 100;
  if (row.status === 'uploading') return row.uploadPercent;
  if (row.status === 'uploaded') return 100;
  if (row.status === 'tagging') return Math.max(row.vectorPercent, row.vectorPercent > 0 ? row.vectorPercent : 12);
  if (row.status === 'error') return 100;
  return 0;
}

function headerSummary(): string | null {
  const tagged = rows.filter((r) => r.status === 'success').length;
  const tagging = rows.filter((r) => r.status === 'tagging').length;
  const uploaded = rows.filter((r) => r.status === 'uploaded').length;
  const uploading = rows.filter((r) => r.status === 'uploading').length;
  if (!running && tagging === 0 && uploading === 0) return null;
  return `${tagged} tagged, ${tagging} tagging, ${uploaded} uploaded, ${uploading} uploading...`;
}

function patchRow(id: string, partial: Partial<UploadRow>): void {
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const current = rows[idx];
  if (!current) return;
  rows[idx] = {
    id: current.id,
    file: partial.file ?? current.file,
    status: partial.status ?? current.status,
    uploadPercent: partial.uploadPercent ?? current.uploadPercent,
    vectorPercent: partial.vectorPercent ?? current.vectorPercent,
    chunkCurrent: 'chunkCurrent' in partial ? partial.chunkCurrent : current.chunkCurrent,
    chunkTotal: 'chunkTotal' in partial ? partial.chunkTotal : current.chunkTotal,
    documentId: partial.documentId ?? current.documentId,
    error: 'error' in partial ? partial.error : current.error,
    domains: partial.domains ?? current.domains,
  };
  renderList();
}

function ensureWs(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  ws = connectIngestionWebSocket((msg) => handleWsMessage(msg));
  if (ws) {
    ws.onerror = () => {
      /* HTTP fallback remains active */
    };
  }
}

function handleWsMessage(msg: NexusIngestionWsMessage): void {
  const rowId = docToRow.get(msg.document_id);
  if (!rowId) return;
  const row = rows.find((r) => r.id === rowId);
  if (!row || row.status === 'error' || row.status === 'success') return;

  if (msg.type === 'vectorization_progress') {
    patchRow(rowId, {
      status: 'tagging',
      vectorPercent: Math.max(0, Math.min(100, Math.round(msg.progress_percent))),
      chunkCurrent: msg.current_chunk,
      chunkTotal: msg.total_chunks,
    });
    return;
  }

  if (msg.type === 'document_update') {
    if (msg.status === 'validated') {
      patchRow(rowId, { status: 'tagging' });
    } else if (msg.status === 'processed') {
      patchRow(rowId, { status: 'success', vectorPercent: 100 });
    }
  }
}

function renderList(): void {
  if (!overlay) return;
  const list = overlay.querySelector('#nexusUploadList');
  const summary = overlay.querySelector('#nexusUploadSummary');
  const uploadBtn = overlay.querySelector('#nexusUploadStart') as HTMLButtonElement | null;
  const clearBtn = overlay.querySelector('#nexusUploadClear') as HTMLButtonElement | null;
  if (!list) return;

  const summaryText = headerSummary();
  if (summary) {
    summary.textContent = summaryText ?? '';
    (summary as HTMLElement).hidden = !summaryText;
  }

  if (uploadBtn) {
    uploadBtn.disabled = running || rows.length === 0;
    uploadBtn.textContent = running ? 'Working…' : 'Upload';
  }
  if (clearBtn) clearBtn.disabled = running;

  if (!rows.length) {
    setTrustedHtml(
      list as HTMLElement,
      trustedHtml('<p class="nexus-upload-empty">Select one or more documents to ingest.</p>', 'nexus-upload empty'),
    );
    return;
  }

  const html = rows
    .map((row) => {
      const spinning = row.status === 'uploading' || row.status === 'tagging';
      const spinner = spinning
        ? '<span class="nexus-upload-spinner" aria-hidden="true"></span>'
        : '<span class="nexus-upload-spinner-slot" aria-hidden="true"></span>';
      return `<div class="nexus-upload-row" data-id="${escapeHtml(row.id)}">
        <div class="nexus-upload-row-top">
          ${spinner}
          <div class="nexus-upload-row-meta">
            <div class="nexus-upload-filename">${escapeHtml(row.file.name)}</div>
            <div class="nexus-upload-status">${escapeHtml(statusLabel(row))}</div>
          </div>
        </div>
        <div class="nexus-upload-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${barWidth(row)}">
          <div class="nexus-upload-bar-fill nexus-upload-bar-fill--${barTone(row)}" style="width:${barWidth(row)}%"></div>
        </div>
      </div>`;
    })
    .join('');

  setTrustedHtml(list as HTMLElement, trustedHtml(html, 'nexus-upload list'));
}

async function startUploads(): Promise<void> {
  if (running) return;
  const queue = rows.filter((r) => r.status === 'pending' || r.status === 'error');
  if (!queue.length) return;

  running = true;
  ensureWs();
  renderList();

  const taggedDomains = new Set<string>();
  let ok = 0;

  for (const item of queue) {
    try {
      patchRow(item.id, {
        status: 'uploading',
        uploadPercent: 0,
        vectorPercent: 0,
        chunkCurrent: undefined,
        chunkTotal: undefined,
        error: undefined,
        domains: [],
      });

      const raw = await uploadRawFileWithProgress(
        item.file,
        { source: 'dashboard-upload' },
        (percent) => patchRow(item.id, { status: 'uploading', uploadPercent: percent }),
      );

      docToRow.set(raw.document_id, item.id);
      patchRow(item.id, {
        status: 'uploaded',
        uploadPercent: 100,
        documentId: raw.document_id,
      });
      patchRow(item.id, { status: 'tagging', vectorPercent: 0 });

      const tagged = await autoTagDocument(raw.document_id);
      for (const domain of tagged.domains) taggedDomains.add(String(domain).toLowerCase());

      const current = rows.find((r) => r.id === item.id);
      if (current && current.status !== 'success') {
        // WS `processed` may already have flipped to success; otherwise HTTP completion wins.
        // Keep chunkTotal only when vectorization_progress was observed → "Vectorized ✓".
        patchRow(item.id, {
          status: 'success',
          vectorPercent: current.chunkTotal != null ? 100 : current.vectorPercent,
          domains: tagged.domains,
        });
      } else {
        patchRow(item.id, { domains: tagged.domains });
      }
      ok += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[nexus-ingest] upload failed', item.file.name, err);
      patchRow(item.id, { status: 'error', error: message });
    }
  }

  running = false;
  renderList();

  if (ok > 0) {
    notifyNexusDocumentsChanged([...taggedDomains]);
  }
}

function addFiles(fileList: FileList | File[]): void {
  const incoming = Array.from(fileList);
  if (!incoming.length) return;
  for (const file of incoming) {
    rows.push({
      id: newRowId(),
      file,
      status: 'pending',
      uploadPercent: 0,
      vectorPercent: 0,
      domains: [],
    });
  }
  renderList();
}

function clearPending(): void {
  if (running) return;
  rows = rows.filter((r) => r.status === 'uploading' || r.status === 'tagging');
  renderList();
}

export function closeNexusUploadModal(): void {
  focusTrap?.deactivate();
  focusTrap = null;
  if (ws) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
  }
  docToRow.clear();
  running = false;
  rows = [];
  overlay?.remove();
  overlay = null;
}

export function openNexusUploadModal(initialFiles?: File[]): void {
  closeNexusUploadModal();

  overlay = document.createElement('div');
  overlay.className = 'nexus-upload-overlay active';
  overlay.id = 'nexusUploadOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'nexusUploadTitle');
  declareOverlay(overlay, { reload: 'blocking' });

  setTrustedHtml(
    overlay,
    trustedHtml(`
    <div class="nexus-upload-modal">
      <header class="nexus-upload-header">
        <div class="nexus-upload-header-text">
          <h2 id="nexusUploadTitle">Upload documents</h2>
          <p id="nexusUploadSummary" class="nexus-upload-summary" hidden></p>
        </div>
        <button type="button" class="nexus-upload-close" id="nexusUploadClose" aria-label="Close">×</button>
      </header>
      <div class="nexus-upload-body">
        <label class="nexus-upload-picker">
          <input type="file" id="nexusUploadInput" multiple />
          <span>Choose files</span>
        </label>
        <div id="nexusUploadList" class="nexus-upload-list" aria-live="polite"></div>
      </div>
      <footer class="nexus-upload-footer">
        <button type="button" class="nexus-upload-btn nexus-upload-btn--ghost" id="nexusUploadClear">Clear</button>
        <button type="button" class="nexus-upload-btn nexus-upload-btn--primary" id="nexusUploadStart">Upload</button>
      </footer>
    </div>
  `, 'nexus-upload modal'),
  );

  document.body.appendChild(overlay);

  overlay.querySelector('#nexusUploadClose')?.addEventListener('click', () => {
    if (running) return;
    closeNexusUploadModal();
  });
  overlay.addEventListener('click', (event) => {
    if (running) return;
    if (event.target === overlay) closeNexusUploadModal();
  });
  overlay.querySelector('#nexusUploadClear')?.addEventListener('click', () => clearPending());
  overlay.querySelector('#nexusUploadStart')?.addEventListener('click', () => {
    void startUploads();
  });
  overlay.querySelector('#nexusUploadInput')?.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) addFiles(input.files);
    input.value = '';
  });

  focusTrap = createFocusTrap(overlay, {
    onEscape: () => {
      if (!running) closeNexusUploadModal();
    },
  });
  focusTrap.activate();

  if (initialFiles?.length) addFiles(initialFiles);
  else renderList();
}
