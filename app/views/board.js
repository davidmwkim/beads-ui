import { html, render } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { createListSelectors } from '../data/list-selectors.js';
import { cmpClosedDesc, cmpPriorityThenCreated } from '../data/sort.js';
import { createIssueIdRenderer } from '../utils/issue-id-renderer.js';
import { debug } from '../utils/logging.js';
import { renderMarkdown } from '../utils/markdown.js';
import { createPriorityBadge } from '../utils/priority-badge.js';
import { showToast } from '../utils/toast.js';
import { createTypeBadge } from '../utils/type-badge.js';

/**
 * @typedef {{
 *   id: string,
 *   title?: string,
 *   status?: 'open'|'in_progress'|'closed',
 *   priority?: number,
 *   issue_type?: string,
 *   assignee?: string,
 *   created_at?: number,
 *   updated_at?: number,
 *   closed_at?: number,
 *   comment_count?: number,
 *   labels?: string[],
 *   last_comment_at?: string,
 *   notes?: string,
 *   latest_prompt?: string,
 *   latest_response?: string,
 *   response_pending?: boolean,
 *   metadata?: Record<string, unknown>
 * }} IssueLite
 */

/**
 * @typedef {{
 *   level: 'idle'|'seconds'|'minutes'|'hour'|'hours',
 *   indicator: 'none'|'healthy'|'missed',
 *   runtime_ms: number|null,
 *   heartbeat_ts: number|null,
 *   heartbeat_age_ms: number|null,
 *   is_missed: boolean,
 *   summary: string
 * }} CardHealth
 */

/**
 * @typedef {{
 *   id: string,
 *   column_id: string,
 *   status: string,
 *   last_comment_ts: number|null,
 *   latest_prompt_sig: string,
 *   latest_response_sig: string,
 *   heartbeat_ts: number|null
 * }} CardRenderState
 */

/**
 * Map column IDs to their corresponding status values.
 *
 * @type {Record<string, 'open'|'in_progress'|'closed'>}
 */
const COLUMN_STATUS_MAP = {
  'blocked-col': 'open',
  'ready-col': 'open',
  'in-progress-col': 'in_progress',
  'closed-col': 'closed'
};

const HEARTBEAT_LABEL_PREFIX = 'last-heartbeat:';
const RUNTIME_LABEL_PREFIX = 'time-alive:';
const MODEL_PROVIDER_LABEL_PREFIX = 'model-provider:';
const MODEL_LABEL_PREFIX = 'model:';
const HEARTBEAT_EXPECTED_DEFAULT_MS = 5 * 60 * 1000;
const HEARTBEAT_EXPECTED_LONG_RUNNING_MS = 10 * 60 * 1000;
const HEALTH_LEVEL_CLASSES = [
  'board-card--seconds',
  'board-card--minutes',
  'board-card--hour',
  'board-card--hours'
];
const DEBUG_SIMULATION_INITIAL = [
  {
    id: 'DBG-B1',
    title: 'Blocked by upstream dependency',
    status: 'open',
    priority: 1,
    issue_type: 'task',
    comment_count: 0,
    created_at: Date.now() - 60 * 60 * 1000,
    labels: ['debug', 'lane:blocked']
  },
  {
    id: 'DBG-R1',
    title: 'Ready for pickup',
    status: 'open',
    priority: 1,
    issue_type: 'feature',
    comment_count: 1,
    created_at: Date.now() - 30 * 60 * 1000,
    labels: ['debug', 'lane:ready']
  },
  {
    id: 'DBG-P1',
    title: 'Fresh worker started seconds ago',
    status: 'in_progress',
    priority: 0,
    issue_type: 'task',
    assignee: 'agent-alpha',
    comment_count: 2,
    created_at: Date.now() - 20 * 1000,
    labels: [
      'debug',
      'pid:4242',
      'last-heartbeat:' + new Date(Date.now() - 20 * 1000).toISOString(),
      'time-alive:20s'
    ],
    latest_prompt: [
      'Kick off the worker and confirm the first heartbeat lands.',
      '',
      '- post a heartbeat every 3s',
      '- keep retries below `3`'
    ].join('\n'),
    latest_response: [
      'Worker is online.',
      '',
      '```text',
      'status=ok',
      'latency_ms=42',
      'heartbeat=steady',
      '```'
    ].join('\n'),
    notes: [
      'Worker is online.',
      '',
      '```text',
      'status=ok',
      'latency_ms=42',
      'heartbeat=steady',
      '```'
    ].join('\n'),
    metadata: {
      latest_prompt: [
        'Kick off the worker and confirm the first heartbeat lands.',
        '',
        '- post a heartbeat every 3s',
        '- keep retries below `3`'
      ].join('\n'),
      latest_response: [
        'Worker is online.',
        '',
        '```text',
        'status=ok',
        'latency_ms=42',
        'heartbeat=steady',
        '```'
      ].join('\n')
    }
  },
  {
    id: 'DBG-P2',
    title: 'Healthy worker running for minutes',
    status: 'in_progress',
    priority: 1,
    issue_type: 'task',
    assignee: 'agent-beta',
    comment_count: 1,
    created_at: Date.now() - 18 * 60 * 1000,
    labels: [
      'debug',
      'pid:4310',
      'last-heartbeat:' + new Date(Date.now() - 70 * 1000).toISOString(),
      'time-alive:18m'
    ],
    latest_prompt: [
      'Continue processing the active queue.',
      '',
      '- keep scan latency under 500ms',
      '- flush metrics on each loop'
    ].join('\n'),
    latest_response: [
      'Queue is draining normally.',
      '',
      '```text',
      'status=ok',
      'processed=14',
      '```'
    ].join('\n'),
    notes: [
      'Queue is draining normally.',
      '',
      '```text',
      'status=ok',
      'processed=14',
      '```'
    ].join('\n'),
    metadata: {
      latest_prompt: [
        'Continue processing the active queue.',
        '',
        '- keep scan latency under 500ms',
        '- flush metrics on each loop'
      ].join('\n'),
      latest_response: [
        'Queue is draining normally.',
        '',
        '```text',
        'status=ok',
        'processed=14',
        '```'
      ].join('\n')
    }
  },
  {
    id: 'DBG-P3',
    title: 'Long-running worker active for hours',
    status: 'in_progress',
    priority: 1,
    issue_type: 'task',
    assignee: 'agent-gamma',
    comment_count: 1,
    created_at: Date.now() - 2 * 60 * 60 * 1000,
    labels: [
      'debug',
      'pid:4477',
      'last-heartbeat:' + new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      'time-alive:2h14m'
    ],
    latest_prompt: [
      'Keep the long-running reconciliation task healthy.',
      '',
      '- checkpoint every 5 minutes',
      '- report progress at each batch boundary'
    ].join('\n'),
    latest_response: [
      'Batch processing is still healthy.',
      '',
      '```text',
      'status=ok',
      'batches_complete=9',
      '```'
    ].join('\n'),
    notes: [
      'Batch processing is still healthy.',
      '',
      '```text',
      'status=ok',
      'batches_complete=9',
      '```'
    ].join('\n'),
    metadata: {
      latest_prompt: [
        'Keep the long-running reconciliation task healthy.',
        '',
        '- checkpoint every 5 minutes',
        '- report progress at each batch boundary'
      ].join('\n'),
      latest_response: [
        'Batch processing is still healthy.',
        '',
        '```text',
        'status=ok',
        'batches_complete=9',
        '```'
      ].join('\n')
    }
  },
  {
    id: 'DBG-P4',
    title: 'Heartbeat overdue for more than an hour',
    status: 'in_progress',
    priority: 0,
    issue_type: 'task',
    assignee: 'agent-delta',
    comment_count: 1,
    created_at: Date.now() - 3 * 60 * 60 * 1000,
    labels: [
      'debug',
      'pid:4555',
      'last-heartbeat:' + new Date(Date.now() - 66 * 60 * 1000).toISOString(),
      'time-alive:3h2m'
    ],
    latest_prompt: [
      'Investigate the stalled worker and decide whether to restart it.',
      '',
      '1. confirm last durable checkpoint',
      '2. inspect upstream dependency health'
    ].join('\n'),
    latest_response: [
      '> heartbeat overdue by more than an hour',
      '',
      'Waiting on upstream dependency before next emit.'
    ].join('\n'),
    notes: [
      '> heartbeat overdue by more than an hour',
      '',
      'Waiting on upstream dependency before next emit.'
    ].join('\n'),
    metadata: {
      latest_prompt: [
        'Investigate the stalled worker and decide whether to restart it.',
        '',
        '1. confirm last durable checkpoint',
        '2. inspect upstream dependency health'
      ].join('\n'),
      latest_response: [
        '> heartbeat overdue by more than an hour',
        '',
        'Waiting on upstream dependency before next emit.'
      ].join('\n')
    }
  },
  {
    id: 'DBG-C1',
    title: 'Recently closed neutral ticket',
    status: 'closed',
    priority: 2,
    issue_type: 'chore',
    comment_count: 1,
    created_at: Date.now() - 2 * 60 * 60 * 1000,
    closed_at: Date.now() - 8 * 60 * 1000,
    labels: [
      'debug',
      'last-heartbeat:' + new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      'time-alive:2h'
    ]
  }
];

