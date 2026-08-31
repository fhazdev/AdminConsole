interface TableStateProps {
  colSpan: number;
  children: React.ReactNode;
  variant?: 'default' | 'error';
}

/**
 * Loading/empty/error rows share one component so every table communicates
 * state the same way and screen readers get a live region either way.
 */
export function TableState({ colSpan, children, variant = 'default' }: TableStateProps) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div
          className={`state${variant === 'error' ? ' state--error' : ''}`}
          role={variant === 'error' ? 'alert' : 'status'}
        >
          {children}
        </div>
      </td>
    </tr>
  );
}
