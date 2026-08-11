const root = document.querySelector('#appeals');
const status = document.querySelector('#status');
const refresh = document.querySelector('#refresh');
const queueSummary = document.querySelector('#queue-summary');
const key = () => crypto.randomUUID();
const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  return String(value ?? 'unknown').toLowerCase().replace(/_/g, '-');
}

function displayValue(value, fallback = 'Unknown') {
  return value === null || value === undefined ? fallback : value;
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

function decisionEndpoint(appealId) {
  const normalized = String(appealId ?? '');
  return canonicalUuid.test(normalized) ? `/api/reviewer/appeals/${normalized}` : null;
}

function setCardStatus(result, message, tone) {
  result.textContent = message;
  result.className = `review-card-status is-${tone}`;
}

async function decide(appeal, decision, note, result, article) {
  if (note.trim().length < 3) {
    setCardStatus(result, 'Enter a decision note with at least 3 characters.', 'error');
    note.focus();
    return;
  }

  const endpoint = decisionEndpoint(appeal.id);
  if (!endpoint) {
    setCardStatus(result, 'This appeal has an invalid identifier. Refresh before deciding.', 'error');
    return;
  }

  const actionButtons = article.querySelectorAll('.review-action');
  actionButtons.forEach(button => { button.disabled = true; });
  article.setAttribute('aria-busy', 'true');
  setCardStatus(result, 'Saving decision…', 'pending');

  try {
    const response = await fetch(endpoint, {
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
      setCardStatus(result, 'This appeal changed. Refresh before deciding.', 'error');
      return;
    }

    if (response.ok) {
      setCardStatus(result, 'Decision saved.', 'success');
      await load();
    } else {
      setCardStatus(result, `Unable to save this decision (${response.status}).`, 'error');
    }
  } catch {
    setCardStatus(result, 'Unable to reach the appeal service. Retry in a moment.', 'error');
  } finally {
    article.removeAttribute('aria-busy');
    actionButtons.forEach(button => { button.disabled = false; });
  }
}

function cardHeader(appeal) {
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
  return header;
}

function detailGrid(appeal) {
  const details = document.createElement('div');
  details.className = 'review-detail-grid';
  details.append(
    detail('Punishment', displayValue(appeal.punishmentType, 'Punishment')),
    detail('Case', displayValue(appeal.caseId)),
    detail('Appeal ID', displayValue(appeal.id)),
    detail('Version', String(displayValue(appeal.version, 0)))
  );
  return details;
}

function textSection(className, title, copy) {
  const section = document.createElement('section');
  section.className = className;
  const heading = document.createElement('h3');
  heading.textContent = title;
  const body = document.createElement('p');
  body.textContent = copy;
  section.append(heading, body);
  return section;
}

function decisionHeader() {
  const header = document.createElement('div');
  header.className = 'review-decision-header';
  const title = document.createElement('h3');
  title.textContent = 'Record a decision';
  const hint = document.createElement('span');
  hint.textContent = 'A note is required';
  header.append(title, hint);
  return header;
}

function decisionNote() {
  const label = document.createElement('label');
  label.textContent = 'Decision note';
  const note = document.createElement('textarea');
  note.minLength = 3;
  note.maxLength = 1000;
  note.rows = 4;
  note.placeholder = 'Explain the decision and any next steps for the player.';
  label.append(note);
  return { label, note };
}

function decisionActions(appeal, note, result, article) {
  const actions = document.createElement('div');
  actions.className = 'review-actions';
  const choices = [
    ['Approve appeal', 'approve', 'approve'],
    ['Deny appeal', 'deny', 'deny'],
    ['Request information', 'request_information', 'information']
  ];
  for (const [label, value, tone] of choices) {
    const button = document.createElement('button');
    button.className = `review-action is-${tone}`;
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => decide(appeal, value, note, result, article));
    actions.append(button);
  }
  return actions;
}

function decisionPanel(appeal, article) {
  const panel = document.createElement('section');
  panel.className = 'review-decision-panel';
  const noteField = decisionNote();
  const result = document.createElement('p');
  result.className = 'review-card-status';
  result.setAttribute('role', 'status');
  panel.append(
    decisionHeader(),
    noteField.label,
    decisionActions(appeal, noteField.note, result, article),
    result
  );
  return panel;
}

function card(appeal) {
  const article = document.createElement('article');
  article.className = 'appeal-review-card card';
  article.append(
    cardHeader(appeal),
    detailGrid(appeal),
    textSection('review-reason', 'Player statement', appeal.reason || 'No appeal statement was provided.')
  );
  if (appeal.decisionNote) {
    article.append(textSection('review-prior-note', 'Latest decision note', appeal.decisionNote));
  }
  if (appeal.status === 'OPEN') {
    article.append(decisionPanel(appeal, article));
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
