import { describe, expect, it } from "vitest";
import {
  decodeDataUrl,
  encodeDataUrl,
  rasterDataUrl,
  safeLink,
  safePathData,
  sniffRaster,
} from "../../src/security.js";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const GIF = new TextEncoder().encode("GIF89a");
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const AVIF = Uint8Array.from([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
const AVIS = Uint8Array.from([0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x73]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

describe("safeLink", () => {
  it("keeps http, https and mailto links", () => {
    expect(safeLink("https://example.com/a?b=1#c")).toBe("https://example.com/a?b=1#c");
    expect(safeLink(" http://example.com ")).toBe("http://example.com/");
    expect(safeLink("mailto:a@example.com")).toBe("mailto:a@example.com");
  });

  it("refuses scripts, data, files and relative or invalid links", () => {
    for (const href of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>",
      "file:///etc/passwd",
      "vbscript:x",
      "/relative",
      "not a url",
      "",
    ]) {
      expect(safeLink(href)).toBeNull();
    }
  });
});

describe("safePathData", () => {
  it("keeps path commands and numbers, collapsing whitespace", () => {
    expect(safePathData("M 116 48 C 146 48\n146 48 176 48 H 227")).toBe("M 116 48 C 146 48 146 48 176 48 H 227");
    expect(safePathData("M1e-3,2.5E+2 l-1-2z")).toBe("M1e-3,2.5E+2 l-1-2z");
  });

  it("refuses anything else", () => {
    for (const d of ['M0 0"/><script>', "M0 0 url(x)", "", "   ", "e1", "M0 0 e5", "M0 0 L1 1 x"])
      expect(safePathData(d)).toBeNull();
    expect(safePathData("M0 0", 2)).toBeNull();
  });
});

describe("images", () => {
  it("recognizes raster formats by their bytes", () => {
    expect(sniffRaster(PNG)).toBe("image/png");
    expect(sniffRaster(JPEG)).toBe("image/jpeg");
    expect(sniffRaster(GIF)).toBe("image/gif");
    expect(sniffRaster(WEBP)).toBe("image/webp");
    expect(sniffRaster(AVIF)).toBe("image/avif");
    expect(sniffRaster(AVIS)).toBe("image/avif");
    expect(sniffRaster(SVG)).toBeNull();
    expect(sniffRaster(new Uint8Array())).toBeNull();
  });

  it("decodes and encodes base64 data URLs", () => {
    const url = encodeDataUrl("image/png", PNG);
    expect(url).toBe(`data:image/png;base64,${Buffer.from(PNG).toString("base64")}`);
    expect(decodeDataUrl(url)).toEqual({ type: "image/png", bytes: PNG });
    expect(decodeDataUrl("data:;charset=utf-8;base64,QUJD")).toEqual({
      type: "",
      bytes: new TextEncoder().encode("ABC"),
    });
    expect(decodeDataUrl("data:image/png,raw")).toBeNull();
    expect(decodeDataUrl("data:image/png;base64,@@@")).toBeNull();
    expect(decodeDataUrl("data:image/png;base64,QQ=")).toBeNull();
    expect(decodeDataUrl("https://example.com/a.png")).toBeNull();
  });

  it("encodes large images in chunks", () => {
    const big = new Uint8Array(100_000);
    big.set(PNG);
    expect(decodeDataUrl(encodeDataUrl("image/png", big))?.bytes).toEqual(big);
  });

  it("re-encodes only real raster images within the size limit", () => {
    expect(rasterDataUrl(PNG, 100)).toEqual({ url: encodeDataUrl("image/png", PNG) });
    // An SVG (which could carry script) is refused even when labelled as PNG
    expect(rasterDataUrl(SVG, 1000)).toEqual({ reason: "the image is not PNG, JPEG, GIF, WebP or AVIF" });
    expect(rasterDataUrl(PNG, 4)).toEqual({ reason: "the image is larger than 4 bytes" });
  });
});