/**
 * Create the Board view with Blocked, Ready, In progress, Closed.
 * Push-only: derives items from per-subscription stores.
 *
 * Sorting rules:
 * - Ready/Blocked/In progress: priority asc, then created_at asc.
 * - Closed: closed_at desc.
 *
 * @param {HTMLElement} mount_element
 * @param {unknown} _data - Unused (legacy param retained for call-compat)
 * @param {(id: string) => void} gotoIssue - Navigate to issue detail.
 * @param {{ getState: () => any, setState: (patch: any) => void, subscribe?: (fn: (s:any)=>void)=>()=>void }} [store]
 * @param {{ selectors: { getIds: (client_id: string) => string[], count?: (client_id: string) => number } }} [subscriptions]
 * @param {{ snapshotFor?: (client_id: string) => any[], subscribe?: (fn: () => void) => () => void }} [issueStores]
 * @param {(type: string, payload: unknown) => Promise<unknown>} [transport] - Transport function for sending updates
 * @returns {{ load: () => Promise<void>, clear: () => void }}
 */
export function createBoardView(
  mount_element,
  _data,
  gotoIssue,
  store,
  subscriptions = undefined,
  issueStores = undefined,
  transport = undefined
) {
  const log = debug('views:board');
  /** @type {IssueLite[]} */
  let list_ready = [];
  /** @type {IssueLite[]} */
  let list_blocked = [];
  /** @type {IssueLite[]} */
  let list_in_progress = [];
  /** @type {IssueLite[]} */
  let list_closed = [];
  /** @type {IssueLite[]} */
  let list_closed_raw = [];
  /** @type {Map<string, CardRenderState>} */
  let previous_card_state = new Map();
  /** @type {Map<string, DOMRect>} */
  let previous_card_positions = new Map();
  /** @type {Map<string, number|null>} */
  let comment_timestamp_cache = new Map();
  /** @type {Map<string, { latest_prompt?: string, latest_response?: string, response_pending?: boolean }>} */
  let comment_preview_cache = new Map();
  /** @type {Map<string, Record<string, unknown>|null>} */
  let issue_metadata_cache = new Map();
  /** @type {Set<string>} */
  let pending_comment_fetches = new Set();
  /** @type {Set<string>} */
  let pending_issue_metadata_fetches = new Set();
  /** @type {Map<string, number>} */
  let previous_column_counts = new Map();
  /** @type {ReturnType<typeof setInterval>|null} */
  let display_timer = null;
  /** @type {boolean} */
  let board_debug_enabled = isBoardDebugEnabled();
  /** @type {IssueLite[]} */
  let debug_issues = [];
  /** @type {ReturnType<typeof setInterval>[]} */
  let debug_timers = [];
  /** @type {number} */
  let debug_sequence = 1;
  // Centralized selection helpers
  const selectors = issueStores ? createListSelectors(issueStores) : null;

  /**
   * Closed column filter mode.
   * 'today' → items with closed_at since local day start
   * '3' → last 3 days; '7' → last 7 days
   *
   * @type {'today'|'3'|'7'}
   */
  let closed_filter_mode = 'today';
  if (store) {
    try {
      const s = store.getState();
      const cf =
        s && s.board ? String(s.board.closed_filter || 'today') : 'today';
      if (cf === 'today' || cf === '3' || cf === '7') {
        closed_filter_mode = /** @type {any} */ (cf);
      }
    } catch {
      // ignore store init errors
    }
  }

  function template() {
    return html`
      <div class="panel__body">
        <div class="board-root">
          ${columnTemplate('Blocked', 'blocked-col', list_blocked)}
          ${columnTemplate('Ready', 'ready-col', list_ready)}
          ${columnTemplate('In Progress', 'in-progress-col', list_in_progress)}
          ${columnTemplate('Closed', 'closed-col', list_closed)}
        </div>
      </div>
    `;
  }

  /**
   * @param {string} title
   * @param {string} id
   * @param {IssueLite[]} items
   */
  function columnTemplate(title, id, items) {
    const item_count = Array.isArray(items) ? items.length : 0;
    const count_label = item_count === 1 ? '1 issue' : `${item_count} issues`;
    return html`
      <section class="board-column" id=${id}>
        <header
          class="board-column__header"
          id=${id + '-header'}
          role="heading"
          aria-level="2"
        >
          <div class="board-column__title">
            <span class="board-column__title-text">${title}</span>
            <span class="badge board-column__count" aria-label=${count_label}>
              ${item_count}
            </span>
          </div>
          ${id === 'closed-col'
            ? html`<label class="board-closed-filter">
                <span class="visually-hidden">Filter closed issues</span>
                <select
                  id="closed-filter"
                  aria-label="Filter closed issues"
                  @change=${onClosedFilterChange}
                >
                  <option
                    value="today"
                    ?selected=${closed_filter_mode === 'today'}
                  >
                    Today
                  </option>
                  <option value="3" ?selected=${closed_filter_mode === '3'}>
                    Last 3 days
                  </option>
                  <option value="7" ?selected=${closed_filter_mode === '7'}>
                    Last 7 days
                  </option>
                </select>
              </label>`
            : ''}
        </header>
        <div
          class="board-column__body"
          role="list"
          aria-labelledby=${id + '-header'}
        >
          ${repeat(items, (it) => it.id, (it) => cardTemplate(it))}
        </div>
      </section>
    `;
  }

  /**
   * @param {IssueLite} it
   */
  function cardTemplate(it) {
    const health = deriveCardHealth(it);
    const last_comment_ts = deriveLastCommentTimestamp(it);
    const last_comment_label = formatCommentSummary(last_comment_ts);
    const dynamic_state = deriveDynamicDisplayState(it, health);
    const runtime_label = formatRuntimeSummary(dynamic_state.runtime_ms);
    const preview = deriveCardPreview(it);
    if (it.status === 'closed') {
      console.log('[board debug] closed card', it.id, 'metadata:', it.metadata, 'preview:', preview);
    }
    return html`
      <article
        class=${cardClassName(dynamic_state.health)}
        data-issue-id=${it.id}
        data-status=${it.status || ''}
        data-last-comment-ts=${last_comment_ts || ''}
        data-heartbeat-ts=${health.heartbeat_ts || ''}
        data-runtime-base-ms=${dynamic_state.base_runtime_ms || ''}
        data-runtime-ref-ts=${dynamic_state.runtime_ref_ts || ''}
        role="listitem"
        tabindex="-1"
        draggable="true"
        @click=${(/** @type {MouseEvent} */ ev) => onCardClick(ev, it.id)}
        @dragstart=${(/** @type {DragEvent} */ ev) => onDragStart(ev, it.id)}
        @dragend=${onDragEnd}
      >
        <div class="board-card__title text-truncate">
          ${it.title || '(no title)'}
        </div>
        <div class="board-card__meta">
          ${createTypeBadge(it.issue_type)} ${createPriorityBadge(it.priority)}
          ${renderModelProviderBadge(it)}
          ${renderModelChip(it)}
          ${renderWorkerChip(it)}
          ${renderConversationChip(it)}
          ${runtime_label
            ? html`<span class="badge board-card__runtime">${runtime_label}</span>`
            : ''}
          ${last_comment_label
            ? html`<span class="badge board-card__comment-count">
                ${last_comment_label}
              </span>`
            : ''}
          ${createIssueIdRenderer(it.id, { class_name: 'mono' })}
        </div>
        ${dynamic_state.health.indicator !== 'none' || dynamic_state.health.summary
          ? html`<div class="board-card__statusline">
              ${dynamic_state.health.summary
                ? html`<span class="board-card__health">
                    ${dynamic_state.health.summary}
                  </span>`
                : html`<span></span>`}
              ${dynamic_state.health.indicator === 'healthy'
                ? html`<span
                    class="board-card__indicator board-card__indicator--healthy"
                    aria-label="Heartbeat healthy"
                    title="Heartbeat healthy"
                  ></span>`
                : dynamic_state.health.indicator === 'missed'
                  ? html`<span
                      class="board-card__indicator board-card__indicator--missed"
                      aria-label="Heartbeat missed"
                      title="Heartbeat missed"
                    >
                      !
                    </span>`
                  : ''}
            </div>`
          : ''}
        ${(preview.latest_prompt || preview.latest_response || preview.response_pending)
          ? html`<div class="board-card__debug-messages">
              ${preview.latest_prompt
                ? html`<section
                    class="board-card__debug-message board-card__debug-message--prompt markdown-body"
                  >
                    <div class="board-card__preview-label">Latest Prompt</div>
                    ${renderMarkdown(preview.latest_prompt)}
                  </section>`
                : ''}
              ${preview.latest_response
                ? html`<section
                    class="board-card__debug-message board-card__debug-message--response markdown-body"
                  >
                    <div class="board-card__preview-label">Latest Response</div>
                    ${renderMarkdown(preview.latest_response)}
                  </section>`
                : preview.response_pending
                  ? html`<section
                      class="board-card__debug-message board-card__debug-message--response board-card__debug-message--loading"
                    >
                      <div class="board-card__preview-label">Latest Response</div>
                      <div class="board-card__loading">
                        <span
                          class="board-card__loading-spinner"
                          aria-hidden="true"
                        ></span>
                        <span>Generating response…</span>
                      </div>
                    </section>`
                : ''}
            </div>`
          : ''}
      </article>
    `;
  }

  /** @type {string|null} */
  let dragging_id = null;

  /**
   * Handle card click, ignoring clicks during drag operations.
   *
   * @param {MouseEvent} ev
   * @param {string} id
   */
  function onCardClick(ev, id) {
    // Only navigate if this wasn't a drag operation
    if (!dragging_id) {
      gotoIssue(id);
    }
  }

  /**
   * Handle drag start: store issue id in dataTransfer and add dragging class.
   *
   * @param {DragEvent} ev
   * @param {string} id
   */
  function onDragStart(ev, id) {
    dragging_id = id;
    if (ev.dataTransfer) {
      ev.dataTransfer.setData('text/plain', id);
      ev.dataTransfer.effectAllowed = 'move';
    }
    const target = /** @type {HTMLElement} */ (ev.target);
    target.classList.add('board-card--dragging');
    log('dragstart %s', id);
  }

  /**
   * Handle drag end: remove dragging class.
   *
   * @param {DragEvent} ev
   */
  function onDragEnd(ev) {
    const target = /** @type {HTMLElement} */ (ev.target);
    target.classList.remove('board-card--dragging');
    // Clear any highlighted drop target
    clearDropTarget();
    // Clear dragging_id after a short delay to allow click event to check it
    setTimeout(() => {
      dragging_id = null;
    }, 0);
    log('dragend');
  }

  /**
   * Clear the currently highlighted drop target column.
   */
  function clearDropTarget() {
    /** @type {HTMLElement[]} */
    const all_cols = Array.from(
      mount_element.querySelectorAll('.board-column--drag-over')
    );
    for (const c of all_cols) {
      c.classList.remove('board-column--drag-over');
    }
  }

  /**
   * Update issue status via WebSocket transport.
   *
   * @param {string} issue_id
   * @param {'open'|'in_progress'|'closed'} new_status
   */
  async function updateIssueStatus(issue_id, new_status) {
    if (!transport) {
      log('no transport available, status update skipped');
      showToast('Cannot update status: not connected', 'error');
      return;
    }
    try {
      log('update-status %s → %s', issue_id, new_status);
      await transport('update-status', { id: issue_id, status: new_status });
      showToast('Status updated', 'success', 1500);
    } catch (err) {
      log('update-status failed: %o', err);
      showToast('Failed to update status', 'error');
    }
  }

  function doRender() {
    previous_card_positions = captureCardPositions();
    render(template(), mount_element);
    postRenderEnhance();
  }

  /**
   * Enhance rendered board with a11y and keyboard navigation.
   * - Roving tabindex per column (first card tabbable).
   * - ArrowUp/ArrowDown within column.
   * - ArrowLeft/ArrowRight to adjacent non-empty column (focus top card).
   * - Enter/Space to open details for focused card.
   */
  function postRenderEnhance() {
    try {
      const next_debug = isBoardDebugEnabled();
      if (next_debug !== board_debug_enabled) {
        board_debug_enabled = next_debug;
        if (board_debug_enabled) {
          startDebugSimulation();
        } else {
          stopDebugSimulation();
          refreshFromStores();
          return;
        }
      }
      /** @type {Map<string, CardRenderState>} */
      const next_card_state = new Map();
      /** @type {HTMLElement[]} */
      const columns = Array.from(
        mount_element.querySelectorAll('.board-column')
      );
      for (const col of columns) {
        const body = /** @type {HTMLElement|null} */ (
          col.querySelector('.board-column__body')
        );
        if (!body) {
          continue;
        }
        /** @type {HTMLElement[]} */
        const cards = Array.from(body.querySelectorAll('.board-card'));
        // Assign aria-label using column header for screen readers
        const header = /** @type {HTMLElement|null} */ (
          col.querySelector('.board-column__header')
        );
        const col_name = header ? header.textContent?.trim() || '' : '';
        for (const card of cards) {
          const issue_id = String(card.getAttribute('data-issue-id') || '');
          const title_el = /** @type {HTMLElement|null} */ (
            card.querySelector('.board-card__title')
          );
          const t = title_el ? title_el.textContent?.trim() || '' : '';
          const health_el = /** @type {HTMLElement|null} */ (
            card.querySelector('.board-card__health')
          );
          const health_text = health_el ? health_el.textContent?.trim() || '' : '';
          card.setAttribute(
            'aria-label',
            [
              `Issue ${t || '(no title)'}`,
              `Column ${col_name}`,
              health_text
            ]
              .filter(Boolean)
              .join(' - ')
          );
          // Default roving setup
          card.tabIndex = -1;
          next_card_state.set(issue_id, {
            id: issue_id,
            column_id: String(col.id || ''),
            status: String(card.getAttribute('data-status') || ''),
            last_comment_ts: parseNumberAttribute(
              card.getAttribute('data-last-comment-ts')
            ),
            latest_prompt_sig: previewSignature(
              card.querySelector('.board-card__debug-message--prompt')?.textContent || ''
            ),
            latest_response_sig: previewSignature(
              card.querySelector('.board-card__debug-message--response')
                ?.textContent ||
                (card.querySelector('.board-card__debug-message--loading')
                  ? '__pending__'
                  : '')
            ),
            heartbeat_ts: parseNumberAttribute(
              card.getAttribute('data-heartbeat-ts')
            )
          });
        }
        if (cards.length > 0) {
          cards[0].tabIndex = 0;
        }
        const count_badge = /** @type {HTMLElement|null} */ (
          col.querySelector('.board-column__count')
        );
        const next_count = cards.length;
        const prev_count = previous_column_counts.get(String(col.id || ''));
        if (count_badge && prev_count !== undefined && prev_count !== next_count) {
          restartAnimation(count_badge, 'board-column__count--bump');
        }
        previous_column_counts.set(String(col.id || ''), next_count);
      }
      for (const [id, next] of next_card_state.entries()) {
        const card = /** @type {HTMLElement|null} */ (
          mount_element.querySelector(`.board-card[data-issue-id="${id}"]`)
        );
        if (!card) {
          continue;
        }
        const prev = previous_card_state.get(id);
        const heartbeat_indicator = /** @type {HTMLElement|null} */ (
          card.querySelector('.board-card__indicator--healthy')
        );
        const has_comment_delta = Boolean(
          prev &&
            next.status !== 'closed' &&
            Number.isFinite(next.last_comment_ts) &&
            (!Number.isFinite(prev.last_comment_ts) ||
              /** @type {number} */ (next.last_comment_ts) >
                /** @type {number|null} */ (prev.last_comment_ts ?? -1))
        );
        const has_prompt_delta = Boolean(
          prev && next.latest_prompt_sig !== prev.latest_prompt_sig
        );
        const has_response_delta = Boolean(
          prev && next.latest_response_sig !== prev.latest_response_sig
        );
        const has_status_delta = Boolean(prev && next.status !== prev.status);
        const has_column_delta = Boolean(
          prev && next.column_id !== prev.column_id
        );
        const has_heartbeat_delta = Boolean(
          prev &&
            Number.isFinite(next.heartbeat_ts) &&
            Number.isFinite(prev.heartbeat_ts) &&
            /** @type {number} */ (next.heartbeat_ts) >
              /** @type {number} */ (prev.heartbeat_ts)
        );
        if (!prev) {
          restartAnimation(card, 'board-card--entering');
        } else if (
          has_comment_delta ||
          has_status_delta ||
          has_column_delta ||
          has_heartbeat_delta
        ) {
          if (has_comment_delta) {
            const prompt_panel = /** @type {HTMLElement|null} */ (
              card.querySelector('.board-card__debug-message--prompt')
            );
            const response_panel = /** @type {HTMLElement|null} */ (
              card.querySelector('.board-card__debug-message--response')
            );
            if (has_prompt_delta && prompt_panel) {
              restartAnimation(
                prompt_panel,
                'board-card__debug-message--updated'
              );
            }
            if (has_response_delta && response_panel) {
              restartAnimation(
                response_panel,
                'board-card__debug-message--updated'
              );
            }
            const comment_chip = /** @type {HTMLElement|null} */ (
              card.querySelector('.board-card__comment-count')
            );
            if (comment_chip) {
              restartAnimation(comment_chip, 'board-card__comment-count--updated');
            }
          } else if (has_column_delta) {
            restartAnimation(card, 'board-card--column-enter');
          } else {
            restartAnimation(card, 'board-card--updated');
          }
          void has_status_delta;
          void has_column_delta;
          if (has_heartbeat_delta && heartbeat_indicator) {
            restartAnimation(
              heartbeat_indicator,
              'board-card__indicator--heartbeat-pulse'
            );
          }
        }
      }
      updateDynamicDisplays();
      previous_card_state = next_card_state;
    } catch {
      // non-fatal
    }
  }

  function ensureDisplayTimer() {
    if (display_timer !== null) {
      return;
    }
    display_timer = window.setInterval(() => {
      updateDynamicDisplays();
    }, 1000);
  }

  function stopDisplayTimer() {
    if (display_timer !== null) {
      window.clearInterval(display_timer);
      display_timer = null;
    }
  }

  function updateDynamicDisplays() {
    /** @type {HTMLElement[]} */
    const cards = Array.from(mount_element.querySelectorAll('.board-card'));
    for (const card of cards) {
      const status = String(card.getAttribute('data-status') || '');
      if (status === 'closed') {
        continue;
      }
      const heartbeat_ts = parseNumberAttribute(
        card.getAttribute('data-heartbeat-ts')
      );
      const base_runtime_ms = parseNumberAttribute(
        card.getAttribute('data-runtime-base-ms')
      );
      const runtime_ref_ts = parseNumberAttribute(
        card.getAttribute('data-runtime-ref-ts')
      );
      const runtime_ms =
        Number.isFinite(base_runtime_ms) && Number.isFinite(runtime_ref_ts)
          ? Math.max(
              0,
              /** @type {number} */ (base_runtime_ms) +
                (Date.now() - /** @type {number} */ (runtime_ref_ts))
            )
          : base_runtime_ms;
      const heartbeat_age_ms =
        Number.isFinite(heartbeat_ts) && heartbeat_ts !== null
          ? Date.now() - heartbeat_ts
          : null;
      const dynamic_health = deriveHealthFromDisplayState(status, runtime_ms, heartbeat_ts, heartbeat_age_ms);

      const runtime_chip = /** @type {HTMLElement|null} */ (
        card.querySelector('.board-card__runtime')
      );
      if (runtime_chip) {
        const next = formatRuntimeSummary(runtime_ms);
        if (runtime_chip.textContent !== next) {
          runtime_chip.textContent = next;
        }
      }
      const health_chip = /** @type {HTMLElement|null} */ (
        card.querySelector('.board-card__health')
      );
      if (health_chip) {
        const next = dynamic_health.summary;
        if (health_chip.textContent !== next) {
          health_chip.textContent = next;
        }
      }
      syncCardHealthClasses(card, dynamic_health);
    }
  }

  function replayDebugAnimations() {
    /** @type {HTMLElement[]} */
    const cards = Array.from(mount_element.querySelectorAll('.board-card'));
    for (const sample of cards) {
      restartAnimation(sample, 'board-card--updated');
      const indicator = /** @type {HTMLElement|null} */ (
        sample.querySelector('.board-card__indicator--healthy')
      );
      if (indicator) {
        restartAnimation(
          indicator,
          'board-card__indicator--heartbeat-pulse'
        );
      }
    }
    /** @type {HTMLElement[]} */
    const counts = Array.from(
      mount_element.querySelectorAll('.board-column__count')
    );
    for (const count of counts) {
      restartAnimation(count, 'board-column__count--bump');
    }
  }

  function startDebugSimulation() {
    stopDebugSimulation();
    debug_sequence = 2;
    debug_issues = DEBUG_SIMULATION_INITIAL.map((issue) => ({
      ...issue,
      last_comment_at:
        issue.comment_count && issue.comment_count > 0
          ? new Date(Date.now() - 3 * 60 * 1000).toISOString()
          : undefined
    }));
    comment_timestamp_cache = new Map(
      debug_issues.map((issue) => [issue.id, deriveLastCommentTimestamp(issue)])
    );
    refreshFromDebugSimulation();
    debug_timers.push(
      window.setInterval(() => {
        const healthy = debug_issues.find((issue) => issue.id === 'DBG-P1');
        if (healthy) {
          healthy.updated_at = Date.now();
          healthy.labels = replaceLabels(
            healthy.labels,
            new Date(),
            '18m'
          );
          if (Math.random() > 0.55) {
            healthy.comment_count = Number(healthy.comment_count || 0) + 1;
            healthy.last_comment_at = new Date().toISOString();
          }
          refreshFromDebugSimulation();
        }
      }, 3000)
    );
    debug_timers.push(
      window.setInterval(() => {
        mutateDebugSimulation();
        refreshFromDebugSimulation();
      }, 4200)
    );
  }

  function stopDebugSimulation() {
    for (const timer of debug_timers) {
      window.clearInterval(timer);
    }
    debug_timers = [];
  }

  function refreshFromDebugSimulation() {
    list_blocked = debug_issues
      .filter((issue) => issue.status === 'open' && hasLane(issue, 'blocked'))
      .sort(cmpPriorityThenCreated);
    list_ready = debug_issues
      .filter((issue) => issue.status === 'open' && !hasLane(issue, 'blocked'))
      .sort(cmpPriorityThenCreated);
    list_in_progress = debug_issues
      .filter((issue) => issue.status === 'in_progress')
      .sort(cmpPriorityThenCreated);
    list_closed_raw = debug_issues
      .filter((issue) => issue.status === 'closed')
      .sort(cmpClosedDesc);
    applyClosedFilter();
    doRender();
  }

  function mutateDebugSimulation() {
    const random = Math.random();
    if (random < 0.24) {
      addRandomDebugIssue();
      return;
    }
    /** @type {IssueLite[]} */
    const movable = debug_issues.filter((issue) => issue.id !== 'DBG-P1');
    if (movable.length === 0) {
      return;
    }
    const target = movable[Math.floor(Math.random() * movable.length)];
    if (target.status === 'open' && hasLane(target, 'blocked')) {
      target.labels = withoutLane(target.labels);
      target.updated_at = Date.now();
      target.comment_count = Number(target.comment_count || 0) + 1;
      target.last_comment_at = new Date().toISOString();
      return;
    }
    if (target.status === 'open') {
      target.status = 'in_progress';
      target.updated_at = Date.now();
      target.labels = replaceLabels(target.labels, new Date(), randomRuntime());
      return;
    }
    if (target.status === 'in_progress') {
      if (Math.random() < 0.3) {
        target.labels = replaceLabels(
          target.labels,
          new Date(Date.now() - 18 * 60 * 1000),
          '2h14m'
        );
        target.updated_at = Date.now();
        target.comment_count = Number(target.comment_count || 0) + 1;
        target.last_comment_at = new Date().toISOString();
        return;
      }
      target.status = 'closed';
      target.closed_at = Date.now();
      target.updated_at = Date.now();
      return;
    }
    if (target.status === 'closed') {
      target.status = 'open';
      target.closed_at = undefined;
      target.updated_at = Date.now();
      target.labels = ['debug', 'lane:ready'];
    }
  }

  function addRandomDebugIssue() {
    const id = `DBG-N${debug_sequence++}`;
    const blocked = Math.random() < 0.35;
    debug_issues.unshift({
      id,
      title: blocked
        ? `Generated blocked task ${id}`
        : `Generated ready task ${id}`,
      status: 'open',
      priority: Math.floor(Math.random() * 3),
      issue_type: Math.random() < 0.5 ? 'task' : 'feature',
      comment_count: Math.floor(Math.random() * 3),
      created_at: Date.now(),
      updated_at: Date.now(),
      last_comment_at:
        Math.random() > 0.5
          ? new Date(Date.now() - 90 * 1000).toISOString()
          : undefined,
      labels: ['debug', blocked ? 'lane:blocked' : 'lane:ready']
    });
  }

  /**
   * @param {IssueLite[]} issues
   */
  function scheduleCommentMetadataRefresh(issues) {
    if (board_debug_enabled || !transport) {
      return;
    }
    for (const issue of issues) {
      const issue_id = String(issue.id || '');
      if (!issue_id) {
        continue;
      }
      const count = Number(issue.comment_count || 0);
      if (count <= 0) {
        comment_timestamp_cache.set(issue_id, null);
        comment_preview_cache.delete(issue_id);
        issue.last_comment_at = undefined;
        continue;
      }
      const cached = comment_timestamp_cache.get(issue_id);
      if (cached !== undefined) {
        issue.last_comment_at = cached
          ? new Date(cached).toISOString()
          : undefined;
      }
      const preview = comment_preview_cache.get(issue_id);
      void preview;
      if (
        (comment_timestamp_cache.has(issue_id) &&
          !(Number.isFinite(issue.updated_at) &&
            (!Number.isFinite(cached) ||
              /** @type {number} */ (issue.updated_at) >
                /** @type {number} */ (cached))) ) ||
        pending_comment_fetches.has(issue_id)
      ) {
        continue;
      }
      pending_comment_fetches.add(issue_id);
      void transport('get-comments', { id: issue_id })
        .then((comments) => {
          const last_comment_ts = latestCommentTimestamp(comments);
          const preview = latestCommentPreview(comments);
          comment_timestamp_cache.set(issue_id, last_comment_ts);
          comment_preview_cache.set(issue_id, preview);
          const target = findIssueById(issue_id);
          if (target) {
            target.last_comment_at = last_comment_ts
              ? new Date(last_comment_ts).toISOString()
              : undefined;
          }
          doRender();
        })
        .catch(() => {
          comment_timestamp_cache.set(issue_id, null);
          comment_preview_cache.delete(issue_id);
        })
        .finally(() => {
          pending_comment_fetches.delete(issue_id);
        });
    }
  }

  /**
   * @param {IssueLite[]} issues
   */
  function scheduleIssueMetadataRefresh(issues) {
    if (board_debug_enabled || !transport) {
      return;
    }
    for (const issue of issues) {
      const issue_id = String(issue.id || '');
      if (!issue_id) {
        continue;
      }
      const cached = issue_metadata_cache.get(issue_id);
      if (cached && typeof cached === 'object') {
        issue.metadata = cached;
      }
      if (issue_metadata_cache.has(issue_id) || pending_issue_metadata_fetches.has(issue_id)) {
        continue;
      }
      pending_issue_metadata_fetches.add(issue_id);
      void transport('get-issue', { id: issue_id })
        .then((result) => {
          const shown = Array.isArray(result) ? result[0] : result;
          const metadata =
            shown && typeof shown === 'object' && shown.metadata && typeof shown.metadata === 'object'
              ? /** @type {Record<string, unknown>} */ (shown.metadata)
              : null;
          issue_metadata_cache.set(issue_id, metadata);
          const target = findIssueById(issue_id);
          if (target) {
            target.metadata = metadata || undefined;
          }
          doRender();
        })
        .catch(() => {
          issue_metadata_cache.set(issue_id, null);
        })
        .finally(() => {
          pending_issue_metadata_fetches.delete(issue_id);
        });
    }
  }

  /**
   * @param {string} issue_id
   * @returns {IssueLite|undefined}
   */
  function findIssueById(issue_id) {
    return [
      ...list_blocked,
      ...list_ready,
      ...list_in_progress,
      ...list_closed_raw,
      ...debug_issues
    ].find((issue) => String(issue.id) === issue_id);
  }

  // Delegate keyboard handling from mount_element
  mount_element.addEventListener('keydown', (ev) => {
    const target = ev.target;
    if (!target || !(target instanceof HTMLElement)) {
      return;
    }
    // Do not intercept keys inside editable controls
    const tag = String(target.tagName || '').toLowerCase();
    if (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      target.isContentEditable === true
    ) {
      return;
    }
    const card = target.closest('.board-card');
    if (!card) {
      return;
    }
    const key = String(ev.key || '');
    if (key === 'Enter' || key === ' ') {
      ev.preventDefault();
      const id = card.getAttribute('data-issue-id');
      if (id) {
        gotoIssue(id);
      }
      return;
    }
    if (
      key !== 'ArrowUp' &&
      key !== 'ArrowDown' &&
      key !== 'ArrowLeft' &&
      key !== 'ArrowRight'
    ) {
      return;
    }
    ev.preventDefault();
    // Column context
    const col = /** @type {HTMLElement|null} */ (card.closest('.board-column'));
    if (!col) {
      return;
    }
    const body = col.querySelector('.board-column__body');
    if (!body) {
      return;
    }
    /** @type {HTMLElement[]} */
    const cards = Array.from(body.querySelectorAll('.board-card'));
    const idx = cards.indexOf(/** @type {HTMLElement} */ (card));
    if (idx === -1) {
      return;
    }
    if (key === 'ArrowDown' && idx < cards.length - 1) {
      moveFocus(cards[idx], cards[idx + 1]);
      return;
    }
    if (key === 'ArrowUp' && idx > 0) {
      moveFocus(cards[idx], cards[idx - 1]);
      return;
    }
    if (key === 'ArrowRight' || key === 'ArrowLeft') {
      // Find adjacent column with at least one card
      /** @type {HTMLElement[]} */
      const cols = Array.from(mount_element.querySelectorAll('.board-column'));
      const col_idx = cols.indexOf(col);
      if (col_idx === -1) {
        return;
      }
      const dir = key === 'ArrowRight' ? 1 : -1;
      let next_idx = col_idx + dir;
      /** @type {HTMLElement|null} */
      let target_col = null;
      while (next_idx >= 0 && next_idx < cols.length) {
        const candidate = cols[next_idx];
        const c_body = /** @type {HTMLElement|null} */ (
          candidate.querySelector('.board-column__body')
        );
        const c_cards = c_body
          ? Array.from(c_body.querySelectorAll('.board-card'))
          : [];
        if (c_cards.length > 0) {
          target_col = candidate;
          break;
        }
        next_idx += dir;
      }
      if (target_col) {
        const first = /** @type {HTMLElement|null} */ (
          target_col.querySelector('.board-column__body .board-card')
        );
        if (first) {
          moveFocus(/** @type {HTMLElement} */ (card), first);
        }
      }
      return;
    }
  });

  // Track the currently highlighted column to avoid flicker
  /** @type {HTMLElement|null} */
  let current_drop_target = null;

  // Delegate drag and drop handling for columns
  mount_element.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    if (ev.dataTransfer) {
      ev.dataTransfer.dropEffect = 'move';
    }
    // Find the column being dragged over
    const target = /** @type {HTMLElement} */ (ev.target);
    const col = /** @type {HTMLElement|null} */ (
      target.closest('.board-column')
    );

    // Only update if we've entered a different column
    if (col && col !== current_drop_target) {
      // Remove highlight from previous column
      if (current_drop_target) {
        current_drop_target.classList.remove('board-column--drag-over');
      }
      // Highlight the new column
      col.classList.add('board-column--drag-over');
      current_drop_target = col;
    }
  });

  mount_element.addEventListener('dragleave', (ev) => {
    const related = /** @type {HTMLElement|null} */ (ev.relatedTarget);
    // Only clear if we're leaving the mount element entirely
    if (!related || !mount_element.contains(related)) {
      if (current_drop_target) {
        current_drop_target.classList.remove('board-column--drag-over');
        current_drop_target = null;
      }
    }
  });

  mount_element.addEventListener('drop', (ev) => {
    ev.preventDefault();
    // Clear the drop target highlight
    if (current_drop_target) {
      current_drop_target.classList.remove('board-column--drag-over');
      current_drop_target = null;
    }

    const target = /** @type {HTMLElement} */ (ev.target);
    const col = target.closest('.board-column');
    if (!col) {
      return;
    }

    const col_id = col.id;
    const new_status = COLUMN_STATUS_MAP[col_id];
    if (!new_status) {
      log('drop on unknown column: %s', col_id);
      return;
    }

    const issue_id = ev.dataTransfer?.getData('text/plain');
    if (!issue_id) {
      log('drop without issue id');
      return;
    }

    log('drop %s on %s → %s', issue_id, col_id, new_status);
    void updateIssueStatus(issue_id, new_status);
  });

  /**
   * @param {HTMLElement} from
   * @param {HTMLElement} to
   */
  function moveFocus(from, to) {
    try {
      from.tabIndex = -1;
      to.tabIndex = 0;
      to.focus();
    } catch {
      // ignore focus errors
    }
  }

  // Sort helpers centralized in app/data/sort.js

  /**
   * Recompute closed list from raw using the current filter and sort.
   */
  function applyClosedFilter() {
    log('applyClosedFilter %s', closed_filter_mode);
    /** @type {IssueLite[]} */
    let items = Array.isArray(list_closed_raw) ? [...list_closed_raw] : [];
    const now = new Date();
    let since_ts = 0;
    if (closed_filter_mode === 'today') {
      const start = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0
      );
      since_ts = start.getTime();
    } else if (closed_filter_mode === '3') {
      since_ts = now.getTime() - 3 * 24 * 60 * 60 * 1000;
    } else if (closed_filter_mode === '7') {
      since_ts = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    }
    items = items.filter((it) => {
      const s = Number.isFinite(it.closed_at)
        ? /** @type {number} */ (it.closed_at)
        : NaN;
      if (!Number.isFinite(s)) {
        return false;
      }
      return s >= since_ts;
    });
    items.sort(cmpClosedDesc);
    list_closed = items;
  }

  /**
   * @param {Event} ev
   */
  function onClosedFilterChange(ev) {
    try {
      const el = /** @type {HTMLSelectElement} */ (ev.target);
      const v = String(el.value || 'today');
      closed_filter_mode = v === '3' || v === '7' ? v : 'today';
      log('closed filter %s', closed_filter_mode);
      if (store) {
        try {
          store.setState({ board: { closed_filter: closed_filter_mode } });
        } catch {
          // ignore store errors
        }
      }
      scheduleCommentMetadataRefresh([
        ...list_blocked,
        ...list_ready,
        ...list_in_progress,
        ...list_closed_raw
      ]);
      scheduleIssueMetadataRefresh([
        ...list_blocked,
        ...list_ready,
        ...list_in_progress,
        ...list_closed_raw
      ]);
      applyClosedFilter();
      doRender();
    } catch {
      // ignore
    }
  }

  /**
   * Compose lists from subscriptions + issues store and render.
   */
  function refreshFromStores() {
    if (board_debug_enabled) {
      refreshFromDebugSimulation();
      return;
    }
    try {
      if (selectors) {
        const in_progress = selectors.selectBoardColumn(
          'tab:board:in-progress',
          'in_progress'
        );
        const blocked = selectors.selectBoardColumn(
          'tab:board:blocked',
          'blocked'
        );
        const ready_raw = selectors.selectBoardColumn(
          'tab:board:ready',
          'ready'
        );
        const closed = selectors.selectBoardColumn(
          'tab:board:closed',
          'closed'
        );

        // Ready excludes items that are in progress
        /** @type {Set<string>} */
        const in_prog_ids = new Set(in_progress.map((i) => i.id));
        const ready = ready_raw.filter((i) => !in_prog_ids.has(i.id));

        list_ready = ready;
        list_blocked = blocked;
        list_in_progress = in_progress;
        list_closed_raw = closed;
      }
      scheduleCommentMetadataRefresh([
        ...list_blocked,
        ...list_ready,
        ...list_in_progress,
        ...list_closed_raw
      ]);
      scheduleIssueMetadataRefresh([
        ...list_blocked,
        ...list_ready,
        ...list_in_progress,
        ...list_closed_raw
      ]);
      applyClosedFilter();
      doRender();
    } catch {
      list_ready = [];
      list_blocked = [];
      list_in_progress = [];
      list_closed = [];
      doRender();
    }
  }

  // Live updates: recompose on issue store envelopes
  if (selectors) {
    selectors.subscribe(() => {
      try {
        refreshFromStores();
      } catch {
        // ignore
      }
    });
  }

  window.addEventListener('beads-ui:board-debug-changed', () => {
    const next_debug = isBoardDebugEnabled();
    if (next_debug) {
      board_debug_enabled = true;
      startDebugSimulation();
      doRender();
      return;
    }
    board_debug_enabled = false;
    stopDebugSimulation();
    refreshFromStores();
  });

  return {
    async load() {
      // Compose lists from subscriptions + issues store
      log('load');
      ensureDisplayTimer();
      board_debug_enabled = isBoardDebugEnabled();
      if (board_debug_enabled) {
        startDebugSimulation();
        return;
      }
      refreshFromStores();
      // If nothing is present yet (e.g., immediately after switching back
      // to the Board and before list-delta arrives), fetch via data layer as
      // a fallback so the board is not empty on initial display.
      try {
        const has_subs = Boolean(subscriptions && subscriptions.selectors);
        /**
         * @param {string} id
         */
        const cnt = (id) => {
          if (!has_subs || !subscriptions) {
            return 0;
          }
          const sel = subscriptions.selectors;
          if (typeof sel.count === 'function') {
            return Number(sel.count(id) || 0);
          }
          try {
            const arr = sel.getIds(id);
            return Array.isArray(arr) ? arr.length : 0;
          } catch {
            return 0;
          }
        };
        const total_items =
          cnt('tab:board:ready') +
          cnt('tab:board:blocked') +
          cnt('tab:board:in-progress') +
          cnt('tab:board:closed');
        const data = /** @type {any} */ (_data);
        const can_fetch =
          data &&
          typeof data.getReady === 'function' &&
          typeof data.getBlocked === 'function' &&
          typeof data.getInProgress === 'function' &&
          typeof data.getClosed === 'function';
        if (total_items === 0 && can_fetch) {
          log('fallback fetch');
          /** @type {[IssueLite[], IssueLite[], IssueLite[], IssueLite[]]} */
          const [ready_raw, blocked_raw, in_prog_raw, closed_raw] =
            await Promise.all([
              data.getReady().catch(() => []),
              data.getBlocked().catch(() => []),
              data.getInProgress().catch(() => []),
              data.getClosed().catch(() => [])
            ]);
          // Normalize and map unknowns to IssueLite shape
          /** @type {IssueLite[]} */
          let ready = Array.isArray(ready_raw) ? ready_raw.map((it) => it) : [];
          /** @type {IssueLite[]} */
          const blocked = Array.isArray(blocked_raw)
            ? blocked_raw.map((it) => it)
            : [];
          /** @type {IssueLite[]} */
          const in_prog = Array.isArray(in_prog_raw)
            ? in_prog_raw.map((it) => it)
            : [];
          /** @type {IssueLite[]} */
          const closed = Array.isArray(closed_raw)
            ? closed_raw.map((it) => it)
            : [];

          // Remove items from Ready that are already In Progress
          /** @type {Set<string>} */
          const in_progress_ids = new Set(in_prog.map((i) => i.id));
          ready = ready.filter((i) => !in_progress_ids.has(i.id));

          // Sort as per column rules
          ready.sort(cmpPriorityThenCreated);
          blocked.sort(cmpPriorityThenCreated);
          in_prog.sort(cmpPriorityThenCreated);
          list_ready = ready;
          list_blocked = blocked;
          list_in_progress = in_prog;
          list_closed_raw = closed;
          scheduleCommentMetadataRefresh([
            ...list_blocked,
            ...list_ready,
            ...list_in_progress,
            ...list_closed_raw
          ]);
          scheduleIssueMetadataRefresh([
            ...list_blocked,
            ...list_ready,
            ...list_in_progress,
            ...list_closed_raw
          ]);
          applyClosedFilter();
          doRender();
        }
      } catch {
        // ignore fallback errors
      }
    },
    clear() {
      stopDisplayTimer();
      stopDebugSimulation();
      pending_comment_fetches.clear();
      pending_issue_metadata_fetches.clear();
      issue_metadata_cache.clear();
      mount_element.replaceChildren();
      list_ready = [];
      list_blocked = [];
      list_in_progress = [];
      list_closed = [];
    }
  };
}

