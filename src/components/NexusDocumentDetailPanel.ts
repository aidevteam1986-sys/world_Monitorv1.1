/**
 * Right-side extracted-document overlay (nexus_ingest → Elasticsearch).
 * Mirrors CountryDeepDivePanel open/close + overlay-history semantics.
 */
import {
  fetchPanelDocument,
  generateQuickAction,
  type NexusPanelDocument,
} from '@/services/nexus-ingest';
import { isMobileDevice } from '@/utils';
import { setTrustedHtml, trustedHtml } from '@/utils/dom-utils';
import { overlayHistory, type OverlayCloseOrigin } from '@/utils/overlay-history';
import { joinSafeHtml, safeHtml, safeHtmlToString, type SafeHtml } from '@/utils/sanitize';

type DetailView = 'extracted' | 'gist' | 'summary';

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function threatLabel(threat: unknown): string {
  if (!threat || typeof threat !== 'object') return String(threat ?? '');
  const row = threat as Record<string, unknown>;
  return String(row.name || row.matched_term || row.threat_id || 'Threat').trim();
}

function relatedLabel(row: unknown): { id: string; title: string } | null {
  if (!row || typeof row !== 'object') return null;
  const doc = row as Record<string, unknown>;
  const id = String(doc.document_id ?? '').trim();
  if (!id) return null;
  return { id, title: String(doc.title || 'Related document').trim() };
}

function chipRow(label: string, values: string[]): SafeHtml {
  if (!values.length) {
    return safeHtml`<div class="ndd-meta-row">
      <span class="ndd-meta-label">${label}</span>
      <span class="ndd-meta-empty">None</span>
    </div>`;
  }
  const chips = joinSafeHtml(
    values.map((value) => safeHtml`<span class="ndd-chip">${value}</span>`),
  );
  return safeHtml`<div class="ndd-meta-row">
    <span class="ndd-meta-label">${label}</span>
    <div class="ndd-chip-row">${chips}</div>
  </div>`;
}

function renderBody(
  doc: NexusPanelDocument,
  view: DetailView,
  generated: { gist?: string; summary?: string },
  busy: boolean,
): SafeHtml {
  if (busy) {
    return safeHtml`<p class="ndd-status">Generating…</p>`;
  }
  if (view === 'gist') {
    return safeHtml`<p class="ndd-prose">${generated.gist || 'Open Gist to generate with Qwen.'}</p>`;
  }
  if (view === 'summary') {
    return safeHtml`<p class="ndd-prose">${generated.summary || 'Open Quick Summary to generate with Qwen.'}</p>`;
  }

  const threats = Array.isArray(doc.linked_threats)
    ? doc.linked_threats.map(threatLabel).filter(Boolean)
    : [];
  const related = (doc.related_documents ?? [])
    .map(relatedLabel)
    .filter((row): row is { id: string; title: string } => Boolean(row));

  const threatBlock = threats.length
    ? safeHtml`<section class="ndd-section">
        <h3 class="ndd-section-title">Linked threats</h3>
        <div class="ndd-chip-row">${joinSafeHtml(
          threats.map((name) => safeHtml`<span class="ndd-chip ndd-chip--threat">${name}</span>`),
        )}</div>
      </section>`
    : safeHtml``;

  const relatedBlock = related.length
    ? safeHtml`<section class="ndd-section">
        <h3 class="ndd-section-title">Related documents</h3>
        <ul class="ndd-related-list">${joinSafeHtml(
          related.map(
            (row) => safeHtml`<li>
              <button type="button" class="ndd-related-link" data-ndd-related-id="${row.id}">${row.title}</button>
            </li>`,
          ),
        )}</ul>
      </section>`
    : safeHtml``;

  const text = (doc.full_text || '').trim() || 'No extracted text available.';

  return safeHtml`
    <section class="ndd-section">
      ${chipRow('Domains', asStringList(doc.domains))}
      ${chipRow('Categories', asStringList(doc.categories))}
      ${chipRow('Subjects', asStringList(doc.subjects))}
      ${chipRow('Geo', doc.geo_tag ? [doc.geo_tag] : [])}
    </section>
    ${threatBlock}
    ${relatedBlock}
    <section class="ndd-section">
      <h3 class="ndd-section-title">Extracted text</h3>
      <pre class="ndd-full-text">${text}</pre>
    </section>
  `;
}

export class NexusDocumentDetailPanel {
  private readonly panel: HTMLElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly titleEl: HTMLElement;
  private readonly crumbEl: HTMLElement;
  private readonly metaEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly tabsEl: HTMLElement;

