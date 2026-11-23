# Pagination evaluation

Private offline evaluation of the real `src/content.ts` candidate selection. It is not part
of the shipped extension.

## Boundary

- Use public, non-authenticated pages that permit crawling, or openly released snapshots.
- Keep raw HTML and source URLs outside git and outside prompts. Pass the source by path.
- Store only normalized fixtures. They use `example.test` origins and contain structure,
  canonical labels, and control keys, never raw HTML, hosts, paths, or identifying text.
- Evaluation is offline. It does not load target sites or call Jev; `jevCalls` is `0`.
- Synthetic keyboard events are trusted only inside this harness; production has no test
  bypass.

## Source and run

The intake source is JSONL with `url`, `html`, and `expected` (`previous`/`next` as a
destination URL, an array, or `null`). Expected destinations currently match anchor
`href`s. Add `"skip": true` to skip a record.

```sh
mise run check

bun test/pagination-eval/intake.ts \
  --input path/to/private/source.jsonl \
  --out path/to/private/fixtures.jsonl

bun test/pagination-eval/run.ts \
  --fixtures path/to/private/fixtures.jsonl \
  --report path/to/private/report.json \
  --regressions path/to/private/regressions.jsonl
```

The committed clean path is:

```sh
bun test/pagination-eval/run.ts --fixtures test/fixtures/pagination-eval/cases.jsonl
```

It covers local links, numbered lists, metadata, buttons, icon controls, cross-site and
form controls, hidden/disabled controls, non-adjacent numbers, older/newer wording, and a
fallback-requesting decoy.

## Result counts

`fixtures` are unique SHA-256-deduplicated cases; `duplicates`, `unsupported`, `skipped`,
and `mismatches` account for discarded or failed observations. `uniqueShapes` normalizes
route ids and page numbers so repeated templates do not count as independent patterns.
`localCases` and `fallbackCases`/`fallbackDirections` show where Jev would be needed.

## Regression and limits

`--regressions` writes each failed normalized fixture for review and replay. Intake captures
pagination-like regions only; unknown text becomes `label`, CSS-only visibility is
approximated, and JS-only buttons need a richer labeled source.
