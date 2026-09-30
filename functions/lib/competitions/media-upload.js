function joinedChunks(chunks, total) {
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

async function readChunks(reader, limit) {
  const chunks = [];
  let total = 0;
  let done = false;
  try {
    while (!done) {
      const next = await reader.read();
      done = next.done;
      if (done) break;
      const { value } = next;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel("image_too_large").catch(() => {});
        throw new Error("image_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return { chunks, total };
}

export function requestMimeType(request) {
  return String(request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

export async function readLimitedBody(request, limit) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new Error("image_too_large");
  if (!request.body) throw new Error("image_empty");
  const { chunks, total } = await readChunks(request.body.getReader(), limit);
  if (!total) throw new Error("image_empty");
  return joinedChunks(chunks, total);
}