/**
 * @param {IssueLite} issue
 * @param {string} lane
 * @returns {boolean}
 */
function hasLane(issue, lane) {
  return Array.isArray(issue.labels)
    ? issue.labels.includes(`lane:${lane}`)
    : false;
}

/**
 * @param {string[]|undefined} labels
 * @returns {string[]}
 */
function withoutLane(labels) {
  const next = Array.isArray(labels) ? labels.filter((label) => !/^lane:/.test(label)) : [];
  next.push('debug');
  return next;
}

/**
 * @param {string[]|undefined} labels
 * @param {Date} heartbeat
 * @param {string} runtime
 * @returns {string[]}
 */
function replaceLabels(labels, heartbeat, runtime) {
  /** @type {string[]} */
  const next = Array.isArray(labels)
    ? labels.filter(
        (label) =>
          !String(label).startsWith(HEARTBEAT_LABEL_PREFIX) &&
          !String(label).startsWith(RUNTIME_LABEL_PREFIX)
      )
    : [];
  if (!next.includes('debug')) {
    next.push('debug');
  }
  next.push(`${HEARTBEAT_LABEL_PREFIX}${heartbeat.toISOString()}`);
  next.push(`${RUNTIME_LABEL_PREFIX}${runtime}`);
  return next;
}

/**
 * @returns {string}
 */
