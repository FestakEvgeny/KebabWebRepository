export interface ViewHelpers {
  formatDate: (value?: Date | string | null) => string;
  truncate: (value?: string | null, max?: number) => string;
  fixed: (value?: number | null, digits?: number) => string;
}

export const viewHelpers: ViewHelpers = {
  formatDate: (value) =>
    value
      ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
      : '-',
  truncate: (value, max = 60) =>
    !value ? '' : value.length > max ? `${value.slice(0, max - 1)}...` : value,
  fixed: (value, digits = 2) =>
    value === null || value === undefined ? '-' : Number(value).toFixed(digits),
};
