import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { listSpecs, loadPRDForSpec, readSpecMetadata } from '@speki/core';
import type { PRDData } from '@speki/core';

/**
 * Resolves the spec ID and loads PRD from spec-partitioned location.
 */
export async function resolveSpecAndLoadPRD(
  projectPath: string,
  specOption?: string
): Promise<{ prd: PRDData; specId: string | null } | null> {
  const specs = await listSpecs(projectPath);

  if (specOption) {
    return resolveExplicitSpec(projectPath, specs, specOption);
  }

  // If single spec exists, use it
  if (specs.length === 1) {
    const specId = specs[0];
    const prd = await loadPRDForSpec(projectPath, specId);
    if (prd) return { prd, specId };
  }

  // If multiple specs exist, prompt user to select among those with PRDs and valid statuses
  if (specs.length > 1) {
    return resolveMultipleSpecs(projectPath, specs);
  }

  // No specs exist
  return null;
}

/** Handles explicit --spec flag by validating and loading the specified spec. */
export async function resolveExplicitSpec(
  projectPath: string,
  specs: string[],
  specOption: string
): Promise<{ prd: PRDData; specId: string } | null> {
  if (!specs.includes(specOption)) {
    console.error(chalk.red(`Error: Spec '${specOption}' not found.`));
    console.error(chalk.yellow(`Available specs: ${specs.join(', ') || 'none'}`));
    return null;
  }

  const prd = await loadPRDForSpec(projectPath, specOption);
  if (!prd) {
    console.error(chalk.red(`Error: No PRD found for spec '${specOption}'. Run \`qala decompose\` first.`));
    return null;
  }
  return { prd, specId: specOption };
}

/** Handles multiple specs by prompting among those with decomposed PRDs and valid statuses. */
export async function resolveMultipleSpecs(
  projectPath: string,
  specs: string[]
): Promise<{ prd: PRDData; specId: string } | null> {
  const validStatuses = ['decomposed', 'active', 'completed'];
  const specsWithPrds: string[] = [];

  for (const spec of specs) {
    const metadata = await readSpecMetadata(projectPath, spec);
    if (!metadata || !validStatuses.includes(metadata.status)) continue;
    const prd = await loadPRDForSpec(projectPath, spec);
    if (prd) specsWithPrds.push(spec);
  }

  if (specsWithPrds.length === 0) {
    console.error(chalk.red('Error: No specs have decomposed PRDs. Run `qala decompose` first.'));
    return null;
  }

  const specId = specsWithPrds.length === 1
    ? specsWithPrds[0]
    : await select({
        message: 'Multiple decomposed specs found. Select one to start:',
        choices: specsWithPrds.map((spec) => ({ name: spec, value: spec })),
      });

  const prd = await loadPRDForSpec(projectPath, specId);
  return prd ? { prd, specId } : null;
}

