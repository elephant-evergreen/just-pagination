# <img src="extension/assets/icon.png" width="32" height="32" alt=""> Just Pagination <a href="https://chromewebstore.google.com/detail/just-pagination/ijhnpclghelmocegpignnkfgieifcaeb"><img src="media/chrome-extension-badge.svg" width="138" height="22" alt="Chrome extension"></a>

Use ← and → to move between pages of search results, product listings, and other paginated lists in Chrome.

![Pressing the right arrow key turns pages on two example sites and in Just Pagination Settings](media/just-pagination.gif)

[Photo credits](media/photo-credits.md)

## Get started

You need desktop Chrome 120 or later.

1. Open [Just Pagination in the Chrome Web Store](https://chromewebstore.google.com/detail/just-pagination/ijhnpclghelmocegpignnkfgieifcaeb).
2. Click **Add to Chrome**.
3. Click **Add extension** to confirm.

In **Just Pagination Settings**, press ← or → under **Try the arrow keys** to turn a page. The sample works without a Jev API key. To reopen it, click **Settings** in the toolbar popup.

## Use it on a website

Press ← or → on a list with previous or next pages. If the popup shows **No access**, check [Chrome’s site access settings](https://support.google.com/chrome/answer/2664769?hl=en).

If the page has a single visible carousel and no page controls, press ← or → to move between slides. When the page also has pagination or several carousels are visible, move the pointer onto the carousel you want to control, or press **Tab** to focus a control inside it. This works locally with carousels that identify themselves and have labelled previous or next slide buttons.

Open **Just Pagination** from Chrome’s extensions menu to **Disable** or **Enable** it on the current site. Use **Settings** in the popup to manage the list of disabled sites.

Standard pagination is detected locally and works without an API key. To get help with ambiguous controls, enter an optional [TypeSafe Jev API key](https://console.typesafe.ai/keys) under **Settings** and click **Connect**. When connected, ambiguous controls may send navigation hints to TypeSafe. Usage charges may apply. See the [privacy policy](PRIVACY.md).

## Build from source

Clone this repository or [download the source ZIP](https://github.com/elephant-evergreen/just-pagination/archive/refs/heads/main.zip) and extract it. [Install mise](https://mise.jdx.dev/getting-started.html), then run these commands from the project folder:

```sh
mise install
mise exec -- bun install --frozen-lockfile
mise run check
```

This builds `dist/` and runs the tests. Run `mise exec -- bun fmt` to format code. See the [release guide](RELEASE.md) to package a version for distribution.

When you add, remove, or update a workflow dependency, regenerate and commit `.github/workflows/actions.lock` with `gh actions-lock`. [GitHub's lockfile guide](https://docs.github.com/en/actions/how-tos/secure-your-work/lock-workflow-dependencies)

## Install manually

1. Download and extract the ZIP from the [latest release](https://github.com/elephant-evergreen/just-pagination/releases/latest), or [build from source](#build-from-source).
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`. For a source build, select `dist/`.
