/**
 * Accumulates bind values while building a dynamic WHERE clause, so filters are
 * always parameterized. Nothing user-supplied is ever concatenated into SQL.
 */
export class SqlParams {
  private readonly values: unknown[] = [];

  /** Registers a value and returns its placeholder, e.g. `$3`. */
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }

  all(): unknown[] {
    return [...this.values];
  }
}

/** Joins conditions into a WHERE clause, collapsing to '' when there are none. */
export function whereClause(conditions: string[]): string {
  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

export interface PageRequest {
  page: number;
  pageSize: number;
}

export function offsetOf({ page, pageSize }: PageRequest): number {
  return (page - 1) * pageSize;
}
