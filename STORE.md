# Chrome Web Store listing draft

## Summary

Move between list pages and carousel slides with the left and right arrow keys.

## Description

Use **←** and **→** to move through search results, product listings, and supported carousels where Chrome grants site access. On a page with both list navigation and a carousel, move the pointer onto the carousel to select it. Try the shortcut in the Settings sample gallery. Use the toolbar or Settings to disable it on a site.

The sample gallery, standard pagination, and carousel navigation work without an API key. Just Pagination detects standard page and slide controls on your device. Connect an optional TypeSafe Jev API key in Settings to get help interpreting ambiguous page controls. TypeSafe usage charges may apply. The sample gallery loads its photos from Pexels.

## Single purpose

Use the left and right arrow keys to move to the adjacent page or slide in web content with previous and next controls.

## Permission justifications

| Permission | Purpose |
| --- | --- |
| Storage | Save the Jev key, site settings, and sample progress locally. Reuse Jev results within a browser session. |
| Active tab | Identify the current website when you open the toolbar popup, including when Chrome has limited the extension’s access to that site. |
| Website access | Read navigation controls on ordinary web pages to find the previous and next page or slide. Chrome manages site access. The extension skips sites you disable. |
| TypeSafe API | Verify the supplied key and resolve ambiguous pagination using structured navigation hints. |

See the [privacy policy](PRIVACY.md) for data handling.

## Reviewer instructions

Paste only the following paragraph into **Test instructions → Additional instructions**, which has a 500-character limit:

In Settings, test Left/Right and page buttons without an API key. On a paginated site, test both arrows and toolbar Disable/Enable. Check carousel arrows at https://www.w3.org/WAI/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/?norotate=true#ex_label . Inputs must retain arrow keys. Optional Jev: enter the test key in Settings and click Connect.
