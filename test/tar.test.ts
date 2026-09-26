import { describe, expect, it } from "vitest";
import { parseTar } from "../src/tar";
import { buildTar, tarEntry } from "./tarbuild";

const enc = new TextEncoder();
const dec = new TextDecoder();

describe("parseTar", () => {
  it("reads regular files with sizes that are not multiples of 512", () => {
    const tar = buildTar(
      tarEntry("repo-sha/a.md", enc.encode("# A")),
      tarEntry("repo-sha/b.md", enc.encode("x".repeat(700))),
    );
    const e = parseTar(tar);
    expect(e.map((x) => x.path)).toEqual(["repo-sha/a.md", "repo-sha/b.md"]);
    expect(dec.decode(e[0].data)).toBe("# A");
    expect(e[1].data.length).toBe(700);
  });
  it("joins the ustar prefix field with the name", () => {
    const e = parseTar(buildTar(tarEntry("deep.md", enc.encode("d"), "0", "repo-sha/30 Resources")));
    expect(e[0].path).toBe("repo-sha/30 Resources/deep.md");
  });
  it("treats a NUL typeflag as a regular file and skips directories", () => {
    const e = parseTar(buildTar(
      tarEntry("repo/dir", new Uint8Array(0), "5"),
      tarEntry("repo/old.md", enc.encode("o"), "\0"),
    ));
    expect(e.map((x) => x.path)).toEqual(["repo/old.md"]);
  });
  it("skips pax headers and applies GNU longname entries to the next file", () => {
    const long = "repo-sha/" + "a".repeat(120) + "/note.md";
    const e = parseTar(buildTar(
      tarEntry("pax_global_header", enc.encode("52 comment=abc\n"), "g"),
      tarEntry("./PaxHeaders/x", enc.encode("30 mtime=1.0\n"), "x"),
      tarEntry("repo-sha/first.md", enc.encode("1")),
      tarEntry("././@LongLink", enc.encode(long + "\0"), "L"),
      tarEntry("repo-sha/truncated", enc.encode("2")),
    ));
    expect(e.map((x) => x.path)).toEqual(["repo-sha/first.md", long]);
    expect(dec.decode(e[1].data)).toBe("2");
  });
  it("stops at the end-of-archive blocks", () => {
    expect(parseTar(new Uint8Array(1024))).toEqual([]);
  });
});
