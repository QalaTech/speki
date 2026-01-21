import { describe, it, expect } from 'vitest';
import { convertCodexLineToJson } from '../codex-cli.js';

describe('convertCodexLineToJson', () => {
  describe('CodexCli_ConvertCodexLineToJson_IsExported', () => {
    it('exports convertCodexLineToJson as a named export', () => {
      expect(convertCodexLineToJson).toBeDefined();
      expect(typeof convertCodexLineToJson).toBe('function');
    });

    it('converts thinking line with timestamp', () => {
      const line = '[2024-01-21T10:00:00] thinking Let me analyze this problem';
      const result = convertCodexLineToJson(line);
      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.type).toBe('thinking');
      expect(parsed.thinking).toBe('Let me analyze this problem');
      expect(parsed.timestamp).toBe('2024-01-21T10:00:00');
    });

    it('converts codex text line with timestamp', () => {
      const line = '[2024-01-21T10:00:00] codex Here is my response';
      const result = convertCodexLineToJson(line);
      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.type).toBe('text');
      expect(parsed.text).toBe('Here is my response');
      expect(parsed.timestamp).toBe('2024-01-21T10:00:00');
    });

    it('converts exec line to tool_use format', () => {
      const line = '[2024-01-21T10:00:00] exec ls -la /tmp';
      const result = convertCodexLineToJson(line);
      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.type).toBe('tool_use');
      expect(parsed.name).toBe('bash');
      expect(parsed.input.command).toBe('ls -la /tmp');
      expect(parsed.timestamp).toBe('2024-01-21T10:00:00');
    });

    it('converts tokens line to usage format', () => {
      const line = '[2024-01-21T10:00:00] tokens input=100 output=50';
      const result = convertCodexLineToJson(line);
      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.type).toBe('usage');
      expect(parsed.info).toBe('input=100 output=50');
      expect(parsed.timestamp).toBe('2024-01-21T10:00:00');
    });

    it('converts system info line', () => {
      const line = '[2024-01-21T10:00:00] model claude-3-opus';
      const result = convertCodexLineToJson(line);
      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.type).toBe('system');
      expect(parsed.subtype).toBe('model');
      expect(parsed.content).toBe('claude-3-opus');
      expect(parsed.timestamp).toBe('2024-01-21T10:00:00');
    });

    it('handles empty codex line by returning null', () => {
      const line = '[2024-01-21T10:00:00] codex';
      const result = convertCodexLineToJson(line);
      expect(result).toBeNull();
    });

    it('handles non-timestamped plain text line', () => {
      const line = 'This is plain text without timestamp';
      const result = convertCodexLineToJson(line);
      expect(result).toBeDefined();
      const parsed = JSON.parse(result!);
      expect(parsed.type).toBe('text');
      expect(parsed.text).toBe('This is plain text without timestamp');
    });

    it('returns null for empty line', () => {
      const result = convertCodexLineToJson('');
      expect(result).toBeNull();
    });

    it('returns null for whitespace-only line', () => {
      const result = convertCodexLineToJson('   ');
      expect(result).toBeNull();
    });
  });
});
