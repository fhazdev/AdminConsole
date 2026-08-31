import type { Paginated } from '@admin-console/shared-types';
import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** Shared pagination query shape; page size is capped so a client cannot ask for the world. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export function paginate<T>(
  items: T[],
  total: number,
  { page, pageSize }: { page: number; pageSize: number },
): Paginated<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}
