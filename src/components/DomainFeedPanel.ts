import { Panel } from './Panel';
import { t } from '@/services/i18n';
import {
  generateQuickAction,
  listPanelDocuments,
  type NexusPanelDocument,
} from '@/services/nexus-ingest';
import { setTrustedHtml, trustedHtml } from '@/utils/dom-utils';
import { joinSafeHtml, safeHtml, safeHtmlToString, type SafeHtml } from '@/utils/sanitize';

export type DomainKind =
  | 'political'
  | 'diplomatic'
  | 'international'
  | 'cyber'
  | 'economy'
  | 'tech'
  | 'health';

type ProbabilityLevel =
  | 'highly-unlikely'
  | 'unlikely'
  | 'possible'
  | 'likely'
  | 'highly-likely';

type ConfidenceLevel = 'low' | 'moderate' | 'high';

type DomainView = 'info' | 'chat' | 'gist' | 'summary';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface DomainCard {
  documentId?: string;
  probability: ProbabilityLevel;
  confidence: ConfidenceLevel;
  headline: string;
  summary: string;
  gist: string;
  quickSummary: string;
  age: string;
}

interface DomainMeta {
  panelId: string;
  titleKey: string;
  tooltipKey: string;
  indicators: string[];
  source: string;
  samples: DomainCard[];
}

const PROBABILITY_LABEL: Record<ProbabilityLevel, string> = {
  'highly-unlikely': 'Highly Unlikely',
  unlikely: 'Unlikely',
  possible: 'Possible',
  likely: 'Likely',
  'highly-likely': 'Highly Likely',
};

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

const VIEW_LABEL: Record<'chat' | 'gist' | 'summary', string> = {
  chat: 'Chat',
  gist: 'Gist',
  summary: 'Quick Summary',
};

