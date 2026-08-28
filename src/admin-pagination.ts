export const ADMIN_PAGE_SIZES = [20, 50, 100] as const;

export type AdminPageSize = (typeof ADMIN_PAGE_SIZES)[number];
export type AdminPageToken = number | "start-ellipsis" | "end-ellipsis";

export function getAdminTotalPages(totalItems: number, pageSize: AdminPageSize) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function clampAdminPage(
  page: number,
  totalItems: number,
  pageSize: AdminPageSize,
) {
  const normalizedPage = Number.isFinite(page) ? Math.trunc(page) : 1;
  return Math.min(
    Math.max(normalizedPage, 1),
    getAdminTotalPages(totalItems, pageSize),
  );
}

export function paginateAdminItems<T>(
  items: T[],
  page: number,
  pageSize: AdminPageSize,
) {
  const currentPage = clampAdminPage(page, items.length, pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  return {
    currentPage,
    totalPages: getAdminTotalPages(items.length, pageSize),
    startIndex,
    endIndex: Math.min(startIndex + pageSize, items.length),
    items: items.slice(startIndex, startIndex + pageSize),
  };
}

export function getAdminPageTokens(
  currentPage: number,
  totalPages: number,
): AdminPageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const visiblePages = new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);
  const pages = [...visiblePages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const tokens: AdminPageToken[] = [];

  pages.forEach((page, index) => {
    const previousPage = pages[index - 1];
    if (previousPage && page - previousPage > 1) {
      tokens.push(previousPage === 1 ? "start-ellipsis" : "end-ellipsis");
    }
    tokens.push(page);
  });

  return tokens;
}
