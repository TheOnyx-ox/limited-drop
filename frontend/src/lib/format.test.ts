import { describe, expect, it } from 'vitest';
import { formatRemaining } from './format';

describe('formatRemaining', () => {
  it('formats minutes and zero-pads seconds', () => {
    expect(formatRemaining(83_400)).toBe('1:24');
    expect(formatRemaining(9_000)).toBe('0:09');
  });
  it('rounds up so it never shows 0:00 while time remains', () => {
    expect(formatRemaining(1)).toBe('0:01');
  });
  it('clamps negatives to zero', () => {
    expect(formatRemaining(-5000)).toBe('0:00');
  });
});