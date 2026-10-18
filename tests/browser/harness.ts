// Bundled by scripts/build-harness.mjs for the browser tests, the benchmark and the demo:
// Mind Elixir and this library from source, exposed on `window.harness`.
import MindElixir from "mind-elixir";
import * as exporter from "../../src/index.js";

Object.assign(window, { harness: { MindElixir, ...exporter } });