function randomRuntime() {
  const minutes = 4 + Math.floor(Math.random() * 90);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h${rem}m` : `${hours}h`;
}

/**
 * @param {IssueLite} issue
 * @returns {number|null}
 */
function deriveLastCommentTimestamp(issue) {
  if (typeof issue.last_comment_at === 'string' && issue.last_comment_at) {
    const parsed = Date.parse(issue.last_comment_at);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

/**
 * @param {unknown} comments
 * @returns {number|null}
 */
function latestCommentTimestamp(comments) {
  if (!Array.isArray(comments) || comments.length === 0) {
    return null;
  }
  let latest = null;
  for (const comment of comments) {
    const created_at =
      comment && typeof comment === 'object'
        ? /** @type {{ created_at?: unknown }} */ (comment).created_at
        : undefined;
    if (typeof created_at !== 'string' || created_at.length === 0) {
      continue;
    }
    const parsed = Date.parse(created_at);
    if (!Number.isFinite(parsed)) {
      continue;
    }
    latest = latest === null ? parsed : Math.max(latest, parsed);
  }
  return latest;
}

/**
 * @param {unknown} comments
 * @returns {{ latest_prompt?: string, latest_response?: string, response_pending?: boolean }}
 */
function latestCommentPreview(comments) {
  if (!Array.isArray(comments) || comments.length === 0) {
    return {};
  }
  const sorted = comments
    .filter((comment) => comment && typeof comment === 'object')
    .slice()
    .sort((a, b) => {
      const a_ts = Date.parse(
        String((/** @type {{ created_at?: unknown }} */ (a)).created_at || '')
      );
      const b_ts = Date.parse(
        String((/** @type {{ created_at?: unknown }} */ (b)).created_at || '')
      );
      return a_ts - b_ts;
    });
  const entries = sorted.map((comment) => ({
    text: String((/** @type {{ text?: unknown }} */ (comment)).text || '').trim()
  }));
  const last = entries[entries.length - 1];
  const previous = entries.length > 1 ? entries[entries.length - 2] : null;
  const last_is_response = isResponseComment(last.text);
  const last_is_prompt = isPromptComment(last.text);
  let prompt = undefined;
  let response = undefined;
  let response_pending = false;

  if (last_is_prompt && !last_is_response) {
    prompt = last.text;
    response_pending = true;
  } else if (last_is_response) {
    response = collectTrailingResponse(entries);
    const prior_prompt = findPreviousPrompt(entries, entries.length - 1);
    prompt = prior_prompt || undefined;
  } else if (entries.length % 2 === 1) {
    prompt = last.text;
    response_pending = true;
  } else {
    response = last.text;
    prompt = previous ? previous.text : undefined;
  }

  return {
    latest_prompt: prompt,
    latest_response: response || undefined,
    response_pending
  };
}

/**
 * @param {IssueLite} issue
 * @returns {{ latest_prompt?: string, latest_response?: string, response_pending?: boolean }}
 */
function deriveCardPreview(issue) {
  const metadata_prompt = readMetadataValue(issue, [
    'latest_prompt',
    'latest.prompt'
  ]);
  const metadata_response = readMetadataValue(issue, [
    'latest_response',
    'latest.response'
  ]);
  const metadata_pending =
    Boolean(metadata_prompt) &&
    !metadata_response &&
    issue.status === 'in_progress';
  return {
    latest_prompt: clipPromptPreview(metadata_prompt),
    latest_response: clipResponsePreview(metadata_response),
    response_pending: metadata_pending
  };
}

/**
 * @param {string|undefined} markdown
 * @returns {string}
 */
function clipPromptPreview(markdown) {
  const text = String(markdown || '').trim();
  if (!text) {
    return '';
  }
  const lines = text.split('\n');
  if (lines.length <= 20) {
    return text;
  }
  return lines.slice(0, 20).join('\n').trim() + '\n\n...';
}

/**
 * @param {string|undefined} markdown
 * @returns {string}
 */
function clipResponsePreview(markdown) {
  const text = String(markdown || '').trim();
  if (!text) {
    return '';
  }
  const lines = text.split('\n');
  if (lines.length <= 20) {
    return text;
  }
  return '...\n\n' + lines.slice(-20).join('\n').trim();
}

/**
 * @param {string|undefined} markdown
 * @returns {string}
 */
function clipNotesResponsePreview(markdown) {
  const text = String(markdown || '').trim();
  if (!text) {
    return '';
  }
  const lines = text.split('\n');
  if (lines.length <= 15) {
    return text;
  }
  return '...\n\n' + lines.slice(-15).join('\n').trim();
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isResponseComment(text) {
  const normalized = String(text || '').trim().toLowerCase();
  return (
    normalized.startsWith('[agent output') ||
    normalized.startsWith('response:') ||
    normalized.startsWith('assistant:') ||
    normalized.startsWith('## response') ||
    normalized.startsWith('**response**') ||
    normalized.startsWith('**latest response**')
  );
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isPromptComment(text) {
  const normalized = String(text || '').trim().toLowerCase();
  return (
    normalized.startsWith('prompt:') ||
    normalized.startsWith('user:') ||
    normalized.startsWith('## prompt') ||
    normalized.startsWith('**prompt**') ||
    normalized.startsWith('**latest prompt**')
  );
}

/**
 * @param {Array<{ text: string }>} entries
 * @returns {string}
 */
function collectTrailingResponse(entries) {
  /** @type {string[]} */
  const chunks = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const text = entries[index].text;
    if (index !== entries.length - 1 && !isResponseComment(text)) {
      break;
    }
    chunks.unshift(text);
    if (index !== entries.length - 1 && isPromptComment(text)) {
      break;
    }
    if (index !== entries.length - 1 && !isResponseComment(text)) {
      break;
    }
  }
  return chunks.join('\n\n').trim();
}

/**
 * @param {Array<{ text: string }>} entries
 * @param {number} from_index
 * @returns {string}
 */
function findPreviousPrompt(entries, from_index) {
  for (let index = from_index - 1; index >= 0; index -= 1) {
    const text = entries[index].text;
    if (isPromptComment(text)) {
      return text;
    }
    if (!isResponseComment(text)) {
      return text;
    }
  }
  return '';
}

/**
 * @param {number|null} comment_ts
 * @returns {string}
 */
function formatCommentSummary(comment_ts) {
  if (!Number.isFinite(comment_ts)) {
    return '';
  }
  return `Comment ${formatDuration(Date.now() - /** @type {number} */ (comment_ts))} ago`;
}

/**
 * @param {number|null} runtime_ms
 * @returns {string}
 */
function formatRuntimeSummary(runtime_ms) {
  if (!Number.isFinite(runtime_ms)) {
    return '';
  }
  return `Alive ${formatDuration(/** @type {number} */ (runtime_ms))}`;
}

/**
 * @param {string} text
 * @returns {string}
 */
function previewSignature(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  return normalized.slice(-240);
}

/**
 * @param {IssueLite} issue
 * @returns {import('lit-html').TemplateResult | string}
 */
function renderWorkerChip(issue) {
  const worker = deriveWorkerIdentity(issue);
  if (!worker) {
    return '';
  }
  return html`<span class="badge board-card__worker">${worker}</span>`;
}

/**
 * @param {IssueLite} issue
 * @returns {import('lit-html').TemplateResult | string}
 */
function renderConversationChip(issue) {
  const conversation_id = deriveConversationId(issue);
  if (!conversation_id) {
    return '';
  }
  return html`<span
    class="badge board-card__conversation mono"
    title=${conversation_id}
  >
    Conv ${conversation_id}
  </span>`;
}

/**
 * @param {IssueLite} issue
 * @returns {import('lit-html').TemplateResult | string}
 */
function renderModelProviderBadge(issue) {
  const provider = deriveModelProvider(issue);
  if (!provider) {
    return '';
  }
  const label = providerLabel(provider);
  return html`<span
    class=${`badge board-card__provider board-card__provider--${provider}`}
    title=${label}
    aria-label=${label}
  >
    ${providerIcon(provider)}
  </span>`;
}

/**
 * @param {IssueLite} issue
 * @returns {import('lit-html').TemplateResult | string}
 */
function renderModelChip(issue) {
  const model = deriveModelName(issue);
  if (!model) {
    return '';
  }
  return html`<span class="badge board-card__model" title=${model}>${model}</span>`;
}

/**
 * @param {IssueLite} issue
 * @returns {string}
 */
function deriveWorkerIdentity(issue) {
  const metadata_worker = readMetadataValue(issue, [
    'agent_name',
    'agent.name',
    'worker',
    'worker_name',
    'worker.name'
  ]);
  const metadata_pid = readMetadataValue(issue, [
    'background_pid',
    'background.pid',
    'pid'
  ]);
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  const pid_label = readLabelValue(labels, ['pid:', 'process:', 'worker-pid:']);
  const worker_label = readLabelValue(labels, [
    'worker:',
    'agent:',
    'runner:',
    'background-worker:'
  ]);
  const worker = metadata_worker || worker_label || issue.assignee || '';
  const pid = metadata_pid || pid_label;
  if (worker && pid) {
    return `${worker} · PID ${pid}`;
  }
  if (pid) {
    return `PID ${pid}`;
  }
  return worker;
}

/**
 * @param {IssueLite} issue
 * @returns {string}
 */
function deriveConversationId(issue) {
  return readMetadataValue(issue, ['conversation_id', 'conversation.id']);
}

/**
 * @param {IssueLite} issue
 * @returns {'openai'|'claude'|'gemini'|''}
 */
function deriveModelProvider(issue) {
  const explicit = readMetadataValue(issue, [
    'model_provider',
    'model.provider'
  ]);
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  const fallback = readLabelValue(labels, [MODEL_PROVIDER_LABEL_PREFIX]);
  const normalized = String(explicit || fallback || '')
    .trim()
    .toLowerCase();
  if (
    normalized === 'openai' ||
    normalized === 'codex' ||
    normalized === 'gpt'
  ) {
    return 'openai';
  }
  if (normalized === 'claude' || normalized === 'anthropic') {
    return 'claude';
  }
  if (normalized === 'gemini' || normalized === 'google') {
    return 'gemini';
  }
  const model = deriveModelName(issue).toLowerCase();
  if (model.includes('gpt') || model.includes('o1') || model.includes('o3') || model.includes('o4')) {
    return 'openai';
  }
  if (model.includes('claude')) {
    return 'claude';
  }
  if (model.includes('gemini')) {
    return 'gemini';
  }
  return '';
}

/**
 * @param {IssueLite} issue
 * @returns {string}
 */
function deriveModelName(issue) {
  return (
    readMetadataValue(issue, ['model']) ||
    readLabelValue(Array.isArray(issue.labels) ? issue.labels : [], [
      MODEL_LABEL_PREFIX
    ])
  );
}

/**
 * @param {'openai'|'claude'|'gemini'} provider
 * @returns {string}
 */
function providerLabel(provider) {
  if (provider === 'openai') return 'OpenAI';
  if (provider === 'claude') return 'Claude';
  return 'Gemini';
}

/**
 * @param {'openai'|'claude'|'gemini'} provider
 * @returns {import('lit-html').TemplateResult}
 */
function providerIcon(provider) {
  if (provider === 'openai') {
    return html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5 17.8 6.8v6.4L12 16.5l-5.8-3.3V6.8L12 3.5Zm0 4.2-2.1 1.2v2.3l2.1 1.2 2.1-1.2V8.9L12 7.7Z"></path>
    </svg>`;
  }
  if (provider === 'claude') {
    return html`<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12c0-4.4 2.8-7 7.3-7 2.3 0 4.2.6 5.7 1.8l-2 2.3c-1-.8-2.1-1.2-3.5-1.2-2.6 0-4.3 1.5-4.3 4.1s1.7 4.1 4.3 4.1c1.4 0 2.5-.4 3.5-1.2l2 2.3C16.5 18.4 14.6 19 12.3 19 7.8 19 5 16.4 5 12Z"></path>
    </svg>`;
  }
  return html`<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 4.5 14.6 9 20 10.2l-3.7 3.6.6 5.2L12 16.8 7.1 19l.6-5.2L4 10.2 9.4 9 12 4.5Z"></path>
  </svg>`;
}

