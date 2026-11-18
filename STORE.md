# Chrome Web Store form text

Copy the text inside each block into the named dashboard field.

## Summary

Matches `description` in `extension/manifest.json`:

```text
Move between list pages and carousel slides with the left and right arrow keys.
```

## Description

**Store listing → Detailed description**

```text
Use ← and → to move through search results, product listings, and supported carousels where Chrome grants site access. On a page with both list navigation and a carousel, move the pointer onto the carousel or focus one of its slide controls to select it. Try the shortcut in the Settings sample gallery. Use the toolbar popup or Settings to disable the extension on a site.

The sample gallery, standard pagination, and carousel navigation work without an API key. Just Pagination detects standard page and slide controls on your device. Connect an optional TypeSafe Jev API key in Settings to get help interpreting ambiguous page controls. TypeSafe usage charges may apply. The sample gallery loads its photos from Pexels.
```

## Single purpose

**Privacy practices → Single purpose description**

```text
Use the left and right arrow keys to move to the adjacent page or slide in web content with previous and next controls.
```

## Permission justifications

**Privacy practices → storage justification**

```text
Save the optional Jev API key, disabled-site hostnames, and which sample arrow keys have been tried in local extension storage. Use browser-session storage to cache Jev navigation decisions and enforce request limits.
```

**Privacy practices → activeTab justification**

```text
Identify the current website when the user opens the toolbar popup, including when Chrome has limited the extension's access to that site, so the popup can show its status and let the user enable or disable navigation on that site.
```

**Privacy practices → Host permission justification**

```text
Read navigation controls on websites where Chrome grants access to identify previous and next pages or supported carousel slides. The extension skips sites the user disables.

Access https://api.typesafe.ai/ to verify an optional user-supplied Jev API key and interpret ambiguous pagination using structured navigation hints. Classification requests do not include page URLs, page text, form entries, or screenshots. Standard pagination and supported carousel navigation work locally without an API key.
```

## Remote code

**Privacy practices → Remote code**: select **No, I am not using remote code**. The extension requests API data and gallery images but executes only packaged code.

## Privacy policy URL

**Privacy practices → Privacy policy URL**

```text
https://github.com/elephant-evergreen/just-pagination/blob/main/PRIVACY.md
```

See the [privacy policy](PRIVACY.md) for data handling.

## Reviewer instructions

Paste only the following paragraph into **Test instructions → Additional instructions**, which has a 500-character limit:

```text
In Settings, test Left/Right and page buttons without an API key. On a paginated site, test both arrows and toolbar Disable/Enable. Check carousel arrows at https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/?norotate=true#ex_label . Inputs must retain arrow keys. Optional Jev: enter the test key in Settings and click Connect.
```
