import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerPanel } from '../src/index.ts';

function Harness({ onOpenChange = vi.fn() }: { onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        outside
      </button>
      <DrawerPanel
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          onOpenChange(next);
        }}
        title="Route"
        description="Plan a journey"
        lang="ja"
        side="right"
      >
        <input aria-label="From" />
      </DrawerPanel>
    </>
  );
}

describe('<DrawerPanel />', () => {
  it('is a labelled, described, non-modal dialog', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Route' });
    expect(dialog).toHaveAccessibleDescription('Plan a journey');
    expect(dialog).toHaveAttribute('data-side', 'right');
    expect(dialog).not.toHaveAttribute('aria-modal');
  });

  it('has a localised close button', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape but not on outside clicks', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'outside' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    screen.getByRole('textbox', { name: 'From' }).focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('becomes modal with an overlay when asked', () => {
    render(
      <DrawerPanel open onOpenChange={vi.fn()} title="T" description="D" lang="en" modal>
        x
      </DrawerPanel>,
    );
    expect(screen.getByRole('dialog', { name: 'T' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
