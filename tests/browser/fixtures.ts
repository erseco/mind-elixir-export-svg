/**
 * Mind maps the browser tests export. All original content written for this package (MIT);
 * `rich` covers the same features as the legacy maps of eXeLearning's mind map tests.
 */

export interface Fixture {
  data: Record<string, unknown>;
  /** Mind Elixir `direction`: 0 left, 1 right, 2 both sides, 3 top-down. */
  direction?: number;
  /** Extra Mind Elixir options. */
  mind?: Record<string, unknown>;
}

const PIXEL = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
export const PNG_DATA_URL = `data:image/png;base64,${PIXEL}`;

let counter = 0;
const node = (topic: string, extra: Record<string, unknown> = {}, children: unknown[] = []) => ({
  id: `n${++counter}`,
  topic,
  ...extra,
  ...(children.length ? { children } : {}),
});

function build() {
  counter = 0;
  const single: Fixture = { data: { nodeData: node("Solo") } };
  const three: Fixture = {
    data: { nodeData: node("Mi primer mapa", {}, [node("Primera idea"), node("Segunda idea")]) },
  };

  const rich: Fixture = {
    direction: 2,
    data: {
      nodeData: node("Ciencias de la Tierra — ñ á ü 数学 🌍", { style: { fontSize: "26px" } }, [
        node("Geología", { direction: 0, branchColor: "#8e44ad", style: { fontWeight: "bold" } }, [
          node("Minerales", { style: { color: "#2e7d32" } }, [
            node("Cuarzo", {}, [node("Sílice SiO₂", { style: { fontStyle: "italic" } })]),
          ]),
          node("Capas", { style: { textDecoration: "underline" } }),
          node("Una etiqueta bastante larga que el editor tiene que repartir en varias líneas para que quepa"),
        ]),
        node(
          "Hidrología & <clima> \"comillas\" 'simples'",
          { direction: 1, expanded: false, style: { fontStyle: "italic", textDecoration: "underline" } },
          [node("Ríos"), node("Lagos")],
        ),
        node("Atmósfera", { direction: 1, style: { background: "#fff3cd", color: "#7a4d00", fontSize: "20px" } }, [
          node("Composición", { style: { textDecoration: "line-through" } }),
        ]),
        node("Biosfera 🌱", { direction: 0, branchColor: "#c0392b" }, [node("Ecosistemas 生态"), node("Especies")]),
      ]),
    },
  };

  // 1 root + 10 branches × (1 + 2 + 2×14) = 311 nodes
  const large: Fixture = {
    direction: 2,
    data: {
      nodeData: node(
        "Mapa grande",
        {},
        Array.from({ length: 10 }, (_, b) =>
          node(
            `Rama ${b + 1}`,
            { direction: b % 2 },
            Array.from({ length: 2 }, (_, i) =>
              node(
                `Tema ${b + 1}.${i + 1}`,
                {},
                Array.from({ length: 14 }, (_, j) => node(`Idea ${b + 1}.${i + 1}.${j + 1}`)),
              ),
            ),
          ),
        ),
      ),
    },
  };

  const wide: Fixture = {
    direction: 1,
    data: {
      nodeData: node(
        "Ancho",
        {},
        Array.from({ length: 6 }, (_, i) => node(`${"Palabra ".repeat(12)}${i}`)),
      ),
    },
  };

  let deepest = node("Hoja");
  for (let i = 0; i < 25; i++) deepest = node(`Nivel ${25 - i}`, {}, [deepest]);
  const deep: Fixture = { direction: 1, data: { nodeData: node("Profundo", {}, [deepest]) } };

  const topDown: Fixture = {
    direction: 3,
    data: {
      nodeData: node("Arriba", {}, [
        node("Uno", {}, [node("Uno.a"), node("Uno.b")]),
        node("Dos"),
        node("Tres", {}, [node("Tres.a")]),
      ]),
    },
  };

  const features: Fixture = {
    direction: 2,
    data: {
      nodeData: node("Root & <b>", { id: "fr" }, [
        node("Left styled\nsecond line", {
          id: "fa",
          direction: 0,
          style: { color: "#c0392b", fontWeight: "bold", fontSize: "20px", background: "#ffddee" },
          tags: ["tag1", "tag2"],
          icons: ["😀", "📌"],
          hyperLink: "https://example.com/page?a=1&b=2",
          branchColor: "#123456",
        }),
        node("Right folded", { id: "fb", direction: 1, expanded: false }, [node("hidden")]),
        node("With image", { id: "fc", direction: 1, image: { url: PNG_DATA_URL, width: 40, height: 30 } }, [
          node("child 1", { id: "fc1" }),
          node("child 2", { id: "fc2" }),
        ]),
      ]),
      arrows: [
        { id: "ar1", label: "relates to", from: "fa", to: "fc1", delta1: { x: 0, y: -80 }, delta2: { x: 0, y: -80 } },
        {
          id: "ar2",
          label: "both ways",
          from: "fc2",
          to: "fa",
          delta1: { x: 0, y: 60 },
          delta2: { x: 0, y: 60 },
          bidirectional: true,
          style: { stroke: "#2e86de", strokeWidth: 3, strokeDasharray: "4,4", opacity: 0.8 },
        },
      ],
      summaries: [{ id: "s1", label: "summary text", parent: "fc", start: 0, end: 1 }],
    },
  };

  const hostile: Fixture = {
    direction: 1,
    data: {
      nodeData: node("</text><script>alert(1)</script>", {}, [
        node("<foreignObject>unexpected</foreignObject>"),
        node('Café & "quotes" <clima>'),
        node("%%{init: {theme: dark}}%%"),
        node("$$x=\\frac{a}{b}$$ $& $' back\\slash"),
        node("javascript link", { hyperLink: "javascript:alert(1)" }),
        node('<img src=x onerror="alert(1)">'),
      ]),
    },
  };

  const unicode: Fixture = {
    direction: 1,
    data: {
      nodeData: node("Unicode", {}, [
        node("Español: acción, pingüino, año"),
        node("Combining: é ñ ä"),
        node("中文 日本語のテキスト 한국어"),
        node("עברית: שלום עולם"),
        node("العربية: مرحبا بالعالم"),
        node("Emoji 👍🏽 👩‍👩‍👧 🇪🇸"),
        node("Math ∑∫√∞ ≤ ≥ © ™ € £ ¥"),
      ]),
    },
  };

  return { single, three, rich, large, wide, deep, topDown, features, hostile, unicode };
}

export const FIXTURES = build();
export type FixtureName = keyof typeof FIXTURES;

/** Every topic of a fixture that is drawn (folded branches hide their children). */
export function visibleTopics(fixture: Fixture): string[] {
  const out: string[] = [];
  const stack = [
    (fixture.data as { nodeData: unknown }).nodeData as { topic: string; expanded?: boolean; children?: unknown[] },
  ];
  while (stack.length) {
    const n = stack.pop()!;
    out.push(n.topic);
    if (n.expanded !== false) for (const c of [...(n.children ?? [])].reverse()) stack.push(c as typeof n);
  }
  return out;
}
