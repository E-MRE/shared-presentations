import { describe, expect, it } from 'vitest';
import { validateCatalog } from '../../src/data/validation';
import { deckFromDoc } from '../../src/data/converters';
describe('Backward compatible category and tags', () => {
  it('reads legacy documents as uncategorized without changing stored data', () => {
    const deck = deckFromDoc('old', {});
    expect(deck.category).toBe(''); expect(deck.tags).toEqual([]);
    expect(validateCatalog({}).ok).toBe(true);
  });
  it('accepts supported categories and bounded tags', () => {
    expect(validateCatalog({ category: 'AI & LLM', tags: ['öğrenme', 'LLM'] }).ok).toBe(true);
  });
  it.each([{ category: 'unsupported' }, { tags: Array.from({ length: 9 }, (_, index) => String(index)) }, { tags: ['a', 'a'] }, { tags: [' '] }, { tags: ['x'.repeat(33)] }])('rejects invalid metadata %j', input => {
    expect(validateCatalog(input).ok).toBe(false);
  });
});