const DOMAIN_META: Record<DomainKind, DomainMeta> = {
  political: {
    panelId: 'domain-political',
    titleKey: 'panels.domainPolitical',
    tooltipKey: 'components.domainPolitical.infoTooltip',
    indicators: ['CSS Mtg(s)', 'Ldrship succession uncertainty', 'Activities in DMA (beyond routine)'],
    source: 'Open-source political reporting',
    samples: [
      {
        probability: 'likely',
        confidence: 'high',
        headline: 'Parliament passes controversial electoral reform bill amidst protests.',
        summary:
          'The legislation, which critics argue dilutes oversight powers, passed with a narrow majority after a 12-hour debate session.',
        gist: 'Electoral reform cleared parliament after overnight debate. Oversight powers narrowed; opposition protests continue outside the chamber.',
        quickSummary:
          'Narrow-majority vote advanced electoral reform that critics say weakens oversight. Street protests followed the 12-hour session.',
        age: '2 minutes ago',
      },
    ],
  },
  diplomatic: {
    panelId: 'domain-diplomatic',
    titleKey: 'panels.domainDiplomatic',
    tooltipKey: 'components.domainDiplomatic.infoTooltip',
    indicators: ['Ambassador recalls', 'Treaty violations', 'Travel advisories'],
    source: 'Diplomatic cable / MFA release',
    samples: [
      {
        probability: 'possible',
        confidence: 'moderate',
        headline: 'Ambassador summoned over expulsion of aid workers in Northern region.',
        summary:
          'The foreign ministry issued a formal protest today following the detention of three humanitarian staff members at a border checkpoint.',
        gist: 'Host state summoned an ambassador after three aid workers were detained at a northern border checkpoint; formal protest lodged.',
        quickSummary:
          'Diplomatic protest after detention of three humanitarian staff. Ambassador called in; border checkpoint remains the flashpoint.',
        age: '15 minutes ago',
      },
    ],
  },
  international: {
    panelId: 'domain-international',
    titleKey: 'panels.domainInternational',
    tooltipKey: 'components.domainInternational.infoTooltip',
    indicators: ['Frenzy media campaigns', 'Coord bot activity', 'Attks on pub confd'],
    source: 'Multilateral summit communique',
    samples: [
      {
        probability: 'highly-likely',
        confidence: 'high',
        headline: 'Global summit reaches consensus on new maritime trade routes.',
        summary:
          'Delegates from 40 nations agreed to establish protected shipping corridors to ensure the safe passage of commercial goods through contested waters.',
        gist: 'Forty nations endorsed protected shipping corridors through contested waters to keep commercial traffic moving.',
        quickSummary:
          'Summit consensus: protected maritime corridors for trade. Implementation details still to be scheduled among coastal states.',
        age: '1 hour ago',
      },
    ],
  },
  cyber: {
    panelId: 'domain-cyber',
    titleKey: 'panels.domainCyber',
    tooltipKey: 'components.domainCyber.infoTooltip',
    indicators: ['tgt of natl power grids', 'Credential theft', 'Cyber recce'],
    source: 'CERT / threat intel bulletin',
    samples: [
      {
        probability: 'unlikely',
        confidence: 'moderate',
        headline: 'Major ransomware attack targets national infrastructure grids.',
        summary:
          'Emergency response teams are currently working to restore power to affected regions as cybersecurity agencies investigate the source of the breach.',
        gist: 'Ransomware hit infrastructure grids; responders restoring power while agencies trace the intrusion path.',
        quickSummary:
          'Active recovery after grid-facing ransomware. Partial outages reported; attribution still open.',
        age: '32 minutes ago',
      },
    ],
  },
  economy: {
    panelId: 'domain-economy',
    titleKey: 'panels.domainEconomy',
    tooltipKey: 'components.domainEconomy.infoTooltip',
    indicators: ['Water scty', 'Industrial decline', 'commodity shortages'],
    source: 'Central bank / markets wire',
    samples: [
      {
        probability: 'possible',
        confidence: 'low',
        headline: 'Central Bank raises interest rates to combat surging inflation.',
        summary:
          'The 50-basis-point hike marks the fourth consecutive increase this year, aiming to stabilize consumer prices which have risen by 7% annually.',
        gist: 'Fourth consecutive hike: +50 bps as CPI runs near 7% annualized.',
        quickSummary:
          'Policy rate up 50 bps again. Goal is cooling 7% inflation; markets watching for a pause signal.',
        age: '1 hour ago',
      },
    ],
  },
  tech: {
    panelId: 'domain-tech',
    titleKey: 'panels.domainTech',
    tooltipKey: 'components.domainTech.infoTooltip',
    indicators: ['Cloud computing platforms', 'Autonomous wpns devs', 'Emerging tech IP thefts'],
    source: 'Legislative draft / industry brief',
    samples: [
      {
        probability: 'likely',
        confidence: 'moderate',
        headline: 'New AI regulations proposed to ensure algorithmic transparency.',
        summary:
          'Lawmakers unveiled a draft bill requiring tech companies to disclose the training data and decision-making logic used in high-risk AI systems.',
        gist: 'Draft AI bill mandates disclosure of training data and decision logic for high-risk systems.',
        quickSummary:
          'Transparency-first AI draft: high-risk systems must document data and decision pathways before deployment.',
        age: '3 hours ago',
      },
    ],
  },
  health: {
    panelId: 'domain-health',
    titleKey: 'panels.domainHealth',
    tooltipKey: 'components.domainHealth.infoTooltip',
    indicators: ['Food insecurity/water shortages', 'Biotech talent shift', 'Eco-sys damaging tech'],
    source: 'Public health authority update',
    samples: [
      {
        probability: 'highly-unlikely',
        confidence: 'low',
        headline: 'Health officials confirm containment of viral outbreak in southern district.',
        summary:
          'Rapid response teams have successfully isolated the cluster, with no new cases reported in the last 48 hours according to the latest epidemiological data.',
        gist: 'Southern district outbreak contained; zero new cases in 48 hours after isolation of the cluster.',
        quickSummary:
          'Containment confirmed for the southern cluster. Surveillance continues; wider spread currently Highly Unlikely.',
        age: '5 minutes ago',
      },
    ],
  },
};

function renderInfoView(card: DomainCard): SafeHtml {
  return safeHtml`<p class="domain-feed-view-text">${card.summary}</p>`;
}

