const root = document.querySelector('#appeals');
const status = document.querySelector('#status');
const refresh = document.querySelector('#refresh');
const queueSummary = document.querySelector('#queue-summary');
const key = () => crypto.randomUUID();

const statusNames = {
  OPEN: 'Open',
  INFORMATION_REQUESTED: 'Waiting for player',
  APPROVAL_PENDING: 'Approval pending',
  APPLIED: 'Approved',
  DENIED: 'Denied',
  REJECTED: 'Approval failed'
};

function statusName(value) {
  return statusNames[value] ?? value ?? 'Unknown';
}

function statusTone(value) {
  return String(value ?? 'unknown').toLowerCase().replaceAll('_', '-');
}

function detail(label, value) {
  const item = document.createElement('div');
  item.className = 'review-detail';
  const name = document.createElement('span');
  name.textContent = label;
  const content = document.createElement('strong');
  content.textContent = value ?? 'Unknown';
  item.append(name, content);
  return item;
}

function emptyState(title, message, isError = false, isLoading = false) {
  const state = document.createElement('div');
  state.className = `review-empty-state${isError ? ' is-error' : ''}`;
  if (isLoading) {
    const loader = document.createElement('span');
    loader.className = 'review-loader';
    loader.setAttribute('aria-hidden', 'true');
    state.append(loader);
  }
  const heading = document.createElement('strong');
  heading.textContent = title;
  const copy = document.createElement('p');
  copy.textContent = message;
  state.append(heading, copy);
  return state;
}

async function decide(appeal, decision, note, result, article) {
  if (note.trim().length < 3) {
    result.textContent = 'Enter a decision note with at least 3 characters.';
    result.className = 'review-card-status is-error';
    note.focus();
    return;
  }

  const actionButtons = article.querySelectorAll('.review-action');
  actionButtons.forEach(button => { button.disabled = true; });
  article.setAttribute('aria-busy', 'true');
  result.textContent = 'Saving decision…';
  result.className = 'review-card-status is-pending';

  try {
    const response = await fetch(`/api/reviewer/appeals/${encodeURIComponent(appeal.id)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision,
        note: note.value,
        expectedVersion: appeal.version,
        idempotencyKey: key()
      })
    });

    if (response.status === 409) {
      result.textContent = 'This appeal changed. Refresh before deciding.';
      result.className = 'review-card-status is-error';
      return;
    }

    if (response.ok) {
      result.textContent = 'Decision saved.';
      result.className = 'review-card-status is-success';
      await load();
    } else {
      result.textContent = `Unable to save this decision (${response.status}).`;
      result.className = 'review-card-status is-error';
    }
  } catch {
    result.textContent = 'Unable to reach the appeal service. Retry in a moment.';
    result.className = 'review-card-status is-error';
  } finally {
    article.removeAttribute('aria-busy');
    actionButtons.forEach(button => { button.disabled = false; });
  }
}

function card(appeal) {
  const article = document.createElement('article');
  article.className = 'appeal-review-card card';

  const header = document.createElement('header');
  header.className = 'review-card-header';
  const titleGroup = document.createElement('div');
  const kicker = document.createElement('p');
  kicker.className = 'appeal-card-kicker';
  kicker.textContent = 'Punishment appeal';
  const heading = document.createElement('h2');
  heading.textContent = appeal.player ?? 'Unknown player';
  titleGroup.append(kicker, heading);
  const badge = document.createElement('span');
  badge.className = `review-status-badge is-${statusTone(appeal.status)}`;
  badge.textContent = statusName(appeal.status);
  header.append(titleGroup, badge);

  const details = document.createElement('div');
  details.className = 'review-detail-grid';
  details.append(
    detail('Punishment', appeal.punishmentType ?? 'Punishment'),
    detail('Case', appeal.caseId ?? 'Unknown'),
    detail('Appeal ID', appeal.id ?? 'Unknown'),
    detail('Version', String(appeal.version ?? 0))
  );

  const reason = document.createElement('section');
  reason.className = 'review-reason';
  const reasonLabel = document.createElement('h3');
  reasonLabel.textContent = 'Player statement';
  const reasonText = document.createElement('p');
  reasonText.textContent = appeal.reason || 'No appeal statement was provided.';
  reason.append(reasonLabel, reasonText);

  article.append(header, details, reason);

  if (appeal.decisionNote) {
    const prior = document.createElement('section');
    prior.className = 'review-prior-note';
    const priorLabel = document.createElement('h3');
    priorLabel.textContent = 'Latest decision note';
    const priorText = document.createElement('p');
    priorText.textContent = appeal.decisionNote;
    prior.append(priorLabel, priorText);
    article.append(prior);
  }

  if (appeal.status === 'OPEN') {
    const decisionPanel = document.createElement('section');
    decisionPanel.className = 'review-decision-panel';
    const decisionHeader = document.createElement('div');
    decisionHeader.className = 'review-decision-header';
    const decisionTitle = document.createElement('h3');
    decisionTitle.textContent = 'Record a decision';
    const decisionHint = document.createElement('span');
    decisionHint.textContent = 'A note is required';
    decisionHeader.append(decisionTitle, decisionHint);

    const noteLabel = document.createElement('label');
    noteLabel.textContent = 'Decision note';
    const note = document.createElement('textarea');
    note.minLength = 3;
    note.maxLength = 1000;
    note.rows = 4;
    note.placeholder = 'Explain the decision and any next steps for the player.';
    noteLabel.append(note);

    const actions = document.createElement('div');
    actions.className = 'review-actions';
    const result = document.createElement('p');
    result.className = 'review-card-status';
    result.setAttribute('role', 'status');

    for (const [label, value, tone] of [
      ['Approve appeal', 'approve', 'approve'],
      ['Deny appeal', 'deny', 'deny'],
      ['Request information', 'request_information', 'information']
    ]) {
      const button = document.createElement('button');
      button.className = `review-action is-${tone}`;
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => decide(appeal, value, note, result, article));
      actions.append(button);
    }

    decisionPanel.append(decisionHeader, noteLabel, actions, result);
    article.append(decisionPanel);
  }

  return article;
}

async function load() {
  root.textContent = '';
  root.classList.add('is-loading');
  root.setAttribute('aria-busy', 'true');
  queueSummary.textContent = 'Loading appeals…';
  refresh.disabled = true;

  root.append(emptyState('Loading the review queue', 'Retrieving the latest appeal versions.', false, true));

  try {
    const response = await fetch(`/api/reviewer/appeals?status=${encodeURIComponent(status.value)}`);
    if (!response.ok) {
      root.replaceChildren(emptyState('Unable to load appeals', `The service returned status ${response.status}. Refresh to try again.`, true));
      queueSummary.textContent = 'Queue unavailable';
      return;
    }

    const payload = await response.json();
    const appeals = Array.isArray(payload) ? payload : payload.appeals ?? [];
    root.replaceChildren(...appeals.map(card));
    queueSummary.textContent = `${appeals.length} ${appeals.length === 1 ? 'appeal' : 'appeals'} shown · ${status.options[status.selectedIndex].text}`;

    if (!appeals.length) {
      root.replaceChildren(emptyState('No appeals found', 'There are no cases in this view right now.'));
    }
  } catch {
    root.replaceChildren(emptyState('Review service unavailable', 'Unable to reach the appeal service. Use Refresh to retry.', true));
    queueSummary.textContent = 'Queue unavailable';
  } finally {
    root.classList.remove('is-loading');
    root.removeAttribute('aria-busy');
    refresh.disabled = false;
  }
}

refresh.addEventListener('click', load);
status.addEventListener('change', load);
load();
