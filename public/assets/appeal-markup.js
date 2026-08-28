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

function markupSpace(character) {
  return character === " " || character === "\t";
}

function contentAfterMarker(line, markerEnd) {
  if (!markupSpace(line[markerEnd])) return null;
  let contentStart = markerEnd + 1;
  while (contentStart < line.length && markupSpace(line[contentStart])) contentStart += 1;
  return contentStart < line.length ? line.slice(contentStart) : null;
}

export function parseAppealBlock(value) {
  const line = String(value ?? "");
  let headingEnd = 0;
  while (headingEnd < 3 && line[headingEnd] === "#") headingEnd += 1;
  if (headingEnd && line[headingEnd] !== "#") {
    const content = contentAfterMarker(line, headingEnd);
    if (content !== null) return { kind: "heading", level: headingEnd, content };
  }

  if (line.startsWith(">")) {
    const contentStart = markupSpace(line[1]) ? 2 : 1;
    return { kind: "quote", content: line.slice(contentStart) };
  }

  if (line.length && "-*+".includes(line[0])) {
    const content = contentAfterMarker(line, 1);
    return content === null ? null : { kind: "unordered-item", content };
  }

  let digitEnd = 0;
  while (digitEnd < line.length && line.charCodeAt(digitEnd) >= 48 && line.charCodeAt(digitEnd) <= 57) {
    digitEnd += 1;
  }
  if (digitEnd && (line[digitEnd] === "." || line[digitEnd] === ")")) {
    const content = contentAfterMarker(line, digitEnd + 1);
    if (content !== null) return { kind: "ordered-item", content };
  }
  return null;
}

export function renderAppealMarkup(root, value) {
  root.replaceChildren();
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines.at(index);
    if (!line.trim()) { index += 1; continue; }

    const block = parseAppealBlock(line);
    if (block?.kind === "heading") {
      const node = document.createElement("h4");
      node.className = `appeal-markup-heading appeal-markup-heading-${block.level}`;
      appendInline(node, block.content);
      root.append(node);
      index += 1;
      continue;
    }

    if (block?.kind === "quote") {
      const quote = document.createElement("blockquote");
      let quoteBlock = block;
      while (index < lines.length && quoteBlock?.kind === "quote") {
        if (quote.childNodes.length) quote.append(document.createElement("br"));
        appendInline(quote, quoteBlock.content);
        index += 1;
        quoteBlock = index < lines.length ? parseAppealBlock(lines.at(index)) : null;
      }
      root.append(quote);
      continue;
    }

    if (block?.kind === "ordered-item" || block?.kind === "unordered-item") {
      const ordered = block.kind === "ordered-item";
      const expectedKind = ordered ? "ordered-item" : "unordered-item";
      const list = document.createElement(ordered ? "ol" : "ul");
      let item = block;
      while (index < lines.length) {
        if (!item || item.kind !== expectedKind) break;
        const entry = document.createElement("li");
        appendInline(entry, item.content);
        list.append(entry);
        index += 1;
        item = index < lines.length ? parseAppealBlock(lines.at(index)) : null;
      }
      root.append(list);
      continue;
    }

    const paragraph = document.createElement("p");
    while (index < lines.length && lines.at(index).trim() && !parseAppealBlock(lines.at(index))) {
      if (paragraph.childNodes.length) paragraph.append(document.createElement("br"));
      appendInline(paragraph, lines.at(index));
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