/**
 * @param {string[]} labels
 * @param {string[]} prefixes
 * @returns {string}
 */
function readLabelValue(labels, prefixes) {
  const found = labels.find((label) =>
    prefixes.some((prefix) => String(label).startsWith(prefix))
  );
  if (!found) {
    return '';
  }
  const prefix = prefixes.find((candidate) => found.startsWith(candidate));
  return prefix ? found.slice(prefix.length).trim() : '';
}

/**
 * @param {IssueLite} issue
 * @param {string[]} keys
 * @returns {string}
 */
function readMetadataValue(issue, keys) {
  const metadata =
    issue && typeof issue.metadata === 'object' && issue.metadata
      ? /** @type {Record<string, unknown>} */ (issue.metadata)
      : null;
  if (!metadata) {
    return '';
  }
  for (const key of keys) {
    const raw = metadata[key];
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return String(raw);
    }
  }
  return '';
}

/**
 * @param {IssueLite} issue
 * @returns {CardHealth}
 */
function deriveCardHealth(issue) {
  if (issue.status === 'closed') {
    return {
      level: 'idle',
      indicator: 'none',
      runtime_ms: null,
      heartbeat_ts: null,
      heartbeat_age_ms: null,
      is_missed: false,
      summary: ''
    };
  }
  const runtime_ms = parseRuntimeValue(issue);
  const heartbeat_ts = parseHeartbeatValue(issue);
  const heartbeat_age_ms =
    Number.isFinite(heartbeat_ts) && heartbeat_ts !== null
      ? Date.now() - heartbeat_ts
      : null;
  const expected_ms =
    runtime_ms !== null && runtime_ms >= 60 * 60 * 1000
      ? HEARTBEAT_EXPECTED_LONG_RUNNING_MS
      : HEARTBEAT_EXPECTED_DEFAULT_MS;
  const is_missed =
    heartbeat_age_ms !== null && Number.isFinite(heartbeat_age_ms)
      ? heartbeat_age_ms > expected_ms
      : false;
  const severity_basis = runtime_ms ?? heartbeat_age_ms ?? null;
  /** @type {CardHealth['level']} */
  let level = 'idle';
  if (severity_basis !== null && severity_basis >= 2 * 60 * 60 * 1000) {
    level = 'hours';
  } else if (severity_basis !== null && severity_basis >= 60 * 60 * 1000) {
    level = 'hour';
  } else if (severity_basis !== null && severity_basis >= 60 * 1000) {
    level = 'minutes';
  } else if (severity_basis !== null && severity_basis >= 0) {
    level = 'seconds';
  }
  /** @type {CardHealth['indicator']} */
  let indicator = 'none';
  if (issue.status === 'in_progress' && heartbeat_ts !== null) {
    indicator = is_missed ? 'missed' : 'healthy';
  } else if (issue.status === 'in_progress' && runtime_ms !== null) {
    indicator = 'healthy';
  }
  return {
    level,
    indicator,
    runtime_ms,
    heartbeat_ts,
    heartbeat_age_ms,
    is_missed,
    summary: formatHealthSummary(runtime_ms, heartbeat_age_ms)
  };
}

