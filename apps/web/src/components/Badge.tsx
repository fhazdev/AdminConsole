interface BadgeProps {
  value: string;
  /** Falls back to a neutral style for values without a dedicated colour. */
  tone?: 'auto' | 'neutral';
}

/** Renders a status/plan/role value as a coloured pill. */
export function Badge({ value, tone = 'auto' }: BadgeProps) {
  const modifier = tone === 'neutral' ? 'neutral' : value.replace(/_/g, '-');
  return <span className={`badge badge--${modifier}`}>{value.replace(/_/g, ' ')}</span>;
}
