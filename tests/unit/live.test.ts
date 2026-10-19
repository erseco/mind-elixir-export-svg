import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSvgExportPlugin,
  renderSvg,
  THEME,
  type SvgExportOptions,
  type WithVectorSvgExport,
} from "../../src/index.js";
import { cssVarDiffers, readLiveCssVars } from "../../src/live.js";
import { DARK_THEME } from "../../src/theme.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readLiveCssVars", () => {
  it("reads only the allow-listed variables, and nothing without a browser", () => {
    expect(readLiveCssVars({ nodeType: 1 })).toBeUndefined();
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
    expect(readLiveCssVars(null)).toBeUndefined();
    expect(readLiveCssVars("box")).toBeUndefined();
    expect(readLiveCssVars({ nodeType: 3 })).toBeUndefined();
    vi.stubGlobal("getComputedStyle", () => {
      throw new Error("detached");
    });
    expect(readLiveCssVars({ nodeType: 1 })).toBeUndefined();
    vi.stubGlobal("getComputedStyle", () => undefined);
    expect(readLiveCssVars({ nodeType: 1 })).toBeUndefined();
    vi.stubGlobal("getComputedStyle", () => ({}));
    expect(readLiveCssVars({ nodeType: 1 })).toBeUndefined();
    vi.stubGlobal(
      "getComputedStyle",
      () =>
        ({
          getPropertyValue: (name: string) => (name === "--bgcolor" ? "  #112233  " : " "),
        }) as unknown as CSSStyleDeclaration,
    );
    expect(readLiveCssVars({ nodeType: 1 })).toEqual({ "--bgcolor": "#112233" });
  });
});

describe("cssVarDiffers", () => {
  it("treats the same colour or length as the same value", () => {
    expect(cssVarDiffers("50px  80px", "50px 80px")).toBe(false);
    expect(cssVarDiffers("#f6f6f6", "rgb(246, 246, 246)")).toBe(false);
    expect(cssVarDiffers("#000000", "#ffffff")).toBe(true);
    expect(cssVarDiffers("#00000000", "#000000")).toBe(true);
    expect(cssVarDiffers("30px", "30.00px")).toBe(false);
    expect(cssVarDiffers("30px", "15px")).toBe(true);
    expect(cssVarDiffers("#ffffff", "30px")).toBe(true);
    expect(cssVarDiffers(undefined, "solid")).toBe(true);
    expect(cssVarDiffers("solid", "dashed")).toBe(true);
  });
});

describe("plugin live theme", () => {
  const data = { nodeData: { id: "r", topic: "T", children: [{ id: "c", topic: "C" }] } };

  function install(theme: unknown, options?: SvgExportOptions, defaults?: SvgExportOptions) {
    const mind = { getData: () => data, theme, container: { nodeType: 1 } };
    createSvgExportPlugin(defaults)(mind as never);
    return (mind as WithVectorSvgExport).exportVectorSvg(options);
  }

  it("keeps the SVG when the container shows the declared theme", async () => {
    vi.stubGlobal(
      "getComputedStyle",
      () =>
        ({
          getPropertyValue: (name: string) =>
            name === "--bgcolor" ? "rgb(246, 246, 246)" : (THEME.cssVar?.[name] ?? ""),
        }) as unknown as CSSStyleDeclaration,
    );
    const viaPlugin = await install(THEME);
    expect(viaPlugin.svg).toBe((await renderSvg(data)).svg);
    // No declared theme, and the container adds nothing: still the light theme
    vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }) as unknown as CSSStyleDeclaration);
    expect((await install(undefined)).svg).toBe((await renderSvg(data)).svg);
  });

  it("uses a container override, and an explicit theme instead of one", async () => {
    vi.stubGlobal(
      "getComputedStyle",
      () =>
        ({
          getPropertyValue: (name: string) => (name === "--bgcolor" ? "#112233" : ""),
        }) as unknown as CSSStyleDeclaration,
    );
    const overridden = await install({
      name: "Latte",
      type: "light",
      palette: ["#abcdef", 1],
      cssVar: { bad: 2, "--color": "#eeeeee" },
    });
    expect(overridden.svg).toContain('fill="#112233"');
    expect(overridden.svg).toContain('stroke="#abcdef"');
    await install({ type: "light", palette: ["#111111"], cssVar: ["nope"] });
    await install({ palette: ["#222222"], type: "blue", name: 3 });

    const dark = await install({ type: "dark", name: "Night", palette: [], cssVar: null });
    expect(dark.svg).toContain('fill="#112233"');
    expect(dark.svg.toLowerCase()).toContain((DARK_THEME.palette[0] as string).toLowerCase());

    const bare = await install({ palette: "nope" });
    expect(bare.svg).toContain('fill="#112233"');
    expect(bare.svg).toContain('stroke="#dd7878"');

    const explicit = await install(THEME, { theme: THEME });
    expect(explicit.svg).toContain('fill="#f6f6f6"');
    expect(explicit.svg).not.toContain("#112233");
    const fromDefaults = await install(THEME, undefined, { theme: THEME });
    expect(fromDefaults.svg).not.toContain("#112233");
  });
});
