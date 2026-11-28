import * as ToggleGroup from '@radix-ui/react-toggle-group';
import type { ReactNode } from 'react';
import styles from './SegmentedControl.module.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when `label` is not plain text (e.g. an icon or a short code). */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  /** Accessible name of the whole control (rendered as `aria-label` on the radiogroup). */
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onValueChange: (value: T) => void;
  size?: 'sm' | 'md';
  /** Stretch segments to fill the container width. */
  block?: boolean;
  className?: string | undefined;
}

/**
 * Single-choice segmented control built on Radix ToggleGroup: a `radiogroup` with roving
 * focus (arrow keys move, Space/Enter select). A selected segment can never be cleared,
 * so the control always holds exactly one value.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onValueChange,
  size = 'md',
  block = false,
  className,
}: SegmentedControlProps<T>) {
  const allowed = new Set<string>(options.map((option) => option.value));
  const classes = [
    styles.root,
    size === 'sm' ? styles.sm : styles.md,
    block && styles.block,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <ToggleGroup.Root
      type="single"
      className={classes}
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        // Radix emits '' when the active item is pressed again; keep the current value.
        if (next !== '' && next !== value && allowed.has(next)) {
          onValueChange(next as T);
        }
      }}
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className={styles.item}
          aria-label={option.ariaLabel}
          disabled={option.disabled}
        >
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
