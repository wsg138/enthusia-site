const form = document.querySelector('#appeal-form');
const result = document.querySelector('#result');
const select = document.querySelector('#punishment');
const sanction = document.querySelector('#sanction');
const submit = form.querySelector('button[type="submit"]');
let sanctions = [];

function setResult(message, tone = '') {
  result.textContent = message;
  result.className = `appeal-form-status${tone ? ` is-${tone}` : ''}`;
}

function render() {
  const item = sanctions.find(candidate => String(candidate.id) === select.value);
  sanction.textContent = item
    ? `${item.type ?? 'Punishment'} · issued ${item.createdAt ?? 'unknown date'} · ${item.reason ?? 'No public reason provided'}`
    : '';
}

function loadError() {
  sanctions = [];
  select.replaceChildren(new Option('Unable to load punishments — retry later', ''));
  select.disabled = true;
  sanction.textContent = '';
  setResult('We could not load your appealable punishments. Refresh the page to try again.', 'error');
}

async function load(preserveResult = false) {
  select.disabled = true;
  select.replaceChildren(new Option('Loading appealable punishments…', ''));
  try {
    const response = await fetch('/api/appeals/eligible');
    if (!response.ok) {
      loadError();
      return;
    }
    const payload = await response.json();
    sanctions = Array.isArray(payload) ? payload : payload.punishments ?? [];
    select.replaceChildren(new Option(sanctions.length ? 'Select a punishment' : 'No appealable punishments', ''));
    for (const item of sanctions) {
      select.add(new Option(`${item.type ?? 'Punishment'} — ${item.createdAt ?? item.id}`, item.id));
    }
    select.disabled = !sanctions.length;
    submit.disabled = !sanctions.length;
    if (!preserveResult) {
      setResult(sanctions.length ? '' : 'There are no punishments available to appeal on this account.');
    }
    render();
  } catch {
    loadError();
  }
}

select.addEventListener('change', render);
form.addEventListener('submit', async event => {
  event.preventDefault();
  submit.disabled = true;
  setResult('Submitting your appeal…', 'pending');
  const data = Object.fromEntries(new FormData(form));
  try {
    const response = await fetch('/api/appeals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data)
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      setResult('Appeal submitted. It is now in the staff review queue.', 'success');
      form.reset();
      await load(true);
    } else if (payload.error === 'rate_limited') {
      setResult(`Too many attempts. Try again in ${payload.retryAfter} seconds.`, 'error');
    } else {
      setResult(`Unable to submit this appeal (${response.status}).`, 'error');
    }
  } catch {
    setResult('Unable to reach the appeal service. Retry in a moment.', 'error');
  } finally {
    submit.disabled = !sanctions.length;
  }
});

load();
