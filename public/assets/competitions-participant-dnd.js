function setWizardMessage(row, text, kind = "") {
  const wizard = row.closest(".participant-wizard");
  const message = wizard?.querySelector(".participant-wizard-message");
  if (!message) return;
  message.textContent = text;
  message.className = `participant-wizard-message${kind ? ` ${kind}` : ""}`;
}

function installStyles() {
  if (document.querySelector("style[data-competition-participant-dnd]")) return;
  const style = document.createElement("style");
  style.dataset.competitionParticipantDnd = "true";
  style.textContent = `
    .participant-upload-row.participant-dropzone {
      border: 1px dashed currentColor;
      border-radius: 12px;
      padding: 14px;
      transition: opacity 120ms ease, transform 120ms ease;
    }
    .participant-upload-row.participant-dropzone.is-dragover {
      opacity: .82;
      transform: translateY(-1px);
    }
    .participant-drop-hint {
      display: block;
      width: 100%;
      margin-top: 8px;
      font-size: .88rem;
      opacity: .72;
    }
  `;
  document.head.append(style);
}

function acceptedImage(file) {
  return file instanceof File && (file.type === "image/png" || file.type === "image/jpeg");
}

function wireUploadRow(row) {
  if (!(row instanceof HTMLElement) || row.dataset.dropUploadReady === "true") return;
  const input = row.querySelector('input[type="file"]');
  const button = row.querySelector("button");
  if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) return;

  row.dataset.dropUploadReady = "true";
  row.classList.add("participant-dropzone");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Competition screenshot upload");

  const hint = document.createElement("span");
  hint.className = "participant-drop-hint";
  hint.textContent = "Choose a file or drag and drop one PNG/JPEG here. Use the arrows above to reorder screenshots.";
  row.append(hint);

  const clearDragState = () => row.classList.remove("is-dragover");
  for (const eventName of ["dragenter", "dragover"]) {
    row.addEventListener(eventName, (event) => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      row.classList.add("is-dragover");
    });
  }
  row.addEventListener("dragleave", (event) => {
    if (event.relatedTarget && row.contains(event.relatedTarget)) return;
    clearDragState();
  });
  row.addEventListener("drop", (event) => {
    event.preventDefault();
    clearDragState();
    const files = [...(event.dataTransfer?.files ?? [])];
    if (!files.length) return;
    if (files.length > 1) {
      setWizardMessage(row, "Drop one screenshot at a time so each image can be sanitized and safety-checked individually.", "is-error");
      return;
    }
    const file = files[0];
    if (!acceptedImage(file)) {
      setWizardMessage(row, "Only PNG and JPEG screenshots can be uploaded.", "is-error");
      return;
    }
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    button.click();
  });
}

function scan(root = document) {
  root.querySelectorAll?.(".participant-upload-row").forEach(wireUploadRow);
}

function init() {
  if (document.body.dataset.competitionPage !== "detail") return;
  installStyles();
  scan();
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches?.(".participant-upload-row")) wireUploadRow(node);
        scan(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();

export { acceptedImage, wireUploadRow };