  private documentId: string | null = null;
  private doc: NexusPanelDocument | null = null;
  private view: DetailView = 'extracted';
  private generated: { gist?: string; summary?: string } = {};
  private loadSeq = 0;
  private historyRegistered = false;
  private lastFocused: HTMLElement | null = null;

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (!this.panel.classList.contains('active')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.hide();
    }
  };

  private readonly onPanelClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const related = target.closest<HTMLButtonElement>('[data-ndd-related-id]');
    if (related && this.panel.contains(related)) {
      const id = related.dataset.nddRelatedId?.trim();
      if (id) {
        event.preventDefault();
        void this.open(id);
      }
      return;
    }

    const tab = target.closest<HTMLButtonElement>('[data-ndd-view]');
    if (!tab || !this.panel.contains(tab)) return;
    const next = tab.dataset.nddView;
    if (next !== 'extracted' && next !== 'gist' && next !== 'summary') return;
    event.preventDefault();
    void this.setView(next);
  };

  constructor() {
    this.panel = this.getOrCreatePanel();
    const closeButton = this.panel.querySelector<HTMLButtonElement>('#nexus-document-close');
    const titleEl = this.panel.querySelector<HTMLElement>('[data-ndd-title]');
    const crumbEl = this.panel.querySelector<HTMLElement>('[data-ndd-crumb]');
    const metaEl = this.panel.querySelector<HTMLElement>('[data-ndd-meta]');
    const bodyEl = this.panel.querySelector<HTMLElement>('[data-ndd-body]');
    const tabsEl = this.panel.querySelector<HTMLElement>('[data-ndd-tabs]');
    if (!closeButton || !titleEl || !crumbEl || !metaEl || !bodyEl || !tabsEl) {
      throw new Error('Nexus document detail panel structure is invalid');
    }
    this.closeButton = closeButton;
    this.titleEl = titleEl;
    this.crumbEl = crumbEl;
    this.metaEl = metaEl;
    this.bodyEl = bodyEl;
    this.tabsEl = tabsEl;

    this.closeButton.addEventListener('click', () => this.hide());
    this.panel.addEventListener('click', this.onPanelClick);
  }

  public async open(documentId: string): Promise<void> {
    const id = documentId.trim();
    if (!id) return;
    this.documentId = id;
    this.view = 'extracted';
    this.generated = {};
    this.showLoading(id);
    this.openShell();

    const seq = ++this.loadSeq;
    try {
      const doc = await fetchPanelDocument(id);
      if (seq !== this.loadSeq || this.documentId !== id) return;
      this.doc = doc;
      this.renderDocument(doc);
    } catch (err) {
      if (seq !== this.loadSeq || this.documentId !== id) return;
      const message = err instanceof Error ? err.message : 'Failed to load document';
      this.doc = null;
      this.titleEl.textContent = 'Document unavailable';
      this.crumbEl.textContent = 'WORLD MONITOR › DOCUMENT';
      this.metaEl.textContent = '';
      setTrustedHtml(
        this.bodyEl,
        trustedHtml(
          safeHtmlToString(safeHtml`<p class="ndd-status ndd-status--error">${message}</p>`),
          'nexus-document error',
        ),
      );
    }
  }

  public hide(origin: OverlayCloseOrigin = 'control'): void {
    if (origin === 'control' && this.historyRegistered) {
      overlayHistory.close('nexus-document');
    }
    this.historyRegistered = false;
    this.loadSeq += 1;
    this.documentId = null;
    this.doc = null;
    if (!this.panel.classList.contains('active')) return;
    this.panel.classList.remove('active');
    this.panel.setAttribute('aria-hidden', 'true');
    document.removeEventListener('keydown', this.onKeydown);
    this.lastFocused?.focus();
    this.lastFocused = null;
  }

  private showLoading(documentId: string): void {
    this.titleEl.textContent = 'Loading document…';
    this.crumbEl.textContent = `WORLD MONITOR › DOCUMENT › ${documentId.slice(0, 8)}`;
    this.metaEl.textContent = 'Fetching extracted fields from Elasticsearch…';
    setTrustedHtml(
      this.bodyEl,
      trustedHtml(
        safeHtmlToString(safeHtml`<p class="ndd-status">Loading extracted document…</p>`),
        'nexus-document loading',
      ),
    );
    this.paintTabs();
  }

  private renderDocument(doc: NexusPanelDocument): void {
    const title = doc.title || doc.filename || 'Untitled document';
    this.titleEl.textContent = title;
    this.crumbEl.textContent = `WORLD MONITOR › DOCUMENT › ${(doc.document_id || '').slice(0, 8).toUpperCase() || 'ES'}`;

    const confidence = doc.confidence == null || doc.confidence === ''
      ? '—'
      : String(doc.confidence);
    const source = doc.source || 'nexus_ingest / Elasticsearch';
    const pills = [
      safeHtml`<span class="ndd-pill">Confidence ${confidence}</span>`,
      safeHtml`<span class="ndd-pill">Source ${source}</span>`,
    ];
    if (doc.validated_at) {
      pills.push(safeHtml`<span class="ndd-pill">Validated ${doc.validated_at}</span>`);
    }
    setTrustedHtml(
      this.metaEl,
      trustedHtml(safeHtmlToString(joinSafeHtml(pills)), 'nexus-document meta'),
    );
    this.paintTabs();
    this.paintBody(false);
  }

  private async setView(view: DetailView): Promise<void> {
    this.view = view;
    this.paintTabs();

    if ((view === 'gist' || view === 'summary') && this.documentId) {
      const cached = view === 'gist' ? this.generated.gist : this.generated.summary;
      if (!cached) {
        this.paintBody(true);
        try {
          const text = await generateQuickAction(this.documentId, view === 'gist' ? 'gist' : 'summary');
          if (this.view !== view) return;
          if (view === 'gist') this.generated.gist = text || 'No gist returned.';
          else this.generated.summary = text || 'No summary returned.';
        } catch (err) {
          if (this.view !== view) return;
          const message = err instanceof Error ? err.message : 'Generation failed';
          if (view === 'gist') this.generated.gist = message;
          else this.generated.summary = message;
        }
      }
    }
    this.paintBody(false);
  }

  private paintTabs(): void {
    setTrustedHtml(
      this.tabsEl,
      trustedHtml(
        safeHtmlToString(safeHtml`
          <button type="button" class="ndd-tab ${this.view === 'extracted' ? 'is-active' : ''}" data-ndd-view="extracted" aria-selected="${this.view === 'extracted' ? 'true' : 'false'}">Extracted</button>
          <button type="button" class="ndd-tab ${this.view === 'gist' ? 'is-active' : ''}" data-ndd-view="gist" aria-selected="${this.view === 'gist' ? 'true' : 'false'}">Gist</button>
          <button type="button" class="ndd-tab ${this.view === 'summary' ? 'is-active' : ''}" data-ndd-view="summary" aria-selected="${this.view === 'summary' ? 'true' : 'false'}">Quick Summary</button>
        `),
        'nexus-document tabs',
      ),
    );
  }

  private paintBody(busy: boolean): void {
    if (!this.doc) return;
    setTrustedHtml(
      this.bodyEl,
      trustedHtml(
        safeHtmlToString(renderBody(this.doc, this.view, this.generated, busy)),
        'nexus-document body',
      ),
    );
  }

  private openShell(): void {
    if (!this.panel.classList.contains('active')) {
      this.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.panel.classList.add('active');
      this.panel.setAttribute('aria-hidden', 'false');
      document.addEventListener('keydown', this.onKeydown);
      if (isMobileDevice()) {
        this.historyRegistered = true;
        overlayHistory.open('nexus-document', (origin) => this.hide(origin));
      }
      requestAnimationFrame(() => {
        if (this.panel.classList.contains('active')) this.closeButton.focus();
      });
    }
  }

  private getOrCreatePanel(): HTMLElement {
    const existing = document.getElementById('nexus-document-detail-panel');
    if (existing) return existing;

    const panel = document.createElement('aside');
    panel.id = 'nexus-document-detail-panel';
    panel.className = 'nexus-document-detail';
    panel.setAttribute('aria-label', 'Extracted document');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
      <div class="nexus-document-detail-shell">
        <header class="ndd-header">
          <div class="ndd-header-text">
            <div class="ndd-crumb" data-ndd-crumb>WORLD MONITOR › DOCUMENT</div>
            <h2 class="ndd-title" data-ndd-title>Document</h2>
            <div class="ndd-meta" data-ndd-meta></div>
          </div>
          <button type="button" class="panel-close" id="nexus-document-close" aria-label="Close">×</button>
        </header>
        <div class="ndd-tabs" data-ndd-tabs role="tablist"></div>
        <div class="panel-content" id="nexus-document-content">
          <div data-ndd-body></div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
    return panel;
  }
}

let singleton: NexusDocumentDetailPanel | null = null;

/** Open (or reuse) the extracted-document overlay for an Elasticsearch document id. */
export async function openNexusDocumentDetail(documentId: string): Promise<void> {
  if (!singleton) singleton = new NexusDocumentDetailPanel();
  await singleton.open(documentId);
}