/**
 * @param {IssueLite} issue
 * @param {CardHealth} health
 * @returns {{ base_runtime_ms: number|null, runtime_ref_ts: number|null, runtime_ms: number|null, health: CardHealth }}
 */
function deriveDynamicDisplayState(issue, health) {
  const runtime_ref_ts = deriveRuntimeReferenceTimestamp(issue, health);
  const runtime_ms =
    Number.isFinite(health.runtime_ms) && Number.isFinite(runtime_ref_ts)
      ? Math.max(
          0,
          /** @type {number} */ (health.runtime_ms) +
            (Date.now() - /** @type {number} */ (runtime_ref_ts))
        )
      : health.runtime_ms;
  const heartbeat_age_ms =
    Number.isFinite(health.heartbeat_ts) && health.heartbeat_ts !== null
      ? Date.now() - health.heartbeat_ts
      : null;
  return {
    base_runtime_ms: health.runtime_ms,
    runtime_ref_ts,
    runtime_ms,
    health: deriveHealthFromDisplayState(
      issue.status || '',
      runtime_ms,
      health.heartbeat_ts,
      heartbeat_age_ms
    )
  };
}

/**
 * @param {string} status
 * @param {number|null} runtime_ms
 * @param {number|null} heartbeat_ts
 * @param {number|null} heartbeat_age_ms
 * @returns {CardHealth}
 */
