/** Reduces the limited appeal markup syntax to the text staff read and search. */
export function plainAppealText(value) {
  return String(value ?? "")
    .replace(/^#{1,3}[ \t]+/gm, "")
    .replace(/^>[ \t]?/gm, "")
    .replace(/^[-*+][ \t]+/gm, "")
    .replace(/^\d+[.)][ \t]+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_]+)_(?!_)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
