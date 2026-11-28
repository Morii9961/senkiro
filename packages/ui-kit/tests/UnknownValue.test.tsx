import { LOCALES } from '@senkiro/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UnknownValue } from '../src/index.ts';

describe('<UnknownValue />', () => {
  it.each([
    ['zh-CN', '未知'],
    ['ja', '不明'],
    ['en', 'Unknown'],
  ] as const)('renders the %s unknown wording', (lang, text) => {
    const { container } = render(<UnknownValue lang={lang} />);
    expect(container).toHaveTextContent(text);
    expect(container.querySelector('[data-honesty="unknown"]')).not.toBeNull();
  });

  it('distinguishes unverified and pending in every locale', () => {
    for (const lang of LOCALES) {
      const { container, unmount } = render(
        <>
          <UnknownValue lang={lang} kind="unverified" />
          <UnknownValue lang={lang} kind="pending" />
        </>,
      );
      const [unverified, pending] = container.querySelectorAll('[data-honesty]');
      expect(unverified?.getAttribute('data-honesty')).toBe('unverified');
      expect(pending?.getAttribute('data-honesty')).toBe('pending');
      expect(unverified?.textContent).not.toBe(pending?.textContent);
      unmount();
    }
  });

  it('exposes a labelled note when told what is unknown', () => {
    render(<UnknownValue lang="zh-CN" label="票价" />);
    expect(screen.getByRole('note', { name: '票价：未知' })).toBeInTheDocument();
  });

  it('hides the decorative question mark from assistive tech', () => {
    const { container } = render(<UnknownValue lang="en" />);
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('?');
  });
});