function renderChatMessages(messages: ChatMessage[]): SafeHtml {
  if (messages.length === 0) {
    return safeHtml`<div class="domain-feed-chat-empty">Ask a question about this item.</div>`;
  }
  return joinSafeHtml(
    messages.map(
      (message) => safeHtml`<div class="domain-feed-chat-bubble domain-feed-chat-bubble--${message.role}">
        <span class="domain-feed-chat-role">${message.role === 'user' ? 'You' : 'Analyst'}</span>
        <p class="domain-feed-chat-text">${message.text}</p>
      </div>`,
    ),
  );
}

function renderChatView(messages: ChatMessage[]): SafeHtml {
  return safeHtml`<div class="domain-feed-chat">
    <div class="domain-feed-chat-thread" data-domain-chat-thread>${renderChatMessages(messages)}</div>
    <form class="domain-feed-chat-form" data-domain-chat-form>
      <input
        class="domain-feed-chat-input"
        type="text"
        name="question"
        autocomplete="off"
        placeholder="Ask a question…"
        aria-label="Ask a question"
      />
      <button class="domain-feed-chat-send" type="submit">Send</button>
    </form>
  </div>`;
}

function renderView(card: DomainCard, view: DomainView, messages: ChatMessage[]): SafeHtml {
  if (view === 'chat') return renderChatView(messages);
  if (view === 'gist') return safeHtml`<p class="domain-feed-view-text">${card.gist}</p>`;
  if (view === 'summary') return safeHtml`<p class="domain-feed-view-text">${card.quickSummary}</p>`;
  return renderInfoView(card);
}

function renderTabs(active: DomainView): SafeHtml {
  const views: Array<'chat' | 'gist' | 'summary'> = ['chat', 'gist', 'summary'];
  return safeHtml`<div class="domain-feed-tabs" role="tablist" aria-label="Card views">
    ${joinSafeHtml(views.map((view) => safeHtml`<button
      type="button"
      class="domain-feed-tab${active === view ? ' is-active' : ''}"
      role="tab"
      aria-selected="${active === view ? 'true' : 'false'}"
      data-domain-view="${view}"
    >${VIEW_LABEL[view]}</button>`))}
  </div>`;
}

function renderSupportBlock(indicators: string[], source: string): SafeHtml {
  const chips = joinSafeHtml(
    indicators.map((indicator) => safeHtml`<span class="domain-feed-indicator">${indicator}</span>`),
  );
  return safeHtml`<div class="domain-feed-support">
    <div class="domain-feed-support-row">
      <span class="domain-feed-support-label">Key Support Indicators</span>
      <div class="domain-feed-indicators">${chips}</div>
    </div>
    <div class="domain-feed-support-row">
      <span class="domain-feed-support-label">Source</span>
      <span class="domain-feed-source">${source}</span>
    </div>
  </div>`;
}

function renderCard(
  card: DomainCard,
  index: number,
  active: DomainView,
  messages: ChatMessage[],
  indicators: string[],
  source: string,
): SafeHtml {
  return safeHtml`<article class="domain-feed-card" data-card-index="${String(index)}">
    <div class="domain-feed-meta">
      <span class="domain-feed-probability">${PROBABILITY_LABEL[card.probability]}</span>
      <span class="domain-feed-confidence domain-feed-confidence--${card.confidence}">${CONFIDENCE_LABEL[card.confidence]} confidence</span>
    </div>
    ${card.documentId
      ? safeHtml`<button type="button" class="domain-feed-headline domain-feed-headline--link" data-document-open="${card.documentId}" title="Open extracted document">${card.headline}</button>`
      : safeHtml`<h3 class="domain-feed-headline">${card.headline}</h3>`}
    <div class="domain-feed-body" data-domain-body>${renderView(card, active, messages)}</div>
    <div class="domain-feed-footer">${card.age}</div>
    ${renderTabs(active)}
    ${renderSupportBlock(indicators, source)}
  </article>`;
}

