/** Browser rendering uses one complete page per row, in document order. */
export const orderedPdfPages = (count: number) => Array.from({ length: Math.max(0, count) }, (_, index) => index + 1);

export const fitPdfPageWidth = (availableWidth: number, naturalWidth: number) =>
  availableWidth > 0 && naturalWidth > 0 ? availableWidth / naturalWidth : 1;
