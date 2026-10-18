import { parseColor, type Color } from "./css.js";

/** A Mind Elixir theme: `palette` colours main branches, `cssVar` sets sizes and colours. */
export interface Theme {
  name?: string;
  palette: readonly string[];
  cssVar: Readonly<Record<string, string>>;
}

// Mind Elixir 5.15.1's built-in themes (src/const.ts, MIT, (c) 2019 DjZhou)
export const THEME: Theme = {
  name: "Latte",
  palette: [
    "#dd7878",
    "#ea76cb",
    "#8839ef",
    "#e64553",
    "#fe640b",
    "#df8e1d",
    "#40a02b",
    "#209fb5",
    "#1e66f5",
    "#7287fd",
  ],
  cssVar: {
    "--node-gap-x": "30px",
    "--node-gap-y": "10px",
    "--main-gap-x": "65px",
    "--main-gap-y": "45px",
    "--root-radius": "30px",
    "--main-radius": "20px",
    "--root-color": "#ffffff",
    "--root-bgcolor": "#4c4f69",
    "--root-border-color": "rgba(0, 0, 0, 0)",
    "--main-border": "",
    "--main-color": "#444446",
    "--main-bgcolor": "#ffffff",
    "--main-bgcolor-transparent": "rgba(255, 255, 255, 0.8)",
    "--topic-padding": "3px",
    "--color": "#777777",
    "--bgcolor": "#f6f6f6",
    "--map-padding": "50px 80px",
  },
};

export const DARK_THEME: Theme = {
  name: "Dark",
  palette: [
    "#848FA0",
    "#748BE9",
    "#D2F9FE",
    "#4145A5",
    "#789AFA",
    "#706CF4",
    "#EF987F",
    "#775DD5",
    "#FCEECF",
    "#DA7FBC",
  ],
  cssVar: {
    ...THEME.cssVar,
    "--root-bgcolor": "#2d3748",
    "--root-border-color": "rgba(255, 255, 255, 0.1)",
    "--main-color": "#ffffff",
    "--main-bgcolor": "#4c4f69",
    "--main-bgcolor-transparent": "rgba(76, 79, 105, 0.8)",
    "--color": "#cccccc",
    "--bgcolor": "#252526",
  },
};

/** The values of a theme the layout uses, parsed. */
export interface ResolvedTheme {
  palette: string[];
  nodeGapX: number;
  nodeGapY: number;
  mainGapX: number;
  mainGapY: number;
  rootRadius: number;
  mainRadius: number;
  topicPadding: number;
  mapPadding: { top: number; right: number; bottom: number; left: number };
  rootColor: Color | null;
  rootBackground: Color | null;
  rootBorder: Color | null;
  /** `--main-border` as width and colour; `null` = 2px in the branch colour. */
  mainBorder: { width: number; color: Color | null } | null;
  mainColor: Color | null;
  mainBackground: Color | null;
  labelBackground: Color | null;
  color: Color | null;
  background: Color | null;
}

function px(value: string, fallback: number): number {
  const m = /^\s*(-?[\d.]+)px\s*$/.exec(value);
  const n = m ? parseFloat(m[1] as string) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Reads a theme, falling back to the default theme's value for anything it lacks. */
export function resolveTheme(theme: Theme): ResolvedTheme {
  // Every variable read is in the default theme
  const v = (name: string) => theme.cssVar[name] ?? (THEME.cssVar[name] as string);
  const color = (name: string) => parseColor(v(name));
  const padding = v("--map-padding")
    .trim()
    .split(/\s+/)
    .map((p) => px(p, 0));
  const [t, r = t, b = t, l = r] = padding as [number, ...number[]];
  const border = v("--main-border").trim();
  let mainBorder: ResolvedTheme["mainBorder"] = null;
  if (border) {
    const width = /(\d+(?:\.\d+)?)px/.exec(border);
    const rest = border.replace(/\d+(?:\.\d+)?px|solid|dashed|dotted/g, " ").trim();
    mainBorder = { width: width ? parseFloat(width[1] as string) : 2, color: rest ? parseColor(rest) : null };
  }
  return {
    palette: theme.palette.length ? [...theme.palette] : [...THEME.palette],
    nodeGapX: px(v("--node-gap-x"), 30),
    nodeGapY: px(v("--node-gap-y"), 10),
    mainGapX: px(v("--main-gap-x"), 65),
    mainGapY: px(v("--main-gap-y"), 45),
    rootRadius: px(v("--root-radius"), 30),
    mainRadius: px(v("--main-radius"), 20),
    topicPadding: px(v("--topic-padding"), 3),
    mapPadding: { top: t, right: r, bottom: b, left: l },
    rootColor: color("--root-color"),
    rootBackground: color("--root-bgcolor"),
    rootBorder: color("--root-border-color"),
    mainBorder,
    mainColor: color("--main-color"),
    mainBackground: color("--main-bgcolor"),
    labelBackground: color("--main-bgcolor-transparent"),
    color: color("--color"),
    background: color("--bgcolor"),
  };
}
