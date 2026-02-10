// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SidebarProvider } from '../../ui/sidebar';
import { AppSidebar } from '../AppSidebar';
import { SpecTree } from '../SpecTree';
import type { SpecFileNode } from '../types';

type SampleStats = {
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
};

type BenchRow = {
  scenario: string;
  files: number;
  directories: number;
  totalNodes: number;
  avgMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
};

function buildSyntheticTree({
  rootName = 'specs',
  depth = 4,
  directoriesPerLevel = 4,
  filesPerDirectory = 10,
}: {
  rootName?: string;
  depth?: number;
  directoriesPerLevel?: number;
  filesPerDirectory?: number;
}): SpecFileNode[] {
  function makeDirectory(path: string, level: number): SpecFileNode {
    const children: SpecFileNode[] = [];

    for (let i = 0; i < filesPerDirectory; i += 1) {
      const suffix = String(i).padStart(2, '0');
      children.push({
        name: `20260210-1200${suffix}-node-${level}-${suffix}.tech.md`,
        path: `${path}/20260210-1200${suffix}-node-${level}-${suffix}.tech.md`,
        type: 'file',
        specType: 'tech-spec',
      });
    }

    if (level < depth) {
      for (let i = 0; i < directoriesPerLevel; i += 1) {
        const dirName = `dir-${level}-${i}`;
        children.push(makeDirectory(`${path}/${dirName}`, level + 1));
      }
    }

    return {
      name: path.split('/').pop() || rootName,
      path,
      type: 'directory',
      children,
    };
  }

  return [makeDirectory(rootName, 0)];
}

function countNodes(nodes: SpecFileNode[]) {
  let files = 0;
  let directories = 0;
  function walk(list: SpecFileNode[]) {
    for (const node of list) {
      if (node.type === 'directory') {
        directories += 1;
        if (node.children) walk(node.children);
      } else {
        files += 1;
      }
    }
  }
  walk(nodes);
  return { files, directories, totalNodes: files + directories };
}

function deepestFilePath(nodes: SpecFileNode[]): string {
  let best = '';
  let bestDepth = -1;
  function walk(list: SpecFileNode[]) {
    for (const node of list) {
      const depth = node.path.split('/').length;
      if (node.type === 'file' && depth > bestDepth) {
        bestDepth = depth;
        best = node.path;
      }
      if (node.children) walk(node.children);
    }
  }
  walk(nodes);
  return best;
}

function toStats(samples: number[]): SampleStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  const sum = sorted.reduce((acc, n) => acc + n, 0);
  return {
    avgMs: Number((sum / sorted.length).toFixed(2)),
    p95Ms: Number(sorted[p95Index].toFixed(2)),
    minMs: Number(sorted[0].toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

function benchmarkRender(
  renderFn: () => string,
  iterations = 8,
  warmup = 2
): SampleStats {
  for (let i = 0; i < warmup; i += 1) {
    renderFn();
  }

  const samples: number[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now();
    renderFn();
    samples.push(performance.now() - start);
  }
  return toStats(samples);
}

describe('spec tree render benchmark (SSR)', () => {
  it('profiles render cost for medium/large trees', () => {
    const datasets = [
      { name: 'medium', depth: 3, directoriesPerLevel: 4, filesPerDirectory: 10 },
      { name: 'large', depth: 4, directoriesPerLevel: 4, filesPerDirectory: 10 },
    ];

    const rows: BenchRow[] = [];

    for (const dataset of datasets) {
      const files = buildSyntheticTree({
        rootName: 'specs',
        depth: dataset.depth,
        directoriesPerLevel: dataset.directoriesPerLevel,
        filesPerDirectory: dataset.filesPerDirectory,
      });
      const selectedPath = deepestFilePath(files);
      const counts = countNodes(files);
      const onSelect = vi.fn();

      const specTreeInitial = benchmarkRender(() =>
        renderToString(<SpecTree files={files} selectedPath={null} onSelect={onSelect} />)
      );
      const specTreeSelected = benchmarkRender(() =>
        renderToString(<SpecTree files={files} selectedPath={selectedPath} onSelect={onSelect} />)
      );
      const sidebarInitial = benchmarkRender(() =>
        renderToString(
          <SidebarProvider defaultOpen>
            <AppSidebar files={files} selectedPath={null} onSelect={onSelect} />
          </SidebarProvider>
        )
      );
      const sidebarSelected = benchmarkRender(() =>
        renderToString(
          <SidebarProvider defaultOpen>
            <AppSidebar files={files} selectedPath={selectedPath} onSelect={onSelect} />
          </SidebarProvider>
        )
      );

      rows.push(
        { scenario: `SpecTree (${dataset.name}) initial`, ...counts, ...specTreeInitial },
        { scenario: `SpecTree (${dataset.name}) selected`, ...counts, ...specTreeSelected },
        { scenario: `AppSidebar (${dataset.name}) initial`, ...counts, ...sidebarInitial },
        { scenario: `AppSidebar (${dataset.name}) selected`, ...counts, ...sidebarSelected }
      );
    }

    console.table(rows);

    // Safety assertions: benchmark should execute and produce plausible non-zero timings.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.avgMs > 0)).toBe(true);
  }, 120000);
});
