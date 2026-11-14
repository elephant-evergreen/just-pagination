# Release Just Pagination

A version tag creates a draft GitHub release with the ZIP, its SHA-256 checksum, and English release notes. Use that ZIP for Chrome testing and store submission.

## Prepare a draft

1. Set the version in `extension/manifest.json` and write `release-notes/v<VERSION>.md`. Start at `0.0.1`. On `0.x`, bump the patch for compatible updates and the minor for breaking changes. After `1.0.0`, follow [Semantic Versioning](https://semver.org/).
2. Merge the changes to `main` and wait for **Check** to pass on that commit.
3. Create and push the matching tag at the checked commit. For the first release:

   ```sh
   git tag v0.0.1 <checked-commit>
   git push origin v0.0.1
   ```

4. Open **Release** in Actions. When it passes, open the draft in **Releases** and download both files. Run `shasum -a 256 -c just-pagination-0.0.1.zip.sha256` from their directory, substituting the release version when needed.

If **Release** fails, read the failed step in Actions. To retry a failed upload, delete any incomplete draft and rerun the job. If you need to change the tagged code or have already uploaded that version to Chrome Web Store, prepare the next version.

## Verify the draft package

Extract the ZIP. Load the folder containing `manifest.json` through **Load unpacked** in desktop Chrome. Connect with a dedicated test key, try both arrow keys and a page number in the gallery, and turn pages on a real list. Check that the shortcut leaves focused inputs alone. Use the popup to disable and enable the site. For an update, check that saved settings still work.

## Publish

1. In the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), upload the verified ZIP. Use the [listing and reviewer instructions](STORE.md) and enter a public URL for the [privacy policy](PRIVACY.md). Choose the intended [visibility](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution) and [submit for review](https://developer.chrome.com/docs/webstore/publish).
2. When the public listing serves the new version, install it from the store and try the gallery and a paginated list. Add the store link to the GitHub release notes and publish the draft.

For a serious regression, use [store rollback](https://developer.chrome.com/docs/webstore/rollback) when a previous version is available. On the first release, correct the package and submit a higher version, or unpublish the item. Verify the version the store serves afterward.
