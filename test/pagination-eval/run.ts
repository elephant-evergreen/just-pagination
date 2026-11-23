import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { resolve } from "node:path";
import { fixtureShapeDigest, parseFixture } from "./fixture.ts";
import type { Direction, Expected, Fixture } from "./fixture.ts";
import { evaluateFixture } from "./harness.ts";

type Failure = {
  id: string;
  expected: Expected;
  actual: Record<Direction, string | null>;
  fallbackDirections: Direction[];
  mismatchDirections: Direction[];
};

type Summary = {
  read: number;
  fixtures: number;
  duplicates: number;
  unsupported: number;
  skipped: number;
  positives: number;
  negatives: number;
  mixed: number;
  uniqueShapes: number;
  passedCases: number;
  failedCases: number;
  mismatches: number;
  localCases: number;
  fallbackCases: number;
  fallbackDirections: Record<Direction, number>;
  expectedDirections: Record<Direction, number>;
  jevCalls: 0;
  reasons: Record<string, number>;
};

const directions: Direction[] = ["previous", "next"];

const fixturesPath = option("fixtures");
if (!fixturesPath) {
  console.error("Usage: bun test/pagination-eval/run.ts --fixtures <fixtures.jsonl> [--report <report.json>] [--regressions <failed.jsonl>] [--limit <n>]");
  process.exit(2);
}
const reportPath = option("report");
const regressionsPath = option("regressions");
const limit = parseLimit(option("limit"));
if (regressionsPath && resolve(regressionsPath) === resolve(fixturesPath)) {
  console.error("The regression output must differ from the fixture input.");
  process.exit(2);
}
if (reportPath && resolve(reportPath) === resolve(fixturesPath)) {
  console.error("The report must differ from the fixture input.");
  process.exit(2);
}
if (reportPath && regressionsPath && resolve(reportPath) === resolve(regressionsPath)) {
  console.error("The report and regression outputs must differ.");
  process.exit(2);
}

const summary: Summary = {
  read: 0,
  fixtures: 0,
  duplicates: 0,
  unsupported: 0,
  skipped: 0,
  positives: 0,
  negatives: 0,
  mixed: 0,
  uniqueShapes: 0,
  passedCases: 0,
  failedCases: 0,
  mismatches: 0,
  localCases: 0,
  fallbackCases: 0,
  fallbackDirections: { previous: 0, next: 0 },
  expectedDirections: { previous: 0, next: 0 },
  jevCalls: 0,
  reasons: {},
};
const failures: Failure[] = [];
const maxFailures = 1000;
const seen = new Set<string>();
const shapes = new Set<string>();
const regressionWriter = regressionsPath ? Bun.file(regressionsPath).writer() : undefined;
let completed = false;

try {
  const input = Readable.fromWeb(Bun.file(fixturesPath).stream() as never);
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    summary.read++;
    if (limit !== undefined && summary.read > limit) break;
    let fixture: Fixture;
    try {
      fixture = await parseFixture(JSON.parse(line) as unknown);
    } catch {
      summary.unsupported++;
      reason("fixture");
      continue;
    }
    if (seen.has(fixture.id)) {
      summary.duplicates++;
      continue;
    }
    seen.add(fixture.id);
    summary.fixtures++;
    const shape = await fixtureShapeDigest(fixture);
    if (!shapes.has(shape)) {
      shapes.add(shape);
      summary.uniqueShapes = shapes.size;
    }
    const labeled = directions.filter(direction => fixture.expected[direction] !== undefined);
    if (labeled.length === 0) {
      summary.skipped++;
      reason("unlabeled");
      continue;
    }
    const expectedPrevious = fixture.expected.previous;
    const expectedNext = fixture.expected.next;
    const hasPositive = Boolean(expectedPrevious?.length || expectedNext?.length);
    const hasNegative = expectedPrevious?.length === 0 || expectedNext?.length === 0;
    if (!hasPositive) summary.negatives++;
    else if (hasNegative) summary.mixed++;
    else summary.positives++;
    for (const direction of directions) {
      if (fixture.expected[direction] !== undefined) summary.expectedDirections[direction]++;
    }
    const evaluated = await evaluateFixture(fixture);
    if (evaluated.harnessError) {
      summary.unsupported++;
      reason("harness");
      continue;
    }
    if (evaluated.fallbackDirections.length) {
      summary.fallbackCases++;
      for (const direction of evaluated.fallbackDirections) summary.fallbackDirections[direction]++;
    } else {
      summary.localCases++;
    }
    const mismatchDirections: Direction[] = [];
    for (const direction of labeled) {
      const expected = fixture.expected[direction]!;
      const actual = evaluated.actual[direction];
      const passes = expected.length === 0 ? actual === null : actual !== null && expected.includes(actual);
      if (!passes) mismatchDirections.push(direction);
    }
    if (mismatchDirections.length) {
      summary.failedCases++;
      summary.mismatches += mismatchDirections.length;
      if (failures.length < maxFailures) {
        failures.push({
          id: fixture.id,
          expected: fixture.expected,
          actual: evaluated.actual,
          fallbackDirections: evaluated.fallbackDirections,
          mismatchDirections,
        });
      }
      if (regressionWriter) await regressionWriter.write(JSON.stringify(fixture) + "\n");
    } else {
      summary.passedCases++;
    }
  }
  completed = true;
} catch {
  console.error("Evaluation failed before a report was written.");
  process.exitCode = 1;
} finally {
  if (regressionWriter) await regressionWriter.end();
}

if (completed) {
  if (reportPath) {
    try {
      await Bun.write(reportPath, JSON.stringify({
        version: 1,
        summary,
        failures,
        omittedFailures: Math.max(0, summary.failedCases - failures.length),
      }, null, 2) + "\n");
    } catch {
      console.error("The report could not be written.");
      process.exitCode = 1;
    }
  }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.unsupported || summary.mismatches || summary.passedCases + summary.failedCases === 0) process.exitCode = 1;
}

function option(name: string): string | undefined {
  const index = Bun.argv.indexOf(`--${name}`);
  if (index < 0) return;
  const value = Bun.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return;
  if (!/^[1-9]\d{0,6}$/.test(value)) {
    console.error("--limit must be a positive integer.");
    process.exit(2);
  }
  return Number(value);
}

function reason(code: string) {
  summary.reasons[code] = (summary.reasons[code] ?? 0) + 1;
}
