import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Window } from "happy-dom";
import { inertHtml, intakeRecord } from "../tools/pagination-eval/intake.ts";
import { fixtureShapeDigest, parseFixture, sealFixture } from "../tools/pagination-eval/fixture.ts";
import type { FixturePayload } from "../tools/pagination-eval/fixture.ts";
import { evaluateFixture } from "../tools/pagination-eval/harness.ts";

const root = join(import.meta.dir, "..");
const temporaryDirectories: string[] = [];

afterAll(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true });
});

describe("sanitized intake", () => {
  test("removes source identity and produces an evaluable structural fixture", async () => {
    const source = new Window({ url: "https://source.invalid/catalog?page=2" });
    const document = source.document;
    const head = document.createElement("link");
    head.rel = "next alternate";
    head.href = "/catalog?page=3";
    document.head.append(head);
    const nav = document.createElement("nav");
    nav.className = "brandone-pagination";
    nav.setAttribute("aria-label", "BrandOne pagination");
    const previous = document.createElement("a");
    previous.href = "/catalog?page=1";
    previous.setAttribute("aria-label", "Previous page");
    previous.setAttribute("data-account", "person@example.invalid");
    previous.setAttribute("onclick", "steal()");
    previous.textContent = "Previous";
    const current = document.createElement("span");
    current.setAttribute("aria-current", "page");
    current.textContent = "2";
    const next = document.createElement("a");
    next.href = "/catalog?page=3";
    next.textContent = "Next";
    nav.append(previous, current, next);
    const iframe = document.createElement("iframe");
    iframe.src = "/catalog?page=9";
    const input = document.createElement("input");
    input.setAttribute("aria-label", "Next");
    input.name = "account";
    const image = document.createElement("img");
    image.src = "/secret.png";
    image.alt = "Next";
    const form = document.createElement("form");
    form.action = "/submit-brandone";
    form.method = "post";
    const formButton = document.createElement("button");
    formButton.textContent = "Next";
    form.append(formButton);
    nav.append(iframe, input, image, form);
    const main = document.createElement("main");
    main.textContent = "BrandOne customer Alice person@example.invalid";
    document.body.append(main, nav);
    const script = document.createElement("script");
    script.textContent = "BrandOne secret";
    document.body.append(script);
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/brandone.css";
    document.head.append(stylesheet);
    const raw = document.documentElement.outerHTML;
    const result = await intakeRecord({
      url: "https://source.invalid/catalog?page=2",
      html: raw,
      expected: { previous: "/catalog?page=1", next: "/catalog?page=3" },
    });
    const inert = await inertHtml(raw);
    source.happyDOM.close();

    expect(inert).not.toContain("<script");
    expect(inert).not.toContain("<iframe");
    expect(inert).not.toContain("<input");
    expect(inert).not.toContain("<img");
    expect(inert).not.toContain("stylesheet");
    expect(inert).not.toContain("action=");
    expect(inert).not.toContain("data-account");
    expect(inert).not.toContain("onclick");
    expect(inert).not.toContain("method=");
    expect(inert).toContain('rel="next"');
    expect(inert).not.toContain("alternate");
    expect(inert).toContain('aria-label="Previous page"');
    expect(result.status).toBe("written");
    if (result.status !== "written") return;
    const serialized = JSON.stringify(result.fixture);
    expect(serialized).not.toContain("BrandOne");
    expect(serialized).not.toContain("source.invalid");
    expect(serialized).not.toContain("catalog");
    expect(serialized).not.toContain("person@example.invalid");
    expect(serialized).not.toContain("data-account");
    expect(result.fixture.url).toStrictEqual({ site: "same", route: 1, shape: "query", page: 2, key: "page" });
    expect(result.fixture.expected).toStrictEqual({ previous: ["c1"], next: ["c2"] });
    expect(JSON.stringify(result.fixture.body)).toContain('"ariaCurrent":"page"');
    const evaluated = await evaluateFixture(result.fixture);
    expect(evaluated.actual).toStrictEqual({ previous: "c1", next: "c2" });
    expect(evaluated.fallbackDirections).toStrictEqual([]);
  });


  test("runs the sanitized intake and evaluator CLI end to end without source leakage", async () => {
    const directory = mkdtempSync(join(tmpdir(), "just-pagination-eval-"));
    temporaryDirectories.push(directory);
    const source = new Window({ url: "https://source.invalid/list?page=2" });
    const document = source.document;
    const nav = document.createElement("nav");
    nav.className = "brandone-pagination";
    nav.setAttribute("aria-label", "BrandOne pagination");
    const previous = document.createElement("a");
    previous.href = "/list?page=1";
    previous.textContent = "Previous";
    const current = document.createElement("span");
    current.setAttribute("aria-current", "page");
    current.textContent = "2";
    const next = document.createElement("a");
    next.href = "/list?page=3";
    next.textContent = "Next";
    nav.append(previous, current, next);
    document.body.append(nav);
    const sourcePath = join(directory, "source.jsonl");
    await Bun.write(sourcePath, JSON.stringify({
      url: "https://source.invalid/list?page=2",
      html: document.documentElement.outerHTML,
      expected: { previous: "/list?page=1", next: "/list?page=3" },
    }) + "\n");
    source.happyDOM.close();
    const fixturesPath = join(directory, "fixtures.jsonl");
    const intake = Bun.spawnSync([
      process.execPath,
      "tools/pagination-eval/intake.ts",
      "--input",
      sourcePath,
      "--out",
      fixturesPath,
    ], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(intake.exitCode).toBe(0);
    const normalized = await Bun.file(fixturesPath).text();
    expect(normalized).not.toContain("BrandOne");
    expect(normalized).not.toContain("source.invalid");
    const evaluation = Bun.spawnSync([
      process.execPath,
      "tools/pagination-eval/run.ts",
      "--fixtures",
      fixturesPath,
    ], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(evaluation.exitCode).toBe(0);
    expect(evaluation.stdout.toString()).toContain('"passedCases": 1');
  });
  test("counts duplicate structures once by content digest", async () => {
    const source = new Window({ url: "https://source.invalid/list?page=2" });
    const document = source.document;
    const nav = document.createElement("nav");
    nav.setAttribute("aria-label", "Pagination");
    const previous = document.createElement("a");
    previous.href = "/list?page=1";
    previous.textContent = "Previous";
    const next = document.createElement("a");
    next.href = "/list?page=3";
    next.textContent = "Next";
    nav.append(previous, next);
    document.body.append(nav);
    const record = {
      url: "https://source.invalid/list?page=2",
      html: document.documentElement.outerHTML,
      expected: { previous: "/list?page=1", next: "/list?page=3" },
    };
    source.happyDOM.close();
    const first = await intakeRecord(record);
    const second = await intakeRecord(record);
    expect(first.status).toBe("written");
    expect(second.status).toBe("written");
    if (first.status !== "written" || second.status !== "written") return;
    expect(second.fixture.id).toBe(first.fixture.id);
    expect(await fixtureShapeDigest(second.fixture)).toBe(await fixtureShapeDigest(first.fixture));
  });
});

describe("offline evaluation", () => {
  test("runs the production candidate selection against every normalized fixture", async () => {
    const text = await Bun.file(join(root, "test/fixtures/pagination-eval/cases.jsonl")).text();
    const fixtures = await Promise.all(text.trim().split("\n").map(async line => parseFixture(JSON.parse(line))));
    expect(new Set(fixtures.map(fixture => fixture.id)).size).toBe(fixtures.length);
    let fallbackCases = 0;
    for (const fixture of fixtures) {
      const evaluated = await evaluateFixture(fixture);
      expect(evaluated.harnessError).toBeUndefined();
      for (const direction of ["previous", "next"] as const) {
        const expected = fixture.expected[direction];
        if (expected === undefined) continue;
        const actual = evaluated.actual[direction];
        if (expected.length === 0) expect(actual).toBeNull();
        else expect(expected).toContain(actual!);
      }
      if (evaluated.fallbackDirections.length) fallbackCases++;
    }
    expect(fallbackCases).toBe(1);
  });

  test("rejects fixtures that could carry raw text or non-example routes", async () => {
    const fixture = await sealFixture(baseFixture());
    await expect(parseFixture({ ...fixture, body: [{ tag: "div", text: "BrandOne" }] })).rejects.toThrow();
    await expect(parseFixture({
      ...fixture,
      url: { site: "other", route: 1, shape: "query", page: 2, key: "page" },
    })).rejects.toThrow();
    await expect(parseFixture({ ...fixture, extra: "value" })).rejects.toThrow();
  });

  test("writes failed normalized fixtures for regression review", async () => {
    const directory = mkdtempSync(join(tmpdir(), "just-pagination-eval-"));
    temporaryDirectories.push(directory);
    const fixture = await sealFixture({
      ...baseFixture(),
      expected: { previous: ["c1"], next: [] },
    });
    const fixturesPath = join(directory, "fixtures.jsonl");
    const regressionsPath = join(directory, "regressions.jsonl");
    await Bun.write(fixturesPath, JSON.stringify(fixture) + "\n");
    const result = Bun.spawnSync([
      process.execPath,
      "tools/pagination-eval/run.ts",
      "--fixtures",
      fixturesPath,
      "--regressions",
      regressionsPath,
    ], { cwd: root, stdout: "pipe", stderr: "pipe" });
    expect(result.exitCode).toBe(1);
    const line = (await Bun.file(regressionsPath).text()).trim();
    expect(line.length).toBeGreaterThan(0);
    const regenerated = await parseFixture(JSON.parse(line));
    expect(regenerated.id).toBe(fixture.id);
    expect(regenerated.expected).toStrictEqual(fixture.expected);
  });
});

function baseFixture(): FixturePayload {
  const page = { site: "same" as const, route: 1, shape: "query" as const, key: "page" as const };
  return {
    version: 1,
    url: { ...page, page: 2 },
    head: [],
    body: [{
      tag: "nav",
      ariaLabel: "nav",
      dataPagination: true,
      children: [
        { tag: "a", key: "c1", text: "prev", href: { ...page, page: 1 }, rel: ["prev"] },
        { tag: "span", text: "#2", flags: ["current"] },
        { tag: "a", key: "c2", text: "next", href: { ...page, page: 3 }, rel: ["next"] },
      ],
    }],
    expected: { previous: ["c1"], next: ["c2"] },
  };
}
