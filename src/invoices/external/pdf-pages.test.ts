import { describe, expect, it } from "vitest";
import { fitPdfPageWidth, orderedPdfPages } from "./pdf-pages";

describe("Invoice page reader", () => {
  it("keeps every PDF page in order, with no spread or duplicate", () => {
    expect(orderedPdfPages(3)).toEqual([1, 2, 3]);
    expect(orderedPdfPages(1)).toEqual([1]);
    expect(orderedPdfPages(0)).toEqual([]);
  });

  it("fits the entire page width on desktop and narrow screens", () => {
    expect(fitPdfPageWidth(612, 612)).toBe(1);
    expect(fitPdfPageWidth(320, 640)).toBe(0.5);
  });
});
