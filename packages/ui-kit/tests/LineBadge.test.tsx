import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LineBadge, safeLineColor } from '../src/index.ts';

describe('<LineBadge />', () => {
  it('announces line name and station number in one accessible image', () => {
    render(<LineBadge lineName="Test Line" color="#3366cc" prefix="TL" number="07" lang="en" />);
    const badge = screen.getByRole('img', { name: 'Test Line, station number TL07' });
    expect(badge.style.getPropertyValue('--sk-line-color')).toBe('#3366cc');
  });

  it('marks a missing prefix as unverified instead of guessing', () => {
    render(<LineBadge lineName="测试线" color="#3366cc" prefix={null} lang="zh-CN" />);
    const badge = screen.getByRole('img', { name: '测试线，站号未核实' });
    expect(badge.querySelector('[data-unverified="true"]')).toHaveTextContent('?');
  });

  it('localises the label in Japanese', () => {
    render(<LineBadge lineName="テスト線" color="#000" prefix="T" number="1" lang="ja" />);
    expect(screen.getByRole('img', { name: 'テスト線、駅ナンバー T1' })).toBeInTheDocument();
  });

  it('only lets plain hex colours reach CSS', () => {
    expect(safeLineColor('#a1b2c3')).toBe('#a1b2c3');
    expect(safeLineColor('#abc')).toBe('#abc');
    expect(safeLineColor('red; background: url(x)')).toBeNull();
    render(<LineBadge lineName="X" color="url(javascript:1)" prefix="X" lang="en" />);
    expect(screen.getByRole('img').getAttribute('style')).toBeNull();
  });
});
