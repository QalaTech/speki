import { describe, it, expect } from 'vitest';
import { sanitizeForMdx } from '../sanitize';

describe('sanitizeForMdx', () => {
  describe('empty and null-ish content', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizeForMdx('')).toBe('');
    });
  });

  describe('HTML comment removal', () => {
    it('removes single-line HTML comments', () => {
      const input = 'Hello <!-- this is a comment --> World';
      expect(sanitizeForMdx(input)).toBe('Hello  World');
    });

    it('removes multi-line HTML comments', () => {
      const input = 'Hello <!--\nthis is a\nmulti-line comment\n--> World';
      expect(sanitizeForMdx(input)).toBe('Hello  World');
    });
  });

  describe('invalid HTML tag escaping', () => {
    it('escapes type parameter syntax like <string>', () => {
      const input = 'The function returns <string> type';
      expect(sanitizeForMdx(input)).toBe('The function returns \\<string\\> type');
    });

    it('escapes generic type syntax like <T>', () => {
      const input = 'Generic type <T> is used';
      expect(sanitizeForMdx(input)).toBe('Generic type \\<T\\> is used');
    });

    it('preserves valid HTML tags like <div>', () => {
      const input = 'Use <div> for containers';
      expect(sanitizeForMdx(input)).toBe('Use <div> for containers');
    });

    it('preserves valid HTML tags like <span>', () => {
      const input = '<span>text</span>';
      expect(sanitizeForMdx(input)).toBe('<span>text</span>');
    });

    it('escapes closing invalid tags like </MyComponent>', () => {
      const input = 'End tag </MyComponent> here';
      expect(sanitizeForMdx(input)).toBe('End tag \\</MyComponent\\> here');
    });
  });

  describe('comparison operator escaping', () => {
    it('escapes less-than in comparisons like x < y', () => {
      const input = 'Check if x < y';
      expect(sanitizeForMdx(input)).toBe('Check if x \\< y');
    });

    it('escapes greater-than in comparisons like a > b', () => {
      const input = 'Check if a > b';
      expect(sanitizeForMdx(input)).toBe('Check if a \\> b');
    });
  });

  describe('incomplete tag escaping', () => {
    it('escapes opening angle bracket without closing', () => {
      const input = 'The type <UserInput is incomplete';
      expect(sanitizeForMdx(input)).toBe('The type \\<UserInput is incomplete');
    });
  });

  describe('special processing directives removal', () => {
    it('removes DOCTYPE declarations', () => {
      const input = '<!DOCTYPE html>\nHello World';
      expect(sanitizeForMdx(input)).toBe('\nHello World');
    });

    it('removes XML processing instructions', () => {
      const input = '<?xml version="1.0"?>\nHello World';
      expect(sanitizeForMdx(input)).toBe('\nHello World');
    });
  });

  describe('code block preservation', () => {
    it('does not modify content inside triple backtick code blocks', () => {
      const input = '```typescript\nconst x: Array<string> = [];\n```';
      expect(sanitizeForMdx(input)).toBe('```typescript\nconst x: Array<string> = [];\n```');
    });

    it('does not modify content inside inline code', () => {
      const input = 'Use `Array<T>` for generic arrays';
      expect(sanitizeForMdx(input)).toBe('Use `Array<T>` for generic arrays');
    });

    it('processes text outside code blocks while preserving code blocks', () => {
      const input = 'Type <T> is used in `Array<T>` syntax';
      expect(sanitizeForMdx(input)).toBe('Type \\<T\\> is used in `Array<T>` syntax');
    });
  });

  describe('mixed content', () => {
    it('handles complex markdown with multiple patterns', () => {
      const input = `# Header
<!-- comment -->
Type <string> is common.

\`\`\`js
const x = <T>value;
\`\`\`

Check if a < b and use \`<div>\` elements.`;

      const result = sanitizeForMdx(input);

      // Comment should be removed
      expect(result).not.toContain('<!-- comment -->');
      // Type parameter outside code should be escaped
      expect(result).toContain('\\<string\\>');
      // Code block content should be preserved
      expect(result).toContain('const x = <T>value;');
      // Comparison should be escaped
      expect(result).toContain('a \\< b');
      // Inline code should be preserved
      expect(result).toContain('`<div>`');
    });
  });
});
