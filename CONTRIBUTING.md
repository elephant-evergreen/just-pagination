# Contributing to Just Pagination

Just Pagination is a Chrome extension that moves between list pages and carousel slides with the left and right arrow keys. Keep changes focused on that behavior and match the existing TypeScript, test, and documentation style.

## Public information

This repository and its releases are public. Do not include private repository names, internal project names, private or internal hostnames, LAN addresses, SSIDs, or per-device update and verification history in public documentation, examples, diagnostics, issues, pull requests (including descriptions and comments), commit messages, or release notes. Use synthetic values in examples and fixtures. Document supported and tested versions separately from any per-device history.

Because Just Pagination is a public Chrome extension, also keep the following out of public material:

- Chrome Web Store account details and other store-console information.
- TypeSafe and Jev API keys.
- Users' browsing data and disabled-site lists.
- Real hostnames from your own devices or network, and per-device verification history.

Public extension, store, and service metadata are allowed, including the Chrome Web Store listing, the TypeSafe API endpoint, and Pexels photo credits. Use synthetic hosts and keys in tests and examples, such as `example.test` and a placeholder key. State the supported Chrome version once instead of listing which device or install received which update.

## Checks

Run the documented check before opening a pull request:

```sh
mise run check
```

It builds `dist/`, checks formatting, type-checks the tooling, and runs the tests. Run `mise run fmt` to format code.
