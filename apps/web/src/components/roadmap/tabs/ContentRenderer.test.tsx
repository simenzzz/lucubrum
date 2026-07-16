/**
 * Regression test: reading-material text must render literally.
 * React escapes text children itself — any manual escapeHtml() pass on top
 * double-escapes and shows literal entities (don&#x27;t, x &lt; y) on screen.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContentRenderer } from './LearningTab';

describe('ContentRenderer', () => {
  it('renders special characters literally, not as HTML entities', () => {
    const { container } = render(
      <ContentRenderer content={"Don't stop & won't quit\nO(1) < O(n) > O(log n)"} />
    );

    expect(container.textContent).toContain("Don't stop & won't quit");
    expect(container.textContent).toContain('O(1) < O(n) > O(log n)');
    // Double-escaping artifacts must never appear
    expect(container.textContent).not.toMatch(/&(amp|lt|gt|quot|#x27);/);
  });

  it('renders inline markdown (bold, italic, code) with literal special chars inside', () => {
    const { container } = render(
      <ContentRenderer content={'**bold & loud** and *it\'s italic* and `a < b`'} />
    );

    expect(screen.getByText('bold & loud').tagName).toBe('STRONG');
    expect(screen.getByText("it's italic").tagName).toBe('EM');
    expect(screen.getByText('a < b').tagName).toBe('CODE');
    expect(container.textContent).not.toMatch(/&(amp|lt|gt|quot|#x27);/);
  });

  it('renders bullets and headings', () => {
    const { container } = render(
      <ContentRenderer content={'## Heading\n- first item\n### Sub'} />
    );

    expect(screen.getByText('Heading').tagName).toBe('H4');
    expect(screen.getByText('Sub').tagName).toBe('H5');
    expect(screen.getByText('first item').tagName).toBe('LI');
    expect(container.textContent).not.toMatch(/&(amp|lt|gt|quot|#x27);/);
  });
});
