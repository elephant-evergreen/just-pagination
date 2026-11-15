# Chrome Web Store listing draft

## Summary

Move between pages of a list with the left and right arrow keys.

## Description

Use **←** and **→** to move through search results, product listings, and other paginated lists where Chrome grants site access. Try the shortcut in the sample gallery. Use the toolbar or Settings to disable it on a site.

Just Pagination recognizes standard pagination locally. Connect an optional TypeSafe Jev API key in Settings to get help interpreting ambiguous controls. TypeSafe usage charges may apply. The shortcut works when it can identify a previous or next page in the same list. The sample gallery loads its photos from Pexels.

## Single purpose

Move to the adjacent page of a paginated web list with the arrow keys.

## Permission justifications

| Permission | Purpose |
| --- | --- |
| Storage | Save the Jev key, site settings, and sample progress locally. Reuse Jev results within a browser session. |
| Active tab | Identify the current website when you open the toolbar popup, including when Chrome has limited the extension’s access to that site. |
| Website access | Read navigation controls on ordinary web pages to find the previous and next page. Chrome manages site access. The extension skips sites you disable. |
| TypeSafe API | Verify the supplied key and resolve ambiguous pagination using structured navigation hints. |

See the [privacy policy](PRIVACY.md) for data handling.

## Reviewer instructions

1. Open the extension settings. Press Left and Right in the sample gallery, then select a page number.
2. Open a paginated list on a site where Chrome grants access and verify both arrow keys. Choose **Disable** in the toolbar and confirm the shortcut stops on that site. Choose **Enable** to restore it.
3. To test the optional Jev connection, enter the dedicated test key provided in **Test instructions** and select **Connect**.
