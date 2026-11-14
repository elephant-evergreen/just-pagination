# Just Pagination Privacy Policy

Just Pagination uses page information to find the previous and next pages of a list on websites where you grant access.

## Data on your device

The extension examines page URLs and navigation controls locally. It stores your TypeSafe API key, disabled site hostnames, and the gallery keys you’ve tried in Chrome’s local extension storage. Chrome manages the site permissions you grant. **Disconnect** removes the stored API key. You can revoke site access in Chrome or uninstall the extension to remove its local data.

The extension keeps Jev decisions and request limits in browser-session storage. It can reuse a decision for up to one hour if another page has the same navigation controls.

## Requests to TypeSafe

The extension sends your API key directly to TypeSafe to verify the connection. When it needs help identifying pagination, it sends the key and structured hints about the controls, including their order, kind, position relative to the current page, and direction when known. Classification requests omit page URLs, page text, form entries, and screenshots. The sample gallery runs locally.

TypeSafe processes those requests under its own service terms. Its privacy policy and retention information explain how it handles them. [TypeSafe Privacy Policy](https://typesafe.ai/legal/privacy-policy) · [TypeSafe request retention](https://help.typesafe.ai/articles/5974925716)

Just Pagination uses this data to provide page navigation and its key setup. The extension contains no analytics or advertising trackers. Its use and transfer of information received from Google APIs follows the [Chrome Web Store User Data Policy's Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use).
