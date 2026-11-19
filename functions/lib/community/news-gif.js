import { validDimensions } from '../competitions/media-policy.js';

const ascii = new TextDecoder();
const invalid = () => { throw new Error('unsupported_or_invalid_image'); };

function colorTableBytes(flags) {
  return flags & 0x80 ? 3 * (2 << (flags & 7)) : 0;
}

function subBlocksEnd(bytes, offset) {
  while (offset < bytes.length) {
    const size = bytes[offset++];
    if (!size) return offset;
    offset += size;
  }
  return invalid();
}

function fitsCanvas(view,width,height) {
  const w = view.getUint16(5,true), h = view.getUint16(7,true);
  return validDimensions(w,h) && view.getUint16(1,true)+w <= width && view.getUint16(3,true)+h <= height;
}

function frameEnd(bytes, start, width, height) {
  if (start + 10 > bytes.length) return invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, 10);
  if (!fitsCanvas(view,width,height)) return invalid();
  const code = start + 10 + colorTableBytes(bytes[start+9]);
  if (code + 1 >= bytes.length || bytes[code] < 2 || bytes[code] > 8 || !bytes[code+1]) return invalid();
  return subBlocksEnd(bytes,code+1);
}

function extension(bytes, start) {
  const label = bytes[start+1];
  const end = subBlocksEnd(bytes,start+2);
  if (label === 0xf9) {
    if (bytes[start+2] !== 4 || end !== start+8) return invalid();
    return {end,keep:true};
  }
  // Keep only the standard looping command. Drop comments and application metadata.
  return {end,keep:label === 0xff && isLoopCommand(bytes,start,end)};
}

function isLoopCommand(bytes,start,end) {
  const app = ascii.decode(bytes.subarray(start+3,start+14));
  return ['NETSCAPE2.0','ANIMEXTS1.0'].includes(app) && bytes[start+2] === 11 && end === start+19 && bytes[start+14] === 3 && bytes[start+15] === 1;
}

function gifBlocks(bytes,offset,width,height) {
  const output = new Uint8Array(bytes.length);
  output.set(bytes.subarray(0,offset));
  let written = offset, frames = 0;
  while (offset < bytes.length) {
    const start = offset;
    switch (bytes[start]) {
      case 0x2c:
        offset = frameEnd(bytes,start,width,height);
        frames++;
        break;
      case 0x21: {
        const block = extension(bytes,start);
        offset = block.end;
        if (!block.keep) continue;
        break;
      }
      case 0x3b:
        if (!frames || start+1 !== bytes.length) return invalid();
        output[written++] = 0x3b;
        return output.subarray(0,written);
      default:
        return invalid();
    }
    output.set(bytes.subarray(start,offset),written);
    written += offset-start;
  }
  return invalid();
}

export function inspectNewsGif(bytes) {
  const header = ascii.decode(bytes.subarray(0,6));
  if (!['GIF87a','GIF89a'].includes(header)) return null;
  try {
    if (bytes.length < 13) return invalid();
    const view = new DataView(bytes.buffer,bytes.byteOffset,13);
    const width = view.getUint16(6,true), height = view.getUint16(8,true);
    if (!validDimensions(width,height)) return invalid();
    const offset = 13 + colorTableBytes(bytes[10]);
    if (offset >= bytes.length) return invalid();
    const data = gifBlocks(bytes,offset,width,height);
    return {ok:true,mimeType:'image/gif',width,height,data};
  } catch {
    return {ok:false,error:'unsupported_or_invalid_image'};
  }
}
