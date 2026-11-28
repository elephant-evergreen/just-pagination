# <img src="extension/assets/icon.png" width="32" height="32" alt=""> Just Pagination <a href="https://chromewebstore.google.com/detail/just-pagination/ijhnpclghelmocegpignnkfgieifcaeb"><img src="media/chrome-extension-badge.svg" width="138" height="22" alt="Chrome extension"></a>

Use ← and → in Chrome to turn pages in search results and other lists, or to move through slides in supported carousels.

![Pressing the right arrow key turns pages on two example sites and in Just Pagination Settings](media/just-pagination.gif)

[Photo credits](media/photo-credits.md)

## Get started

You need desktop Chrome 120 or later.

1. Open [Just Pagination in the Chrome Web Store](https://chromewebstore.google.com/detail/just-pagination/ijhnpclghelmocegpignnkfgieifcaeb).
2. Click **Add to Chrome**.
3. Click **Add extension** to confirm.

In **Just Pagination Settings**, press ← or → under **Try the arrow keys** to turn a page. The sample works without a Jev API key. To reopen it, click **Settings** in the toolbar popup.

## Use it on a website

Press ← or → on a list with previous or next pages. The shortcut can respond while the page is still loading. For supported **Load more** controls, scroll until the control is visible and press → to load another batch. If the popup shows **No access**, check [Chrome’s site access settings](https://support.google.com/chrome/answer/2664769?hl=en).

When a single carousel is visible and the page has no list navigation, press ← or → to move between slides. When list navigation is available, it takes priority by default. Move the pointer onto a carousel or press **Tab** to focus one of its slide buttons. Use the same selection when several carousels are visible. Supported carousels have labelled previous and next slide buttons and a visible row of slides, even when the carousel itself is unlabelled.

To try carousel support ahead of the next Chrome Web Store update, [build from source](#build-from-source) and open the [W3C carousel demo](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/?norotate=true#ex_label).

Open **Just Pagination** from Chrome’s extensions menu to **Disable** or **Enable** it on the current site. Use **Settings** in the popup to manage the list of disabled sites.

Standard pagination and carousel navigation work locally without an API key. To get help with ambiguous page controls, enter an optional [TypeSafe Jev API key](https://console.typesafe.ai/keys) under **Settings** and click **Connect**. When connected, ambiguous page controls may send navigation hints to TypeSafe. Usage charges may apply. See the [privacy policy](PRIVACY.md).

## Build from source

Clone this repository or [download the source ZIP](https://github.com/elephant-evergreen/just-pagination/archive/refs/heads/main.zip) and extract it. [Install mise](https://mise.jdx.dev/getting-started.html), then run these commands from the project folder:

```sh
mise install
mise exec -- bun install --frozen-lockfile
mise run hooks
mise run check
```

This builds `dist/`, checks formatting, and runs the tests. Run `mise run fmt` to format code. `mise run hooks` points Git at `.githooks`, where the pre-push hook runs the same format check before you push. See [contributing](CONTRIBUTING.md) for the lockfile step and the [release guide](RELEASE.md) to package a version for distribution.

## Install manually

1. Download and extract the ZIP from the [latest release](https://github.com/elephant-evergreen/just-pagination/releases/latest), or [build from source](#build-from-source).
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`. For a source build, select `dist/`.