function formatAge(iso?: string | null): string {
  if (!iso) return 'ingested';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'ingested';
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function confidenceFromDoc(value: unknown): ConfidenceLevel {
  if (typeof value === 'number') {
    if (value >= 0.75) return 'high';
    if (value >= 0.4) return 'moderate';
    return 'low';
  }
  const text = String(value ?? '').toLowerCase();
  if (text.includes('high')) return 'high';
  if (text.includes('low')) return 'low';
  return 'moderate';
}

function cardFromDocument(doc: NexusPanelDocument): DomainCard {
  const subjects = (doc.subjects ?? []).slice(0, 4).join(', ');
  const categories = (doc.categories ?? []).slice(0, 4).join(', ');
  const detail = [categories && `Categories: ${categories}`, subjects && `Subjects: ${subjects}`]
    .filter(Boolean)
    .join(' · ');
  return {
    documentId: doc.document_id,
    probability: 'possible',
    confidence: confidenceFromDoc(doc.confidence),
    headline: doc.title || doc.filename || 'Untitled document',
    summary: detail || doc.source || 'Ingested document (Elasticsearch).',
    gist: 'Open Gist to generate with Qwen.',
    quickSummary: 'Open Quick Summary to generate with Qwen.',
    age: formatAge(doc.validated_at),
  };
}

/**
 * Domain-scoped intel cards backed by nexus_ingest → Elasticsearch.
 * Header UPLOAD ingests files; panels reload on `nexus-ingest:documents-changed`.
 */
export class DomainFeedPanel extends Panel {
  private cards: DomainCard[] = [];
  private readonly domain: DomainKind;
  private readonly indicators: string[];
  private readonly source: string;
  private readonly activeViews = new Map<number, DomainView>();
  private readonly chatMessages = new Map<number, ChatMessage[]>();
  private loadSeq = 0;

  private readonly onDocumentsChanged = (event: Event): void => {
    const detail = (event as CustomEvent<{ domains?: string[] }>).detail;
    const domains = detail?.domains ?? [];
    if (domains.length && !domains.some((d) => d.toLowerCase().includes(this.domain))) {
      // Still refresh — taxonomy tagging may use aliases.
    }
    void this.reloadFromIngest();
  };

  private readonly onTabClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const openBtn = target.closest<HTMLButtonElement>('[data-document-open]');
    if (openBtn && this.content.contains(openBtn)) {
      const documentId = openBtn.dataset.documentOpen?.trim();
      if (documentId) {
        event.preventDefault();
        void import('@/components/NexusDocumentDetailPanel')
          .then(({ openNexusDocumentDetail }) => openNexusDocumentDetail(documentId))
          .catch((err) => {
            console.error('[DomainFeedPanel] Failed to open document detail:', err);
          });
      }
      return;
    }

    const button = target.closest<HTMLButtonElement>('[data-domain-view]');
    if (!button || !this.content.contains(button)) return;
    const view = button.dataset.domainView;
    if (view !== 'chat' && view !== 'gist' && view !== 'summary') return;
    const card = button.closest<HTMLElement>('[data-card-index]');
    if (!card) return;
    const index = Number(card.dataset.cardIndex);
    if (!Number.isInteger(index) || !this.cards[index]) return;
    event.preventDefault();
    const nextView: DomainView = this.activeViews.get(index) === view ? 'info' : view;
    void this.setCardView(index, nextView, card);
  };

  private readonly onChatSubmit = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLFormElement) || !target.matches('[data-domain-chat-form]')) return;
    if (!this.content.contains(target)) return;
    event.preventDefault();

    const cardEl = target.closest<HTMLElement>('[data-card-index]');
    if (!cardEl) return;
    const index = Number(cardEl.dataset.cardIndex);
    const card = this.cards[index];
    if (!card || !Number.isInteger(index)) return;

    const input = target.querySelector<HTMLInputElement>('input[name="question"]');
    const question = input?.value.trim() ?? '';
    if (!question) return;

    const thread = this.chatMessages.get(index) ?? [];
    thread.push({ role: 'user', text: question });
    thread.push({
      role: 'assistant',
      text: `Recorded for “${card.headline}”. Live analyst chat is not wired yet; use Gist / Quick Summary for Qwen output.`,
    });
    this.chatMessages.set(index, thread);
    if (input) input.value = '';

    const threadEl = cardEl.querySelector<HTMLElement>('[data-domain-chat-thread]');
    if (threadEl) {
      setTrustedHtml(
        threadEl,
        trustedHtml(safeHtmlToString(renderChatMessages(thread)), 'domain-feed chat message'),
      );
      threadEl.scrollTop = threadEl.scrollHeight;
    }
  };

  constructor(domain: DomainKind) {
    const meta = DOMAIN_META[domain];
    super({
      id: meta.panelId,
      title: t(meta.titleKey),
      infoTooltip: t(meta.tooltipKey),
      showCount: true,
    });
    this.domain = domain;
    this.indicators = meta.indicators;
    this.source = 'nexus_ingest / Elasticsearch';
    // Immediate: debounced setSafeContent can land AFTER a fast ES list response,
    // so paintCards used to setCount(n) then miss [data-domain-feed-root] and leave
    // the panel stuck on "Loading…" until the next ingest event.
    this.setSafeContentImmediate(
      safeHtml`<div class="domain-feed-list" data-domain-feed-root>
        <div class="domain-feed-empty">Loading ingested documents…</div>
      </div>`,
      () => {
        this.content.addEventListener('click', this.onTabClick);
        this.content.addEventListener('submit', this.onChatSubmit);
      },
    );
    window.addEventListener('nexus-ingest:documents-changed', this.onDocumentsChanged);
    void this.reloadFromIngest();
  }

  private paintFeed(body: SafeHtml): void {
    this.setSafeContentImmediate(
      safeHtml`<div class="domain-feed-list" data-domain-feed-root">${body}</div>`,
    );
  }

  private paintCards(): void {
    this.activeViews.clear();
    this.chatMessages.clear();
    this.cards.forEach((_, index) => {
      this.activeViews.set(index, 'info');
      this.chatMessages.set(index, []);
    });
    this.setCount(this.cards.length);

    const body = !this.cards.length
      ? safeHtml`<div class="domain-feed-empty">No ingested documents for this domain yet. Use UPLOAD.</div>`
      : joinSafeHtml(
          this.cards.map((card, index) =>
            renderCard(card, index, 'info', [], this.indicators, this.source),
          ),
        );
    this.paintFeed(body);
  }

  private async reloadFromIngest(): Promise<void> {
    const seq = ++this.loadSeq;
    try {
      const docs = await listPanelDocuments(this.domain);
      if (seq !== this.loadSeq) return;
      this.cards = docs.map(cardFromDocument);
      this.paintCards();
    } catch (err) {
      if (seq !== this.loadSeq) return;
      console.warn(`[DomainFeedPanel:${this.domain}] ingest load failed`, err);
      this.cards = [];
      this.setCount(0);
      this.paintFeed(
        safeHtml`<div class="domain-feed-empty">Ingest API unavailable. Start nexus_ingest and check VITE_NEXUS_INGEST_URL.</div>`,
      );
    }
  }

  private async setCardView(index: number, view: DomainView, cardEl: HTMLElement): Promise<void> {
    const card = this.cards[index];
    if (!card) return;
    this.activeViews.set(index, view);

    if ((view === 'gist' || view === 'summary') && card.documentId) {
      const body = cardEl.querySelector<HTMLElement>('[data-domain-body]');
      if (body) {
        setTrustedHtml(
          body,
          trustedHtml(
            safeHtmlToString(safeHtml`<p class="domain-feed-view-text">Generating ${view}…</p>`),
            'domain-feed generating',
          ),
        );
      }
      try {
        const text = await generateQuickAction(card.documentId, view === 'gist' ? 'gist' : 'summary');
        if (view === 'gist') card.gist = text || card.gist;
        else card.quickSummary = text || card.quickSummary;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Generation failed';
        if (view === 'gist') card.gist = message;
        else card.quickSummary = message;
      }
    }

    const body = cardEl.querySelector<HTMLElement>('[data-domain-body]');
    if (body) {
      setTrustedHtml(
        body,
        trustedHtml(
          safeHtmlToString(renderView(card, view, this.chatMessages.get(index) ?? [])),
          'domain-feed view switch',
        ),
      );
    }

    for (const tab of cardEl.querySelectorAll<HTMLButtonElement>('[data-domain-view]')) {
      const active = view !== 'info' && tab.dataset.domainView === view;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  }

  public override destroy(): void {
    window.removeEventListener('nexus-ingest:documents-changed', this.onDocumentsChanged);
    this.content.removeEventListener('click', this.onTabClick);
    this.content.removeEventListener('submit', this.onChatSubmit);
    super.destroy();
  }
}
