/**
 * Pagination utility functions
 * Provides helper methods for paginated responses
 */
export class PaginationUtils {
  /**
   * Calculates pagination metadata
   * @param total - Total number of items
   * @param page - Current page number
   * @param limit - Number of items per page
   * @returns Pagination metadata object
   */
  static getPaginationMetadata(total: number, page: number, limit: number) {
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      total,
      page,
      limit,
      totalPages,
      hasNext,
      hasPrev,
      nextPage: hasNext ? page + 1 : null,
      prevPage: hasPrev ? page - 1 : null,
    };
  }

  /**
   * Validates pagination parameters
   * @param page - Page number
   * @param limit - Items per page
   * @throws Error if parameters are invalid
   */
  static validatePagination(page: number, limit: number) {
    if (page < 1) {
      throw new Error('Page must be greater than 0');
    }
    if (limit < 1 || limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }
  }
}