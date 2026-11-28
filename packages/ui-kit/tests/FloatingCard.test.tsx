import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FloatingCard } from '../src/index.ts';

describe('<FloatingCard />', () => {
  it('is a region labelled by its heading', () => {
    render(
      <FloatingCard title="Hub entry" eyebrow="HUB" headingLevel={3}>
        body
      </FloatingCard>,
    );
    const region = screen.getByRole('region', { name: 'Hub entry' });
    expect(screen.getByRole('heading', { level: 3, name: 'Hub entry' })).toBeInTheDocument();
    expect(region).toHaveTextContent('HUB');
    expect(region).toHaveTextContent('body');
  });

  it('renders without a header and passes through attributes', () => {
    render(
      <FloatingCard as="aside" aria-label="Status" data-testid="card">
        plain
      </FloatingCard>,
    );
    const card = screen.getByTestId('card');
    expect(card.tagName).toBe('ASIDE');
    expect(card).toHaveAccessibleName('Status');
    expect(card.querySelector('header')).toBeNull();
  });
});
