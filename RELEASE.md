# Release Just Pagination

A `vMAJOR.MINOR.PATCH` tag starts **Release**. The workflow verifies that the annotated tag points at an exact commit on `main` with a successful **Check** run, then builds the ZIP, verifies its checksum, and creates or resumes a draft [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository).

The workflow never uploads to the Chrome Web Store, uses no store credentials, and never publishes the GitHub draft. A person tests the ZIP, submits the store update, publishes it, and then publishes the draft.

## Choose the version

`extension/manifest.json` and the tag must match: version `0.0.2` uses tag `v0.0.2`.

Use exactly three numeric parts. Each part is `0`–`65535`, has no leading zero, and the version cannot be `0.0.0`. Chrome accepts one to four parts and treats a missing part as zero, but this repository requires three so tags, artifacts, and store versions compare the same way. See [Chrome manifest version](https://developer.chrome.com/docs/extensions/reference/manifest/version).

| Change                                                            | Next version                     |
| ----------------------------------------------------------------- | -------------------------------- |
| First release                                                     | `0.0.1`                          |
| Before 1.0: compatible feature, fix, documentation, or dependency | Patch, such as `0.0.1` → `0.0.2` |
| Before 1.0: breaking change or user action                        | Minor, such as `0.0.2` → `0.1.0` |
| 1.0 and later: compatible fix                                     | Patch                            |
| 1.0 and later: compatible feature                                 | Minor                            |
| 1.0 and later: breaking change or user action                     | Major                            |

Before 1.0, reserve `1.0.0` for a stable release. After 1.0, follow [Semantic Versioning](https://semver.org/).

The Chrome Web Store compares version parts numerically and requires every new upload to be greater than the last one. `0.0.10` is newer than `0.0.9`. Treat every uploaded version as used: do not reuse it. If the store upload or review fails, fix the issue and upload a higher version.

A breaking change needs user guidance. Examples include a settings migration, a new permission prompt, removal of a supported site, or a shortcut behavior change. In `release-notes/v<VERSION>.md`, start with `## Breaking changes`, name the affected versions, explain what changes, state what users must do before or after updating, and describe recovery. Otherwise start with `## Upgrade notes` and say whether existing users need to act. Add highlights and fixes below. The workflow uses this file as the draft body.

## Prepare the tag

1. Set the version in `extension/manifest.json` and add `release-notes/v<VERSION>.md`.
2. Merge to `main` and wait for **Check** to pass on the exact commit.
3. Create and push an annotated tag at that commit:

   ```sh
   git fetch origin main
   release_commit=$(git rev-parse origin/main)
   git tag -a v0.0.2 "$release_commit" -m "Release v0.0.2"
   git push origin refs/tags/v0.0.2
   ```

The tag must be annotated, must point to that exact checked commit, and that commit must still be on `main` (or an ancestor of it). A lightweight tag or a tag with a different manifest version stops the workflow. Open **Release** in Actions; when it passes, open the draft under **Releases** and download both assets.

If **Release** fails, rerun it on the same tag. It reuses an existing draft, leaves complete assets in place, retries incomplete uploads, and verifies the downloaded checksum and ZIP. It never deletes a draft, replaces a complete asset, or moves a tag, and it stops if a complete draft asset does not match the tagged build. If the tagged code or notes are wrong, or that version has already been uploaded to the store, release the next version instead. Treat published tags and assets as immutable; a rerun on a published tag verifies them without changing them.

## Verify the ZIP

From the directory containing both downloaded files:

```sh
unzip -t just-pagination-0.0.2.zip
shasum -a 256 -c just-pagination-0.0.2.zip.sha256
unzip -p just-pagination-0.0.2.zip manifest.json
```

Use `sha256sum -c` on Linux. The manifest version must match the tag.

Extract the ZIP and load its folder through **Load unpacked** in desktop Chrome. Follow the [reviewer instructions](STORE.md#reviewer-instructions) to test the sample gallery, a paginated site, and the carousel demo with the Jev API key field blank. Then test the optional connection with a dedicated key. Check that focused inputs keep their arrow keys.

To simulate an update, load the previous release from a fixed folder, save the key and site settings, replace that folder with the new build, and click **Reload** on `chrome://extensions`. Confirm the saved settings survive. After the store update is live, repeat the check on an installation of the previous store version.

## Upgrade the store item

On the first release, create the item once and keep it for every update. Later releases update that item in place.

1. In the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), open that item (or create it for the first release) and choose **Package** → **Upload New Package**. Do not create a new item for an update; keeping the same item preserves its ID, users, and extension storage. Existing installations update in place, so do not tell users to uninstall. Chrome updates them automatically. A new permission produces a Chrome prompt that users must accept.
2. Update listing, privacy, or distribution details if the release changes them. On the first listing, enter a public URL for [the privacy policy](PRIVACY.md) and choose visibility. Use [STORE.md](STORE.md) for the listing and reviewer instructions.
3. Submit for review. Use the deferred publishing option so a passing review does not publish automatically. You then have up to 30 days to click **Publish**; after that, the approved submission returns to draft. See [Update your Chrome Web Store item](https://developer.chrome.com/docs/webstore/update).

Review time depends on the change. If review fails, fix the issue and upload a higher version; do not submit the same version again.

## Publish and verify

1. When the store serves the new version, update an installation of the previous store version. Confirm the item ID is unchanged, the version is new, and the saved key and site settings still work.
2. Publish the GitHub draft. Its tag and assets stay attached. If you want the store URL in the notes, add it after publishing; a retry stops if the draft body differs from the tagged notes.
3. Confirm the public listing shows the new version and that both arrow keys work on a real paginated list.

## Recover

- **Wrong draft or tag, not uploaded to the store:** fix `main`, choose the next version, and tag again. Leave the old tag and draft in place.
- **Store upload or review failed:** cancel the review if needed, fix the issue, and upload the next higher version. Do not reuse a version.
- **Bad version is live:** use [Chrome Web Store rollback](https://developer.chrome.com/docs/webstore/rollback). A rollback needs a new version number and republishes the previous code under that number; it does not restore an old GitHub tag. Verify the rollback, then release the fix above the rollback version and record that number so it is not reused.
- **First release has no previous version:** unpublish the item or submit a higher corrected version.

Never delete or move a published tag, and never replace assets on a published GitHub Release.
