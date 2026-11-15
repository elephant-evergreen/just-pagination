import { expect, test } from "bun:test";
import { imageSource, pages } from "../src/gallery-data.ts";

test("maps every gallery photo to one unique Pexels image", () => {
  expect(pages).toHaveLength(12);
  expect(pages.every(page => page.length === 3)).toBe(true);
  const hrefs = pages.flat().map(photo => photo.href);
  expect(new Set(hrefs).size).toBe(36);
  const sources = hrefs.map(imageSource);
  expect(new Set(sources).size).toBe(36);
  for (const [index, source] of sources.entries()) {
    const url = new URL(source);
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("images.pexels.com");
    expect(url.search).toBe("?auto=compress&cs=tinysrgb&w=520");
    expect(url.pathname).toMatch(/^\/photos\/\d+\/pexels-photo-\d+\.jpeg$/);
    const id = hrefs[index].match(/-(\d+)\/$/)?.[1];
    expect(url.pathname).toBe(`/photos/${id}/pexels-photo-${id}.jpeg`);
  }
});
