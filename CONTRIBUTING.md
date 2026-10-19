# Contributing

Thank you for helping. Issues and pull requests are welcome; please read AGENTS.md first, which
lists the rules the code follows.

## Setup

```sh
npm ci
npx playwright install chromium firefox webkit
```

## Checks

| Command                                               | What it does                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npm run check`                                       | Formatting, types, unit tests with 100% coverage of the DOM-free code, build   |
| `npm run test:e2e`                                    | Measures the layout against real Mind Elixir in Chromium, Firefox and WebKit   |
| `npm run test:package`                                | Packs the library, installs it in an empty project, renders from it in Node    |
| `npm run compare-layout`                              | Writes the layout's deviation from Mind Elixir to `docs/layout-deviation.json` |
| `npm run test:compat -- --mind-elixir-version 5.15.1` | Compares a Mind Elixir version; see docs/COMPATIBILITY.md                      |
| `npm run bench`                                       | Measures sizes and timings into `docs/benchmarks.json`                         |
| `npm run demo`                                        | Serves the demo (editor and export side by side) on http://127.0.0.1:5173      |

The layout follows Mind Elixir's stylesheet: a change to it starts with the value in Mind
Elixir's source, and `npm run compare-layout` shows its effect in each browser.
`VISUAL_OUT=dir npx playwright test tests/browser/visual.spec.ts` writes the screenshots and
difference images of the visual tests.

## Pull requests

Keep them focused, with tests for every change in behaviour, and an entry under "Unreleased" in
CHANGELOG.md.
