import { expect, test } from "bun:test";
import { releaseTag, releaseVersion } from "../release.ts";

function manifest(version: unknown, manifestVersion: unknown = 3) {
  return { manifest_version: manifestVersion, version };
}

test("accepts three numeric version parts and pairs the tag", () => {
  for (const version of ["0.0.1", "1.2.3", "65535.0.65535"]) {
    expect(releaseVersion(manifest(version))).toBe(version);
  }
  expect(releaseTag("0.0.1")).toBe("v0.0.1");
});

test("rejects versions outside the three-part release policy", () => {
  for (const version of ["0.0.0", "1.2", "1.2.3.4", "01.2.3", "1.02.3", "65536.0.0", "1.2.x"]) {
    expect(() => releaseVersion(manifest(version))).toThrow();
  }
  expect(() => releaseVersion(manifest("1.2.3", 2))).toThrow();
  expect(() => releaseVersion(manifest(1))).toThrow();
});
