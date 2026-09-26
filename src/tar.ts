/**
 * Minimal ustar reader — enough for GitHub's `tarball` archives.
 * No dependencies, no Node builtins: runs unchanged in Workers.
 */
export interface TarEntry { path: string; data: Uint8Array }

const BLOCK = 512;
const decoder = new TextDecoder();

/** NUL/space-terminated field. */
function str(b: Uint8Array, off: number, len: number): string {
  const s = b.subarray(off, off + len);
  let end = s.indexOf(0);
  if (end < 0) end = s.length;
  return decoder.decode(s.subarray(0, end)).replace(/[\0 ]+$/, "");
}

function octal(b: Uint8Array, off: number, len: number): number {
  const s = str(b, off, len).trim();
  return s ? parseInt(s, 8) || 0 : 0;
}

export function parseTar(bytes: Uint8Array): TarEntry[] {
  const out: TarEntry[] = [];
  let longName: string | null = null;
  let off = 0;

  while (off + BLOCK <= bytes.length) {
    const header = bytes.subarray(off, off + BLOCK);
    if (header.every((x) => x === 0)) break; // end-of-archive
    const size = octal(header, 124, 12);
    const typeflag = String.fromCharCode(header[156]);
    const dataStart = off + BLOCK;
    const dataEnd = dataStart + size;
    off = dataStart + Math.ceil(size / BLOCK) * BLOCK;
    if (dataEnd > bytes.length) break;

    if (typeflag === "L") {
      // GNU long name: this entry's payload is the name of the NEXT entry.
      longName = decoder.decode(bytes.subarray(dataStart, dataEnd)).replace(/\0+$/, "");
      continue;
    }
    if (typeflag === "x" || typeflag === "g") { longName = null; continue; } // pax headers
    if (typeflag !== "0" && typeflag !== "\0") { longName = null; continue; } // dirs, links, …

    const prefix = str(header, 345, 155);
    const name = str(header, 0, 100);
    const path = longName ?? (prefix ? `${prefix}/${name}` : name);
    longName = null;
    out.push({ path, data: bytes.subarray(dataStart, dataEnd) });
  }
  return out;
}
