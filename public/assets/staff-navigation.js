import { staffCapabilities, hasStaffTools } from './staff-capabilities.js';

const template = document.querySelector('template[data-staff-entry]');
async function update(refresh=false) {
  const previous = template.nextElementSibling;
  if (previous?.matches('[data-staff-link]')) previous.remove();
  if (!hasStaffTools(await staffCapabilities(refresh))) return;
  const link = template.content.firstElementChild.cloneNode(true);
  link.dataset.staffLink = '';
  template.after(link);
}
if (template) {
  update();
  window.addEventListener('pageshow', event => { if (event.persisted) update(true); });
}