function deriveHealthFromDisplayState(status, runtime_ms, heartbeat_ts, heartbeat_age_ms) {
  if (status === 'closed') {
    return {
      level: 'idle',
      indicator: 'none',
      runtime_ms: null,
      heartbeat_ts: null,
      heartbeat_age_ms: null,
      is_missed: false,
      summary: ''
    };
  }
  const expected_ms =
    runtime_ms !== null && runtime_ms >= 60 * 60 * 1000
      ? HEARTBEAT_EXPECTED_LONG_RUNNING_MS
      : HEARTBEAT_EXPECTED_DEFAULT_MS;
  const is_missed =
    heartbeat_age_ms !== null && Number.isFinite(heartbeat_age_ms)
      ? heartbeat_age_ms > expected_ms
      : false;
  const severity_basis = runtime_ms ?? heartbeat_age_ms ?? null;
  /** @type {CardHealth['level']} */
  let level = 'idle';
  if (severity_basis !== null && severity_basis >= 2 * 60 * 60 * 1000) {
    level = 'hours';
  } else if (severity_basis !== null && severity_basis >= 60 * 60 * 1000) {
    level = 'hour';
  } else if (severity_basis !== null && severity_basis >= 60 * 1000) {
    level = 'minutes';
  } else if (severity_basis !== null && severity_basis >= 0) {
    level = 'seconds';
  }
  /** @type {CardHealth['indicator']} */
  let indicator = 'none';
  if (status === 'in_progress' && heartbeat_ts !== null) {
    indicator = is_missed ? 'missed' : 'healthy';
  } else if (status === 'in_progress' && runtime_ms !== null) {
    indicator = 'healthy';
  }
  return {
    level,
    indicator,
    runtime_ms,
    heartbeat_ts,
    heartbeat_age_ms,
    is_missed,
    summary: formatHealthSummary(runtime_ms, heartbeat_age_ms)
  };
}

