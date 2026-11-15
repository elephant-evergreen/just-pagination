# <img src="extension/assets/icon.png" width="32" height="32" alt=""> Just Pagination

Use ← and → to move between pages of search results, product listings, and other paginated lists in Chrome.

[![Watch the silent Just Pagination demo](media/just-pagination-preview.jpg)](https://raw.githubusercontent.com/elephant-evergreen/just-pagination/main/media/just-pagination.mp4)

[Watch the 6-second demo](https://raw.githubusercontent.com/elephant-evergreen/just-pagination/main/media/just-pagination.mp4) · [Photo credits](media/photo-credits.md)

## Get started

You need desktop Chrome 120 or later and a [TypeSafe Jev API key](https://console.typesafe.ai/keys). TypeSafe usage charges may apply.

1. [Build from source](#build-from-source) or download and extract a ZIP from [Releases](https://github.com/elephant-evergreen/just-pagination/releases) once available.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`. For a source build, select `dist/`.
4. In **Just Pagination Settings**, paste your Jev key and click **Connect**. To reopen this page, click **Settings** in the toolbar popup.
5. Under **Try the arrow keys**, press ← or → to turn a page and see the tabby tap its keyboard. You can also click a page number.

## Use it on a website

Press ← or → on a list with previous or next pages. If the popup shows **No access**, check [Chrome’s site access settings](https://support.google.com/chrome/answer/2664769?hl=en).

Open **Just Pagination** from Chrome’s extensions menu to **Disable** or **Enable** it on the current site. Use **Settings** in the popup to manage the list of disabled sites.

Standard pagination is detected locally. Ambiguous controls may send navigation hints to TypeSafe. See the [privacy policy](PRIVACY.md).

## Build from source

Clone this repository or [download the source ZIP](https://github.com/elephant-evergreen/just-pagination/archive/refs/heads/main.zip) and extract it. [Install mise](https://mise.jdx.dev/getting-started.html), then run these commands from the project folder:

```sh
mise install
mise exec -- pnpm install --frozen-lockfile --ignore-scripts
mise run check
```

This builds `dist/` and runs the tests. See the [release guide](RELEASE.md) to package a version for distribution.
