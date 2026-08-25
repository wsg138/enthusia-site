export function appealPlainText(value) {
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

function appendInline(root, value) {
  const pattern = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > cursor) root.append(document.createTextNode(value.slice(cursor, match.index)));
    const token = match[0];
    let node;
    if (token.startsWith("**") || token.startsWith("__")) {
      node = document.createElement("strong");
      node.textContent = token.slice(2, -2);
    } else if (token.startsWith("`")) {
      node = document.createElement("code");
      node.textContent = token.slice(1, -1);
    } else {
      node = document.createElement("em");
      node.textContent = token.slice(1, -1);
    }
    root.append(node);
    cursor = match.index + token.length;
  }
  if (cursor < value.length) root.append(document.createTextNode(value.slice(cursor)));
}

function startsBlock(line) {
  return /^(?:#{1,3}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/.test(line);
}

export function renderAppealMarkup(root, value) {
  root.replaceChildren();
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const node = document.createElement("h4");
      node.className = `appeal-markup-heading appeal-markup-heading-${heading[1].length}`;
      appendInline(node, heading[2]);
      root.append(node);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = document.createElement("blockquote");
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        if (quote.childNodes.length) quote.append(document.createElement("br"));
        appendInline(quote, lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      root.append(quote);
      continue;
    }

    const listMatch = /^(?:([-*+])|(\d+)[.)])\s+(.+)$/.exec(line);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const list = document.createElement(ordered ? "ol" : "ul");
      while (index < lines.length) {
        const item = /^(?:([-*+])|(\d+)[.)])\s+(.+)$/.exec(lines[index]);
        if (!item || Boolean(item[2]) !== ordered) break;
        const entry = document.createElement("li");
        appendInline(entry, item[3]);
        list.append(entry);
        index += 1;
      }
      root.append(list);
      continue;
    }

    const paragraph = document.createElement("p");
    while (index < lines.length && lines[index].trim() && !startsBlock(lines[index])) {
      if (paragraph.childNodes.length) paragraph.append(document.createElement("br"));
      appendInline(paragraph, lines[index]);
      index += 1;
    }
    if (paragraph.childNodes.length) root.append(paragraph);
  }
  if (!root.childNodes.length) {
    const empty = document.createElement("p");
    empty.className = "appeal-markup-empty";
    empty.textContent = "Nothing to preview yet.";
    root.append(empty);
  }
}
