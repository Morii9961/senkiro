import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from '../src/index.ts';

const OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'A', ariaLabel: 'Automatic', disabled: true },
] as const;

type Value = (typeof OPTIONS)[number]['value'];

function Harness({ onChange }: { onChange: (value: Value) => void }) {
  const [value, setValue] = useState<Value>('dark');
  return (
    <SegmentedControl
      label="Theme"
      value={value}
      options={OPTIONS}
      onValueChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('<SegmentedControl />', () => {
  it('renders a labelled radiogroup with one checked radio', () => {
    render(<Harness onChange={vi.fn()} />);
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: 'Automatic' })).toBeDisabled();
  });

  it('selects by click and never clears the current value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(onChange).toHaveBeenLastCalledWith('light');
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
  });

  it('supports roving keyboard focus with arrow keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await user.tab();
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith('light');
  });
});
