/** Test-only ustar writer + gzip helper, so tar/loadAll tests use real archives. */
const enc = new TextEncoder();

function writeStr(buf: Uint8Array, off: number, s: string, len: number) {
  buf.set(enc.encode(s).subarray(0, len), off);
}

export function tarEntry(name: string, data: Uint8Array, typeflag = "0", prefix = ""): Uint8Array {
  const header = new Uint8Array(512);
  writeStr(header, 0, name, 100);
  writeStr(header, 100, "0000644\0", 8);
  writeStr(header, 108, "0000000\0", 8);
  writeStr(header, 116, "0000000\0", 8);
  writeStr(header, 124, data.length.toString(8).padStart(11, "0") + "\0", 12);
  writeStr(header, 136, "00000000000\0", 12);
  writeStr(header, 148, "        ", 8); // checksum field counted as spaces
  writeStr(header, 156, typeflag, 1);
  writeStr(header, 257, "ustar\0", 6);
  writeStr(header, 263, "00", 2);
  writeStr(header, 345, prefix, 155);
  let sum = 0;
  for (const b of header) sum += b;
  writeStr(header, 148, sum.toString(8).padStart(6, "0") + "\0 ", 8);

  const out = new Uint8Array(512 + Math.ceil(data.length / 512) * 512);
  out.set(header, 0);
  out.set(data, 512);
  return out;
}

export function buildTar(...blocks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0) + 1024);
  let off = 0;
  for (const b of blocks) { out.set(b, off); off += b.length; }
  return out; // trailing 1024 zero bytes = end of archive
}

export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const src = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close(); } });
  return new Uint8Array(await new Response(src.pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
}

/** A gzipped tarball shaped like GitHub's: every path under `<owner>-<repo>-<sha>/`. */
export function vaultTarball(files: Map<string, string>, prefix = "example-user-vault-abc123"): Promise<Uint8Array> {
  const entries = [...files].map(([path, content]) =>
    tarEntry(`${prefix}/${path}`, enc.encode(content)));
  return gzip(buildTar(...entries));
}
