import { describe, expect, it } from "vitest";
import { attributes, element, escapeXml, num } from "../../src/svg/xml.js";
import { parseSvg } from "./helpers.js";

const HOSTILE = [
  "</text><script>alert(1)</script>",
  "<foreignObject>unexpected</foreignObject>",
  'Café & "quotes" <clima>',
  "%%{init: {theme: dark}}%%",
  "$$x=\\frac{a}{b}$$ $& $` $' $1",
  "back\\slash ' apostrophe",
  "👩🏽‍💻 数学 עברית العربية",
];

describe("escapeXml", () => {
  it("keeps hostile text as text, character for character", () => {
    for (const text of HOSTILE) {
      const doc = parseSvg(`<t a="${escapeXml(text)}">${escapeXml(text)}</t>`);
      const root = doc.documentElement!;
      expect(root.textContent).toBe(text);
      expect(root.getAttribute("a")).toBe(text);
      expect(root.childNodes.length).toBe(1);
    }
  });

  it("drops characters XML cannot hold and replaces lone surrogates", () => {
    expect(escapeXml("a\u0000b\u0008c\u000bd\u001fe￿")).toBe("abcde");
    expect(escapeXml("tab\tnew\nline\r")).toBe("tab\tnew\nline\r");
    expect(escapeXml("x\ud800y\udc00z")).toBe("x�y�z");
    expect(escapeXml("😀")).toBe("😀");
  });
});

describe("num", () => {
  it("rounds to two decimals", () => {
    expect(num(1)).toBe("1");
    expect(num(1.005)).toBe("1");
    expect(num(2.345678)).toBe("2.35");
    expect(num(-0.001)).toBe("0");
    expect(num(-0)).toBe("0");
    expect(num(-12.5)).toBe("-12.5");
  });

  it("refuses non-finite numbers", () => {
    for (const v of [Number.NaN, Infinity, -Infinity]) expect(() => num(v)).toThrow(RangeError);
  });
});

describe("attributes and element", () => {
  it("writes attributes in order and skips missing values", () => {
    expect(attributes({ a: 1.234, b: undefined, c: null, d: false, e: "x&y" })).toBe(' a="1.23" e="x&amp;y"');
  });

  it("refuses attribute names that could inject markup", () => {
    expect(() => attributes({ 'x" onload="alert(1)': "1" })).toThrow(RangeError);
    expect(() => attributes({ "": "1" })).toThrow(RangeError);
  });

  it("self-closes empty elements", () => {
    expect(element("rect", { x: 0 })).toBe('<rect x="0"/>');
    expect(element("g", {}, "")).toBe("<g/>");
    expect(element("g", {}, "<x/>")).toBe("<g><x/></g>");
  });
});
