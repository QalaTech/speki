import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IdRegistry } from '../id-registry.js';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('IdRegistry', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'id-registry-test-'));
    await mkdir(join(testDir, '.speki'), { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('formatId', () => {
    it('formatId_SingleDigit_PadsWithZeros', () => {
      expect(IdRegistry.formatId('US', 1)).toBe('US-001');
    });

    it('formatId_DoubleDigit_PadsWithZero', () => {
      expect(IdRegistry.formatId('US', 42)).toBe('US-042');
    });

    it('formatId_TripleDigit_NoPadding', () => {
      expect(IdRegistry.formatId('TS', 123)).toBe('TS-123');
    });

    it('formatId_LargeNumber_NoTruncation', () => {
      expect(IdRegistry.formatId('US', 1000)).toBe('US-1000');
    });
  });

  describe('parseId', () => {
    it('parseId_ValidUSId_ReturnsComponents', () => {
      const result = IdRegistry.parseId('US-001');
      expect(result).toEqual({ prefix: 'US', num: 1 });
    });

    it('parseId_ValidTSId_ReturnsComponents', () => {
      const result = IdRegistry.parseId('TS-042');
      expect(result).toEqual({ prefix: 'TS', num: 42 });
    });

    it('parseId_InvalidPrefix_ReturnsNull', () => {
      const result = IdRegistry.parseId('XX-001');
      expect(result).toBeNull();
    });

    it('parseId_MissingDash_ReturnsNull', () => {
      const result = IdRegistry.parseId('US001');
      expect(result).toBeNull();
    });

    it('parseId_NonNumericSuffix_ReturnsNull', () => {
      const result = IdRegistry.parseId('US-abc');
      expect(result).toBeNull();
    });

    it('parseId_EmptyString_ReturnsNull', () => {
      const result = IdRegistry.parseId('');
      expect(result).toBeNull();
    });
  });

  describe('ensureExists', () => {
    it('ensureExists_WhenNoRegistry_CreatesEmptyRegistry', async () => {
      await IdRegistry.ensureExists(testDir);

      const registryPath = join(testDir, '.speki', 'id-registry.json');
      const content = await readFile(registryPath, 'utf-8');
      const registry = JSON.parse(content);

      expect(registry.version).toBe(1);
      expect(registry.counters.US).toBe(1);
      expect(registry.counters.TS).toBe(1);
      expect(registry.allocated).toEqual({});
    });

    it('ensureExists_WhenRegistryExists_DoesNotOverwrite', async () => {
      const registryPath = join(testDir, '.speki', 'id-registry.json');
      const existingRegistry = {
        version: 1,
        counters: { US: 10, TS: 5 },
        allocated: { 'US-001': 'existing-spec' },
      };
      await writeFile(registryPath, JSON.stringify(existingRegistry));

      await IdRegistry.ensureExists(testDir);

      const content = await readFile(registryPath, 'utf-8');
      const registry = JSON.parse(content);
      expect(registry.counters.US).toBe(10);
      expect(registry.allocated['US-001']).toBe('existing-spec');
    });

    it('ensureExists_WithExistingSpecs_ScansAndPopulates', async () => {
      // Create existing spec with tasks.json
      const specDir = join(testDir, '.speki', 'specs', 'my-feature');
      await mkdir(specDir, { recursive: true });
      await writeFile(
        join(specDir, 'tasks.json'),
        JSON.stringify({
          userStories: [
            { id: 'US-001', title: 'Story 1' },
            { id: 'US-002', title: 'Story 2' },
            { id: 'US-005', title: 'Story 5' },
          ],
        })
      );

      await IdRegistry.ensureExists(testDir);

      const registry = await IdRegistry.load(testDir);
      expect(registry.counters.US).toBe(6); // max(5) + 1
      expect(registry.allocated['US-001']).toBe('my-feature');
      expect(registry.allocated['US-002']).toBe('my-feature');
      expect(registry.allocated['US-005']).toBe('my-feature');
    });
  });

  describe('getNextId', () => {
    it('getNextId_FirstCall_ReturnsOne', async () => {
      const result = await IdRegistry.getNextId(testDir, 'US');
      expect(result).toBe('US-001');
    });

    it('getNextId_AfterPreviousAllocation_ReturnsContinuingNumber', async () => {
      // Set up registry with existing allocation
      const registryPath = join(testDir, '.speki', 'id-registry.json');
      await writeFile(
        registryPath,
        JSON.stringify({
          version: 1,
          counters: { US: 5, TS: 1 },
          allocated: {},
        })
      );

      const result = await IdRegistry.getNextId(testDir, 'US');
      expect(result).toBe('US-005');
    });

    it('getNextId_DifferentPrefixes_IndependentCounters', async () => {
      const registryPath = join(testDir, '.speki', 'id-registry.json');
      await writeFile(
        registryPath,
        JSON.stringify({
          version: 1,
          counters: { US: 10, TS: 3 },
          allocated: {},
        })
      );

      const usResult = await IdRegistry.getNextId(testDir, 'US');
      const tsResult = await IdRegistry.getNextId(testDir, 'TS');

      expect(usResult).toBe('US-010');
      expect(tsResult).toBe('TS-003');
    });
  });

  describe('reserveIds', () => {
    it('reserveIds_SingleId_ReturnsAndIncrementsCounter', async () => {
      const ids = await IdRegistry.reserveIds(testDir, 'US', 1);
      expect(ids).toEqual(['US-001']);

      const nextId = await IdRegistry.getNextId(testDir, 'US');
      expect(nextId).toBe('US-002');
    });

    it('reserveIds_MultipleIds_ReturnsSequentialIds', async () => {
      const ids = await IdRegistry.reserveIds(testDir, 'TS', 3);
      expect(ids).toEqual(['TS-001', 'TS-002', 'TS-003']);

      const nextId = await IdRegistry.getNextId(testDir, 'TS');
      expect(nextId).toBe('TS-004');
    });

    it('reserveIds_AfterExisting_ContinuesFromCounter', async () => {
      const registryPath = join(testDir, '.speki', 'id-registry.json');
      await writeFile(
        registryPath,
        JSON.stringify({
          version: 1,
          counters: { US: 5, TS: 1 },
          allocated: {},
        })
      );

      const ids = await IdRegistry.reserveIds(testDir, 'US', 2);
      expect(ids).toEqual(['US-005', 'US-006']);
    });
  });

  describe('registerIds', () => {
    it('registerIds_NewIds_AllocatesToSpec', async () => {
      await IdRegistry.registerIds(testDir, ['US-001', 'US-002'], 'auth-spec');

      const registry = await IdRegistry.load(testDir);
      expect(registry.allocated['US-001']).toBe('auth-spec');
      expect(registry.allocated['US-002']).toBe('auth-spec');
    });

    it('registerIds_SameSpecTwice_Succeeds', async () => {
      await IdRegistry.registerIds(testDir, ['US-001'], 'auth-spec');
      await IdRegistry.registerIds(testDir, ['US-001'], 'auth-spec');

      const registry = await IdRegistry.load(testDir);
      expect(registry.allocated['US-001']).toBe('auth-spec');
    });

    it('registerIds_DifferentSpec_ThrowsError', async () => {
      await IdRegistry.registerIds(testDir, ['US-001'], 'auth-spec');

      await expect(
        IdRegistry.registerIds(testDir, ['US-001'], 'other-spec')
      ).rejects.toThrow("ID US-001 is already allocated to spec 'auth-spec'");
    });

    it('registerIds_UpdatesCounterIfNeeded', async () => {
      await IdRegistry.registerIds(testDir, ['US-010'], 'feature-spec');

      const registry = await IdRegistry.load(testDir);
      expect(registry.counters.US).toBe(11);
    });
  });

  describe('isIdAllocated', () => {
    it('isIdAllocated_AllocatedId_ReturnsTrue', async () => {
      await IdRegistry.registerIds(testDir, ['US-001'], 'spec');
      const result = await IdRegistry.isIdAllocated(testDir, 'US-001');
      expect(result).toBe(true);
    });

    it('isIdAllocated_UnallocatedId_ReturnsFalse', async () => {
      const result = await IdRegistry.isIdAllocated(testDir, 'US-999');
      expect(result).toBe(false);
    });
  });

  describe('getIdOwner', () => {
    it('getIdOwner_AllocatedId_ReturnsSpecId', async () => {
      await IdRegistry.registerIds(testDir, ['TS-001'], 'caching-spec');
      const owner = await IdRegistry.getIdOwner(testDir, 'TS-001');
      expect(owner).toBe('caching-spec');
    });

    it('getIdOwner_UnallocatedId_ReturnsNull', async () => {
      const owner = await IdRegistry.getIdOwner(testDir, 'TS-999');
      expect(owner).toBeNull();
    });
  });

  describe('listAllocatedIds', () => {
    beforeEach(async () => {
      await IdRegistry.registerIds(testDir, ['US-001', 'US-002'], 'auth-spec');
      await IdRegistry.registerIds(testDir, ['TS-001'], 'cache-spec');
    });

    it('listAllocatedIds_NoFilter_ReturnsAll', async () => {
      const ids = await IdRegistry.listAllocatedIds(testDir);
      expect(ids).toEqual([
        { id: 'TS-001', specId: 'cache-spec' },
        { id: 'US-001', specId: 'auth-spec' },
        { id: 'US-002', specId: 'auth-spec' },
      ]);
    });

    it('listAllocatedIds_FilterByUS_ReturnsOnlyUS', async () => {
      const ids = await IdRegistry.listAllocatedIds(testDir, 'US');
      expect(ids).toEqual([
        { id: 'US-001', specId: 'auth-spec' },
        { id: 'US-002', specId: 'auth-spec' },
      ]);
    });

    it('listAllocatedIds_FilterByTS_ReturnsOnlyTS', async () => {
      const ids = await IdRegistry.listAllocatedIds(testDir, 'TS');
      expect(ids).toEqual([{ id: 'TS-001', specId: 'cache-spec' }]);
    });
  });

  describe('migration scenario', () => {
    it('migration_ExistingSpecsWithGaps_FillsRegistryCorrectly', async () => {
      // Set up two existing specs with non-sequential IDs
      const specA = join(testDir, '.speki', 'specs', 'spec-a');
      const specB = join(testDir, '.speki', 'specs', 'spec-b');
      await mkdir(specA, { recursive: true });
      await mkdir(specB, { recursive: true });

      await writeFile(
        join(specA, 'tasks.json'),
        JSON.stringify({
          userStories: [
            { id: 'US-001', title: 'A1' },
            { id: 'US-003', title: 'A3' },
          ],
        })
      );

      await writeFile(
        join(specB, 'tasks.json'),
        JSON.stringify({
          userStories: [
            { id: 'TS-001', title: 'B1' },
            { id: 'TS-002', title: 'B2' },
          ],
        })
      );

      // First access triggers migration
      const registry = await IdRegistry.load(testDir);

      expect(registry.counters.US).toBe(4); // max(3) + 1
      expect(registry.counters.TS).toBe(3); // max(2) + 1
      expect(registry.allocated['US-001']).toBe('spec-a');
      expect(registry.allocated['US-003']).toBe('spec-a');
      expect(registry.allocated['TS-001']).toBe('spec-b');
      expect(registry.allocated['TS-002']).toBe('spec-b');
    });
  });
});