/**
 * @param {IssueLite} issue
 * @param {CardHealth} health
 * @returns {number|null}
 */
function deriveRuntimeReferenceTimestamp(issue, health) {
  if (health.runtime_ms === null) {
    return null;
  }
  const candidates = [health.heartbeat_ts, issue.updated_at, issue.created_at];
  for (const value of candidates) {
    if (Number.isFinite(value)) {
      return /** @type {number} */ (value);
    }
  }
  return Date.now();
}

/**
 * @param {HTMLElement} card
 * @param {CardHealth} health
 */
function syncCardHealthClasses(card, health) {
  for (const class_name of HEALTH_LEVEL_CLASSES) {
    card.classList.remove(class_name);
  }
  if (health.level !== 'idle') {
    card.classList.add(`board-card--${health.level}`);
  }
  if (health.is_missed) {
    card.classList.add('board-card--stale');
  } else {
    card.classList.remove('board-card--stale');
  }
}

/**
 * @param {CardHealth} health
 * @returns {string}
 */
function cardClassName(health) {
  const classes = ['board-card'];
  const active = health.level === 'idle' ? '' : `board-card--${health.level}`;
  if (active) {
    classes.push(active);
  }
  if (health.is_missed) {
    classes.push('board-card--stale');
  }
  return classes.join(' ');
}

/**
 * @param {string[]|undefined} labels
 * @returns {number|null}
 */
function parseHeartbeatLabel(labels) {
  const raw = Array.isArray(labels)
    ? labels.find((label) => String(label).startsWith(HEARTBEAT_LABEL_PREFIX))
    : undefined;
  if (!raw) {
    return null;
  }
  const parsed = Date.parse(raw.slice(HEARTBEAT_LABEL_PREFIX.length).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {IssueLite} issue
 * @returns {number|null}
 */
function parseHeartbeatValue(issue) {
  const raw = readMetadataValue(issue, ['last_heartbeat', 'last.heartbeat']);
  if (raw) {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return parseHeartbeatLabel(issue.labels);
}

/**
 * @param {string[]|undefined} labels
 * @returns {number|null}
 */
function parseRuntimeLabel(labels) {
  const raw = Array.isArray(labels)
    ? labels.find((label) => String(label).startsWith(RUNTIME_LABEL_PREFIX))
    : undefined;
  if (!raw) {
    return null;
  }
  const value = raw.slice(RUNTIME_LABEL_PREFIX.length).trim().toLowerCase();
  const regex = /(\d+)\s*([dhms])/g;
  let total = 0;
  let matched = false;
  /** @type {RegExpExecArray|null} */
  let match;
  while ((match = regex.exec(value))) {
    matched = true;
    const amount = Number(match[1]);
    const unit = match[2];
    if (unit === 'd') {
      total += amount * 24 * 60 * 60 * 1000;
    } else if (unit === 'h') {
      total += amount * 60 * 60 * 1000;
    } else if (unit === 'm') {
      total += amount * 60 * 1000;
    } else if (unit === 's') {
      total += amount * 1000;
    }
  }
  return matched ? total : null;
}

/**
 * @param {IssueLite} issue
 * @returns {number|null}
 */
function parseRuntimeValue(issue) {
  const raw = readMetadataValue(issue, ['time_alive', 'time.alive']);
  if (raw) {
    const parsed = parseDurationValue(raw);
    if (parsed !== null) {
      return parsed;
    }
  }
  return parseRuntimeLabel(issue.labels);
}

/**
 * @param {string} value
 * @returns {number|null}
 */
function parseDurationValue(value) {
  const safe = String(value || '').trim().toLowerCase();
  if (!safe) {
    return null;
  }
  const regex = /(\d+)\s*([dhms])/g;
  let total = 0;
  let matched = false;
  /** @type {RegExpExecArray|null} */
  let match;
  while ((match = regex.exec(safe))) {
    matched = true;
    const amount = Number(match[1]);
    const unit = match[2];
    if (unit === 'd') {
      total += amount * 24 * 60 * 60 * 1000;
    } else if (unit === 'h') {
      total += amount * 60 * 60 * 1000;
    } else if (unit === 'm') {
      total += amount * 60 * 1000;
    } else if (unit === 's') {
      total += amount * 1000;
    }
  }
  return matched ? total : null;
}

/**
 * @param {number|null} runtime_ms
 * @param {number|null} heartbeat_age_ms
 * @returns {string}
 */
function formatHealthSummary(runtime_ms, heartbeat_age_ms) {
  if (heartbeat_age_ms !== null) {
    return `${formatDuration(heartbeat_age_ms)} since heartbeat`;
  }
  if (runtime_ms !== null) {
    return `${formatDuration(runtime_ms)} alive`;
  }
  return '';
}

/**
 * @param {number} duration_ms
 * @returns {string}
 */
function formatDuration(duration_ms) {
  const safe = Math.max(0, Math.floor(duration_ms));
  const total_seconds = Math.floor(safe / 1000);
  if (total_seconds < 60) {
    return `${total_seconds}s`;
  }
  const total_minutes = Math.floor(total_seconds / 60);
  if (total_minutes < 60) {
    return `${total_minutes}m`;
  }
  const hours = Math.floor(total_minutes / 60);
  const minutes = total_minutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * @param {string|null} value
 * @returns {number|null}
 */
function parseNumberAttribute(value) {
  if (!value || value.length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * @param {HTMLElement} element
 * @param {string} class_name
 */
function restartAnimation(element, class_name) {
  element.classList.remove(class_name);
  void element.offsetWidth;
  element.classList.add(class_name);
  window.setTimeout(() => {
    element.classList.remove(class_name);
  }, 1200);
}

/**
 * @returns {Map<string, DOMRect>}
 */
function captureCardPositions() {
  /** @type {Map<string, DOMRect>} */
  const positions = new Map();
  /** @type {HTMLElement[]} */
  const cards = Array.from(document.querySelectorAll('.board-card[data-issue-id]'));
  for (const card of cards) {
    const issue_id = String(card.getAttribute('data-issue-id') || '');
    if (!issue_id) {
      continue;
    }
    positions.set(issue_id, card.getBoundingClientRect());
  }
  return positions;
}


/**
 * @returns {boolean}
 */
function isBoardDebugEnabled() {
  try {
    const hash = String(window.location.hash || '');
    const frag = hash.startsWith('#') ? hash.slice(1) : hash;
    const q_index = frag.indexOf('?');
    const query = q_index >= 0 ? frag.slice(q_index + 1) : '';
    const params = new URLSearchParams(query);
    const flag = String(
      params.get('debug') ||
        params.get('board_debug') ||
        window.localStorage.getItem('beads-ui.board-debug') ||
        ''
    ).toLowerCase();
    return flag === '1' || flag === 'true' || flag === 'on';
  } catch {
    return false;
  }
}
