import { describe, expect, test } from 'vitest';
import { createSubscriptionIssueStore } from '../data/subscription-issue-store.js';
import { createBoardView } from './board.js';

function createTestIssueStores() {
  /** @type {Map<string, any>} */
  const stores = new Map();
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /**
   * @param {string} id
   * @returns {any}
   */
  function getStore(id) {
    let s = stores.get(id);
    if (!s) {
      s = createSubscriptionIssueStore(id);
      stores.set(id, s);
      s.subscribe(() => {
        for (const fn of Array.from(listeners)) {
          try {
            fn();
          } catch {
            /* ignore */
          }
        }
      });
    }
    return s;
  }
  return {
    getStore,
    /** @param {string} id */
    snapshotFor(id) {
      return getStore(id).snapshot().slice();
    },
    /** @param {() => void} fn */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}

describe('views/board', () => {
  test('renders four columns (Blocked, Ready, In Progress, Closed) with sorted cards and navigates on click', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issues = [
      // Blocked
      {
        id: 'B-2',
        title: 'b2',
        priority: 1,
        created_at: new Date('2025-10-22T07:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-22T07:00:00.000Z').getTime(),
        issue_type: 'task'
      },
      {
        id: 'B-1',
        title: 'b1',
        priority: 0,
        created_at: new Date('2025-10-21T07:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-21T07:00:00.000Z').getTime(),
        issue_type: 'bug'
      },
      // Ready
      {
        id: 'R-2',
        title: 'r2',
        priority: 1,
        created_at: new Date('2025-10-20T08:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-20T08:00:00.000Z').getTime(),
        issue_type: 'task'
      },
      {
        id: 'R-1',
        title: 'r1',
        priority: 0,
        created_at: new Date('2025-10-21T08:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-21T08:00:00.000Z').getTime(),
        issue_type: 'bug'
      },
      {
        id: 'R-3',
        title: 'r3',
        priority: 1,
        created_at: new Date('2025-10-22T08:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-22T08:00:00.000Z').getTime(),
        issue_type: 'feature'
      },
      // In progress
      {
        id: 'P-1',
        title: 'p1',
        created_at: new Date('2025-10-23T09:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-23T09:00:00.000Z').getTime(),
        issue_type: 'task'
      },
      {
        id: 'P-2',
        title: 'p2',
        created_at: new Date('2025-10-22T09:00:00.000Z').getTime(),
        updated_at: new Date('2025-10-22T09:00:00.000Z').getTime(),
        issue_type: 'feature'
      },
      // Closed
      {
        id: 'C-2',
        title: 'c2',
        updated_at: new Date('2025-10-20T09:00:00.000Z').getTime(),
        closed_at: new Date(now).getTime(),
        issue_type: 'task'
      },
      {
        id: 'C-1',
        title: 'c1',
        updated_at: new Date('2025-10-21T09:00:00.000Z').getTime(),
        closed_at: new Date(now - 1000).getTime(),
        issue_type: 'bug'
      }
    ];
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:blocked',
      revision: 1,
      issues: issues.filter((i) => i.id.startsWith('B-'))
    });
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: issues.filter((i) => i.id.startsWith('R-'))
    });
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: issues.filter((i) => i.id.startsWith('P-'))
    });
    issueStores.getStore('tab:board:closed').applyPush({
      type: 'snapshot',
      id: 'tab:board:closed',
      revision: 1,
      issues: issues.filter((i) => i.id.startsWith('C-'))
    });

    /** @type {string[]} */
    const navigations = [];
    const view = createBoardView(
      mount,
      null,
      (id) => {
        navigations.push(id);
      },
      undefined,
      undefined,
      issueStores
    );

    await view.load();

    // Blocked: priority asc, then created_at desc for equal priority
    const blocked_ids = Array.from(
      mount.querySelectorAll('#blocked-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(blocked_ids).toEqual(['B-1', 'B-2']);

    // Ready: priority asc, then created_at asc for equal priority
    const ready_ids = Array.from(
      mount.querySelectorAll('#ready-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(ready_ids).toEqual(['R-1', 'R-2', 'R-3']);

    // In progress: priority asc (default), then created_at asc
    const prog_ids = Array.from(
      mount.querySelectorAll('#in-progress-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(prog_ids).toEqual(['P-2', 'P-1']);

    // Closed: closed_at desc
    const closed_ids = Array.from(
      mount.querySelectorAll('#closed-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(closed_ids).toEqual(['C-2', 'C-1']);

    // Click navigates
    const first_ready = /** @type {HTMLElement|null} */ (
      mount.querySelector('#ready-col .board-card')
    );
    first_ready?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(navigations[0]).toBe('R-1');
  });

  test('shows column count badges next to titles', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:blocked').applyPush({
      type: 'snapshot',
      id: 'tab:board:blocked',
      revision: 1,
      issues: [
        {
          id: 'B-1',
          title: 'blocked 1',
          created_at: now - 5,
          updated_at: now - 5,
          issue_type: 'task'
        },
        {
          id: 'B-2',
          title: 'blocked 2',
          created_at: now - 4,
          updated_at: now - 4,
          issue_type: 'task'
        }
      ]
    });
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: [
        {
          id: 'R-1',
          title: 'ready 1',
          created_at: now - 3,
          updated_at: now - 3,
          issue_type: 'feature'
        },
        {
          id: 'R-2',
          title: 'ready 2',
          created_at: now - 2,
          updated_at: now - 2,
          issue_type: 'task'
        },
        {
          id: 'R-3',
          title: 'ready 3',
          created_at: now - 1,
          updated_at: now - 1,
          issue_type: 'task'
        }
      ]
    });
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: [
        {
          id: 'P-1',
          title: 'progress 1',
          created_at: now,
          updated_at: now,
          issue_type: 'feature'
        }
      ]
    });
    issueStores.getStore('tab:board:closed').applyPush({
      type: 'snapshot',
      id: 'tab:board:closed',
      revision: 1,
      issues: [
        {
          id: 'C-1',
          title: 'closed 1',
          updated_at: now,
          closed_at: now,
          issue_type: 'chore'
        }
      ]
    });

    const view = createBoardView(
      mount,
      null,
      () => {},
      undefined,
      undefined,
      issueStores
    );

    await view.load();

    const blocked_count = mount
      .querySelector('#blocked-col .board-column__count')
      ?.textContent?.trim();
    const ready_count = mount
      .querySelector('#ready-col .board-column__count')
      ?.textContent?.trim();
    const in_progress_count = mount
      .querySelector('#in-progress-col .board-column__count')
      ?.textContent?.trim();
    const closed_count = mount
      .querySelector('#closed-col .board-column__count')
      ?.textContent?.trim();

    expect(blocked_count).toBe('2');
    expect(ready_count).toBe('3');
    expect(in_progress_count).toBe('1');
    expect(closed_count).toBe('1');

    const closed_label = mount
      .querySelector('#closed-col .board-column__count')
      ?.getAttribute('aria-label');
    expect(closed_label).toBe('1 issue');
  });

  test('filters Ready to exclude items that are In Progress', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const issues = [
      {
        id: 'X-1',
        title: 'x1',
        priority: 1,
        created_at: '2025-10-23T10:00:00.000Z',
        updated_at: '2025-10-23T10:00:00.000Z',
        issue_type: 'task'
      },
      {
        id: 'X-2',
        title: 'x2',
        priority: 1,
        created_at: '2025-10-23T09:00:00.000Z',
        updated_at: '2025-10-23T09:00:00.000Z',
        issue_type: 'task'
      }
    ];
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:ready').applyPush({
      type: 'snapshot',
      id: 'tab:board:ready',
      revision: 1,
      issues: issues
    });
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: issues.filter((i) => i.id.startsWith('X-2'))
    });

    const view = createBoardView(
      mount,
      null,
      () => {},
      undefined,
      undefined,
      issueStores
    );

    await view.load();

    const ready_ids = Array.from(
      mount.querySelectorAll('#ready-col .board-card .mono')
    ).map((el) => el.textContent?.trim());

    // X-2 is in progress, so Ready should only show X-1
    expect(ready_ids).toEqual(['X-1']);

    const prog_ids = Array.from(
      mount.querySelectorAll('#in-progress-col .board-card .mono')
    ).map((el) => el.textContent?.trim());
    expect(prog_ids).toEqual(['X-2']);
  });

  test('renders heartbeat health, runtime chip, and last-comment metadata', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: [
        {
          id: 'P-7',
          title: 'healthy heartbeat',
          status: 'in_progress',
          issue_type: 'task',
          priority: 1,
          created_at: now - 20_000,
          updated_at: now,
          assignee: 'worker-a',
          last_comment_at: new Date(now - 2 * 60_000).toISOString(),
          labels: [
            'pid:4242',
            'model-provider:claude',
            'model:claude-sonnet-4.5',
            'last-heartbeat:' + new Date(now - 45_000).toISOString(),
            'time-alive:12m'
          ]
        },
        {
          id: 'P-8',
          title: 'missed heartbeat',
          status: 'in_progress',
          issue_type: 'task',
          priority: 1,
          created_at: now - 20_000,
          updated_at: now,
          labels: [
            'last-heartbeat:' + new Date(now - 16 * 60_000).toISOString(),
            'time-alive:2h5m'
          ]
        }
      ]
    });

    const view = createBoardView(
      mount,
      null,
      () => {},
      undefined,
      undefined,
      issueStores
    );

    await view.load();

    const healthy = /** @type {HTMLElement|null} */ (
      mount.querySelector('.board-card[data-issue-id="P-7"]')
    );
    const missed = /** @type {HTMLElement|null} */ (
      mount.querySelector('.board-card[data-issue-id="P-8"]')
    );

    expect(healthy?.classList.contains('board-card--minutes')).toBe(true);
    expect(missed?.classList.contains('board-card--hours')).toBe(true);
    expect(missed?.classList.contains('board-card--stale')).toBe(true);
    expect(
      healthy?.querySelector('.board-card__indicator--healthy')
    ).not.toBeNull();
    expect(
      missed?.querySelector('.board-card__indicator--missed')?.textContent?.trim()
    ).toBe('!');
    expect(
      healthy?.querySelector('.board-card__comment-count')?.textContent?.trim()
    ).toContain('Comment 2m ago');
    expect(
      healthy?.querySelector('.board-card__worker')?.textContent?.trim()
    ).toBe('worker-a · PID 4242');
    expect(
      healthy?.querySelector('.board-card__provider')?.getAttribute('aria-label')
    ).toBe('Claude');
    expect(
      healthy?.querySelector('.board-card__model')?.textContent?.trim()
    ).toBe('claude-sonnet-4.5');
    expect(
      healthy?.querySelector('.board-card__runtime')?.textContent?.trim()
    ).toBe('Alive 12m');
    expect(
      healthy?.querySelector('.board-card__health')?.textContent?.includes(
        'since heartbeat'
      )
    ).toBe(true);
  });

  test('prefers metadata over labels for runtime heartbeat conversation and model data', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const heartbeat_iso = new Date(now - 30_000).toISOString();
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:in-progress').applyPush({
      type: 'snapshot',
      id: 'tab:board:in-progress',
      revision: 1,
      issues: [
        {
          id: 'P-9',
          title: 'metadata-backed issue',
          status: 'in_progress',
          issue_type: 'task',
          priority: 1,
          created_at: now - 20_000,
          updated_at: now,
          assignee: 'fallback-worker',
          metadata: {
            agent_name: 'codex',
            background_pid: 4242,
            conversation_id: 'conv-123',
            last_heartbeat: heartbeat_iso,
            model: 'gpt-5.4',
            model_provider: 'codex',
            time_alive: '3m'
          },
          labels: [
            'pid:9999',
            'model-provider:claude',
            'model:claude-sonnet-4.5',
            'last-heartbeat:' + new Date(now - 16 * 60_000).toISOString(),
            'time-alive:2h5m'
          ]
        }
      ]
    });

    const view = createBoardView(
      mount,
      null,
      () => {},
      undefined,
      undefined,
      issueStores
    );

    await view.load();

    const card = /** @type {HTMLElement|null} */ (
      mount.querySelector('.board-card[data-issue-id="P-9"]')
    );

    expect(card?.classList.contains('board-card--minutes')).toBe(true);
    expect(card?.classList.contains('board-card--hours')).toBe(false);
    expect(
      card?.querySelector('.board-card__worker')?.textContent?.trim()
    ).toBe('codex · PID 4242');
    expect(
      card?.querySelector('.board-card__provider')?.getAttribute('aria-label')
    ).toBe('OpenAI');
    expect(
      card?.querySelector('.board-card__model')?.textContent?.trim()
    ).toBe('gpt-5.4');
    expect(
      card?.querySelector('.board-card__conversation')?.textContent?.trim()
    ).toContain('conv-123');
    expect(
      card?.querySelector('.board-card__runtime')?.textContent?.trim()
    ).toBe('Alive 3m');
  });

  test('prefers metadata prompt and response preview over comment-derived fields', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:closed').applyPush({
      type: 'snapshot',
      id: 'tab:board:closed',
      revision: 1,
      issues: [
        {
          id: 'P-10',
          title: 'metadata preview',
          status: 'closed',
          issue_type: 'task',
          priority: 1,
          created_at: now - 20_000,
          updated_at: now,
          closed_at: now,
          latest_prompt: 'comment prompt',
          latest_response: 'comment response',
          metadata: {
            latest_prompt: 'metadata prompt',
            latest_response: 'metadata response'
          }
        }
      ]
    });

    const view = createBoardView(
      mount,
      null,
      () => {},
      undefined,
      undefined,
      issueStores
    );

    await view.load();

    const card = /** @type {HTMLElement|null} */ (
      mount.querySelector('.board-card[data-issue-id="P-10"]')
    );
    const panels = Array.from(
      card?.querySelectorAll('.board-card__debug-message') || []
    ).map((el) => el.textContent?.trim() || '');

    expect(panels.join('\n')).toContain('metadata prompt');
    expect(panels.join('\n')).toContain('metadata response');
    expect(panels.join('\n')).not.toContain('comment prompt');
    expect(panels.join('\n')).not.toContain('comment response');
  });

  test('does not tint or badge closed issues even when heartbeat labels exist', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const now = Date.now();
    const issueStores = createTestIssueStores();
    issueStores.getStore('tab:board:closed').applyPush({
      type: 'snapshot',
      id: 'tab:board:closed',
      revision: 1,
      issues: [
        {
          id: 'C-9',
          title: 'closed with old heartbeat',
          status: 'closed',
          issue_type: 'task',
          priority: 1,
          created_at: now - 100_000,
          updated_at: now,
          closed_at: now,
          labels: [
            'last-heartbeat:' + new Date(now - 3 * 60 * 60 * 1000).toISOString(),
            'time-alive:4h'
          ]
        }
      ]
    });

    const view = createBoardView(
      mount,
      null,
      () => {},
      undefined,
      undefined,
      issueStores
    );

    await view.load();

    const closed = /** @type {HTMLElement|null} */ (
      mount.querySelector('.board-card[data-issue-id="C-9"]')
    );

    expect(closed?.classList.contains('board-card--minutes')).toBe(false);
    expect(closed?.classList.contains('board-card--hour')).toBe(false);
    expect(closed?.classList.contains('board-card--hours')).toBe(false);
    expect(closed?.classList.contains('board-card--stale')).toBe(false);
    expect(closed?.querySelector('.board-card__health')).toBeNull();
    expect(closed?.querySelector('.board-card__indicator')).toBeNull();
  });

  test('renders debug simulation cards across columns when board debug flag is enabled in hash', async () => {
    document.body.innerHTML = '<div id="m"></div>';
    window.location.hash = '#/board?debug=1';
    const mount = /** @type {HTMLElement} */ (document.getElementById('m'));

    const issueStores = createTestIssueStores();
    const view = createBoardView(
      mount,
      null,
      () => {},
      undefined,
      undefined,
      issueStores
    );

    await view.load();

    expect(mount.querySelector('.board-debug')).toBeNull();
    expect(mount.querySelectorAll('.board-card').length).toBeGreaterThanOrEqual(5);
    expect(
      mount.querySelector('#blocked-col .board-card[data-issue-id="DBG-B1"]')
    ).not.toBeNull();
    expect(
      mount.querySelector('#ready-col .board-card[data-issue-id="DBG-R1"]')
    ).not.toBeNull();
    expect(
      mount.querySelector('#in-progress-col .board-card[data-issue-id="DBG-P1"]')
    ).not.toBeNull();
    expect(
      mount.querySelector('#closed-col .board-card[data-issue-id="DBG-C1"]')
    ).not.toBeNull();
    expect(
      mount.querySelector('#in-progress-col .board-card[data-issue-id="DBG-P3"]')
    ).not.toBeNull();
    expect(
      mount.querySelector('#in-progress-col .board-card[data-issue-id="DBG-P4"]')
    ).not.toBeNull();
    expect(
      mount.querySelector('.board-card[data-issue-id="DBG-P1"] .board-card__indicator--healthy')
    ).not.toBeNull();
    expect(
      mount.querySelector('.board-card[data-issue-id="DBG-P4"] .board-card__indicator--missed')
    ).not.toBeNull();
    expect(
      mount.querySelectorAll(
        '.board-card[data-issue-id="DBG-P1"] .board-card__debug-message'
      ).length
    ).toBe(2);
    expect(
      mount.querySelector(
        '.board-card[data-issue-id="DBG-P1"] .board-card__preview-label'
      )?.textContent
    ).toContain('Latest Prompt');
    expect(
      mount.querySelector(
        '.board-card[data-issue-id="DBG-P1"] .board-card__debug-message pre code'
      )?.textContent
    ).toContain('status=ok');
    expect(
      mount.querySelector('.board-card[data-issue-id="DBG-P1"]')?.classList.contains(
        'board-card--seconds'
      )
    ).toBe(true);
    expect(
      mount.querySelector('.board-card[data-issue-id="DBG-P2"]')?.classList.contains(
        'board-card--minutes'
      )
    ).toBe(true);
    expect(
      mount.querySelector('.board-card[data-issue-id="DBG-P3"]')?.classList.contains(
        'board-card--hours'
      )
    ).toBe(true);
    expect(
      mount.querySelector('.board-card[data-issue-id="DBG-P4"]')?.classList.contains(
        'board-card--stale'
      )
    ).toBe(true);
  });
});
