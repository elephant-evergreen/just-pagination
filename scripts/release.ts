export type ReleaseManifest = {
  manifest_version?: unknown;
  version?: unknown;
};

const versionPattern = /^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){2}$/;

export function releaseVersion(manifest: ReleaseManifest): string {
  const { version } = manifest;
  if (manifest.manifest_version !== 3 || typeof version !== "string" || !versionPattern.test(version)) {
    throw new Error("Expected a Manifest V3 extension with a three-part numeric version.");
  }
  const parts = version.split(".").map(Number);
  if (parts.some(part => part > 65535) || parts.every(part => part === 0)) {
    throw new Error("Expected each version part to be 0-65535 and the version to be greater than 0.0.0.");
  }
  return version;
}

export function releaseTag(version: string): string {
  return `v${version}`;
}
