import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProvenanceTag } from '../src/index.ts';
import { OFFICIAL, SYNTHETIC, TEST_SOURCE } from './fixtures.ts';

describe('<ProvenanceTag />', () => {
  it('shows the data nature on a labelled trigger', () => {
    render(<ProvenanceTag provenance={OFFICIAL} lang="zh-CN" />);
    const trigger = screen.getByRole('button', { name: '数据性质：官方。查看溯源' });
    expect(trigger).toHaveAttribute('data-tone', 'verified');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens a provenance dialog listing resolved sources with safe links', async () => {
    const user = userEvent.setup();
    const onSourceSelect = vi.fn();
    render(
      <ProvenanceTag
        provenance={OFFICIAL}
        sources={[TEST_SOURCE]}
        lang="en"
        onSourceSelect={onSourceSelect}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Data nature: Official/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Provenance' });
    expect(dialog).toHaveTextContent('CC0-1.0');
    expect(dialog).toHaveTextContent('2026-11-01');
    const link = screen.getByRole('link', { name: 'Open source page' });
    expect(link).toHaveAttribute('href', 'https://example.com/source');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await user.click(screen.getByRole('button', { name: 'Test fixture source' }));
    expect(onSourceSelect).toHaveBeenCalledWith('sk:source:jp:test-fixture');
  });

  it('reports source IDs missing from the registry honestly', async () => {
    const user = userEvent.setup();
    render(<ProvenanceTag provenance={OFFICIAL} lang="ja" />);
    await user.click(screen.getByRole('button'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('sk:source:jp:test-fixture');
    expect(dialog).toHaveTextContent('出典レジストリに見つかりません');
  });

  it('always discloses synthetic data and unverified dates', async () => {
    const user = userEvent.setup();
    render(<ProvenanceTag provenance={SYNTHETIC} lang="zh-CN" />);
    const trigger = screen.getByRole('button', { name: /合成数据/ });
    expect(trigger).toHaveAttribute('data-tone', 'synthetic');
    await user.click(trigger);
    expect(await screen.findByRole('alert')).toHaveTextContent('合成或推算数据');
    expect(screen.getByRole('dialog')).toHaveTextContent('未核实');
    expect(screen.getByRole('dialog')).toHaveTextContent('无来源记录');
  });

  it('treats frequency schedules as needing disclosure even with official provenance', () => {
    render(<ProvenanceTag provenance={OFFICIAL} schedulePrecision="frequency" lang="en" />);
    expect(screen.getByRole('button')).toHaveAttribute('data-tone', 'synthetic');
  });

  it('never links non-http source URLs', async () => {
    const user = userEvent.setup();
    render(
      <ProvenanceTag
        provenance={OFFICIAL}
        sources={[{ ...TEST_SOURCE, url: 'javascript:alert(1)' }]}
        lang="en"
      />,
    );
    await user.click(screen.getByRole('button'));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('link')).toBeNull();
  });
});
