function encodeHeaderCharacter(value) {
  return `%${value.codePointAt(0).toString(16).toUpperCase()}`;
}

export function appealAttachmentDisposition(record) {
  const encodedName = encodeURIComponent(record.displayName).replace(/['()*]/g, encodeHeaderCharacter);
  const presentation = record.mimeType.startsWith("image/") ? "inline" : "attachment";
  return `${presentation}; filename*=UTF-8''${encodedName}`;
}

/** Builds a private, non-sniffable response for player and staff evidence downloads. */
export function appealAttachmentResponse(object, record) {
  return new Response(object.body, {
    headers: {
      "content-type": record.mimeType,
      "content-length": String(object.size ?? record.byteSize),
      "content-disposition": appealAttachmentDisposition(record),
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff"
    }
  });
}
