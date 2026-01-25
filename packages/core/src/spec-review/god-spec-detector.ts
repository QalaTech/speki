/**
 * God Spec Detection Module
 *
 * Analyzes spec content for "god spec" indicators - signs that the spec is too large,
 * too broad, or lacks cohesion and should be split into smaller, focused specs.
 */

import type { CodebaseContext, GodSpecIndicators, ProposedSpec, SplitProposal } from '../types/index.js';

const USER_JOURNEY_PATTERNS = [
  /\b(?:admin|administrator)\s+(?:workflow|journey|flow)/i,
  /\b(?:end-?user|customer|user)\s+(?:workflow|journey|flow)/i,
  /\b(?:integration|api|developer)\s+(?:workflow|journey|flow)/i,
  /\b(?:as an?\s+(?:admin|user|developer|customer))/i,
];

const SYSTEM_BOUNDARY_PATTERNS = [
  /\b(?:auth|authentication|authorization|login|oauth|sso)/i,
  /\b(?:payment|billing|subscription|stripe|checkout)/i,
  /\b(?:notification|email|sms|push|alert)/i,
  /\b(?:analytics|metrics|tracking|telemetry|logging)/i,
  /\b(?:storage|database|cache|redis|s3|cdn)/i,
  /\b(?:search|elasticsearch|algolia)/i,
  /\b(?:messaging|queue|kafka|rabbitmq|pubsub)/i,
  /\b(?:external\s+api|third-?party|integration)/i,
];

const PERSONA_PATTERNS = [
  /\badmin(?:istrator)?\b/i,
  /\bend-?user\b/i,
  /\bcustomer\b/i,
  /\bdeveloper\b/i,
  /\boperator\b/i,
  /\bsupport\s+(?:team|staff|agent)\b/i,
];

function countWords(content: string): number {
  const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');
  const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]+`/g, '');
  const words = withoutInlineCode.split(/\s+/).filter((word) => word.length > 0);
  return words.length;
}

function countFeatureSections(content: string): number {
  const featureHeaders =
    content.match(/^##\s+(?!Table of Contents|Overview|Background|Context|Introduction|Glossary|References|Appendix)/gim) || [];
  return featureHeaders.length;
}

export function estimateStoryCount(content: string): number {
  const indicatorEstimate = countStoryIndicators(content);
  const featureSections = countFeatureSections(content);
  const featureEstimate = featureSections * 2;
  
  const wordCount = countWords(content);
  const lengthBasedEstimate = Math.ceil(wordCount / 200);

  return Math.max(indicatorEstimate + featureEstimate, lengthBasedEstimate, 1);
}

const ACCEPTANCE_CRITERIA_PATTERN = /^[-*]\s+(?:Given|When|Then|Should|Must|Can|Will)/gim;
const REQUIREMENTS_PATTERN = /^[-*]\s+(?:The system|Users?|Admin)/gim;
const NUMBERED_ITEMS_PATTERN = /^\d+\.\s+\S/gm;

function countStoryIndicators(content: string): number {
  const acceptanceCriteria = content.match(ACCEPTANCE_CRITERIA_PATTERN) || [];
  const requirements = content.match(REQUIREMENTS_PATTERN) || [];
  const numberedItems = content.match(NUMBERED_ITEMS_PATTERN) || [];

  return acceptanceCriteria.length + requirements.length + Math.ceil(numberedItems.length * 0.5);
}

function identifyFeatureDomains(content: string): string[] {
  const domains = new Set<string>();
  const headers = content.match(/^##\s+(.+)$/gm) || [];

  for (const header of headers) {
    const domainName = header.replace(/^##\s+/, '').trim();
    const isBoilerplateSection = /^(Overview|Background|Context|Introduction|Summary|Conclusion|References|Appendix)/i.test(domainName);
    if (domainName && !isBoilerplateSection) {
      domains.add(domainName);
    }
  }

  return Array.from(domains);
}

function identifySystemBoundaries(content: string): string[] {
  const boundaries = new Set<string>();

  for (const pattern of SYSTEM_BOUNDARY_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      const boundary = match[0].toLowerCase().split(/\s+/)[0];
      boundaries.add(boundary);
    }
  }

  return Array.from(boundaries);
}

function findPersonaMatches(content: string): Set<string> {
  const personaMatches = new Set<string>();
  for (const pattern of PERSONA_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      personaMatches.add(matches[0].toLowerCase());
    }
  }
  return personaMatches;
}

function countUserJourneys(content: string): number {
  let journeyCount = 0;

  for (const pattern of USER_JOURNEY_PATTERNS) {
    if (pattern.test(content)) {
      journeyCount++;
    }
  }

  const personaMatches = findPersonaMatches(content);
  return Math.max(journeyCount, personaMatches.size > 2 ? personaMatches.size : 0);
}

function hasDefinitionOfDone(content: string): boolean {
  const donePatterns = [
    /\bdefinition\s+of\s+done\b/i,
    /\bdone\s+when\b/i,
    /\bcomplete\s+when\b/i,
    /\bsuccess\s+criteria\b/i,
    /\bacceptance\s+criteria\b/i,
    /\bdeliverables?\b/i,
    /\bout\s+of\s+scope\b/i, // Having explicit scope boundaries indicates focus
  ];

  return donePatterns.some((pattern) => pattern.test(content));
}

interface SizeIndicators {
  sectionCount: number;
  wordCount: number;
  estimatedStories: number;
  triggered: string[];
}

interface ScopeIndicators {
  userJourneys: number;
  systemBoundaries: string[];
  triggered: string[];
}

interface CohesionIndicators {
  hasDefinitionOfDone: boolean;
  personaCount: number;
  triggered: string[];
}

function checkSizeIndicators(content: string): SizeIndicators {
  const sectionCount = countFeatureSections(content);
  const wordCount = countWords(content);
  const estimatedStories = estimateStoryCount(content);
  const triggered: string[] = [];

  if (sectionCount > 3) {
    triggered.push(`Size: ${sectionCount} feature sections (threshold: 3)`);
  }
  if (wordCount > 2000) {
    triggered.push(`Size: ${wordCount} words (threshold: 2000)`);
  }
  if (estimatedStories > 15) {
    triggered.push(`Size: ~${estimatedStories} estimated stories (threshold: 15)`);
  }

  return { sectionCount, wordCount, estimatedStories, triggered };
}

function checkScopeIndicators(content: string): ScopeIndicators {
  const userJourneys = countUserJourneys(content);
  const systemBoundaries = identifySystemBoundaries(content);
  const triggered: string[] = [];

  if (userJourneys >= 2) {
    triggered.push(`Scope: ${userJourneys} distinct user journeys detected`);
  }
  if (systemBoundaries.length > 3) {
    triggered.push(`Scope: ${systemBoundaries.length} system boundaries (${systemBoundaries.join(', ')})`);
  }

  return { userJourneys, systemBoundaries, triggered };
}

function checkCohesionIndicators(content: string): CohesionIndicators {
  const hasDoD = hasDefinitionOfDone(content);
  const personaMatches = findPersonaMatches(content);
  const personaCount = personaMatches.size;
  const triggered: string[] = [];

  if (!hasDoD) {
    triggered.push('Cohesion: No clear definition of done or success criteria');
  }
  if (personaCount > 2) {
    triggered.push(`Cohesion: ${personaCount} different personas (${Array.from(personaMatches).join(', ')})`);
  }

  return { hasDefinitionOfDone: hasDoD, personaCount, triggered };
}

/**
 * Detects if a spec is a "god spec" based on size, scope, and cohesion indicators
 *
 * @param specContent - The raw markdown content of the spec
 * @param _codebaseContext - Context about the codebase (for future use)
 * @returns Detection result with indicators and recommendations
 */
export function detectGodSpec(specContent: string, _codebaseContext: CodebaseContext): GodSpecIndicators {
  const sizeIndicators = checkSizeIndicators(specContent);
  const scopeIndicators = checkScopeIndicators(specContent);
  const cohesionIndicators = checkCohesionIndicators(specContent);

  const allIndicators = [...sizeIndicators.triggered, ...scopeIndicators.triggered, ...cohesionIndicators.triggered];

  const categoriesTriggered = [
    sizeIndicators.triggered.length > 0,
    scopeIndicators.triggered.length > 0,
    cohesionIndicators.triggered.length > 0,
  ].filter(Boolean).length;

  const isGodSpec = categoriesTriggered >= 2;

  return {
    isGodSpec,
    indicators: allIndicators,
    estimatedStories: sizeIndicators.estimatedStories,
    featureDomains: identifyFeatureDomains(specContent),
    systemBoundaries: scopeIndicators.systemBoundaries,
  };
}


export function generateFilename(basename: string, featureName: string): string {
  const kebabFeature = toKebabCase(featureName);
  return `${basename}.${kebabFeature}.md`;
}

function toKebabCase(input: string): string {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'with']);

  const words = input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 0 && !stopWords.has(word))
    .slice(0, 3);

  if (words.length === 0) {
    return 'feature';
  }

  return words.join('-');
}

function estimateSectionStories(sectionContent: string): number {
  return Math.max(countStoryIndicators(sectionContent), 2);
}

function extractSectionContent(content: string, sectionName: string): string {
  const escapedName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^##\\s+${escapedName}[\\s\\S]*?(?=^##\\s|$)`, 'gim');
  const match = content.match(pattern);
  return match ? match[0] : '';
}

function groupRelatedDomains(featureDomains: string[]): string[][] {
  if (featureDomains.length <= 3) {
    return featureDomains.map((domain) => [domain]);
  }

  const groups: string[][] = [];
  const used = new Set<string>();

  const relationPatterns: [RegExp, string][] = [
    [/\bauth|login|password|credential|session/i, 'authentication'],
    [/\buser|profile|account|settings/i, 'user-management'],
    [/\badmin|management|dashboard|panel/i, 'administration'],
    [/\bapi|integration|external|webhook/i, 'integration'],
    [/\bnotif|email|alert|message/i, 'notifications'],
  ];

  for (const [pattern, _groupName] of relationPatterns) {
    const relatedDomains = featureDomains.filter(
      (domain) => pattern.test(domain) && !used.has(domain)
    );

    if (relatedDomains.length > 0) {
      groups.push(relatedDomains);
      relatedDomains.forEach((d) => used.add(d));
    }
  }

  const ungrouped = featureDomains.filter((d) => !used.has(d));
  for (const domain of ungrouped) {
    groups.push([domain]);
  }

  return groups;
}

function generateDescription(sections: string[], specContent: string): string {
  if (sections.length === 1) {
    const sectionContent = extractSectionContent(specContent, sections[0]);
    const firstParagraph = sectionContent
      .split('\n')
      .filter((line) => line.trim() && !line.startsWith('#'))
      .slice(0, 2)
      .join(' ')
      .substring(0, 150);

    return firstParagraph || `Handles ${sections[0].toLowerCase()} functionality`;
  }

  return `Covers ${sections.slice(0, 3).join(', ')}${sections.length > 3 ? ` and ${sections.length - 3} more` : ''}`;
}

/**
 * Generates split proposals for a god spec
 *
 * @param specContent - The raw markdown content of the spec
 * @param indicators - The god spec detection results
 * @param originalFilename - Optional original filename (defaults to 'spec')
 * @returns A split proposal with suggested smaller specs
 */
export function generateSplitProposal(
  specContent: string,
  indicators: GodSpecIndicators,
  originalFilename: string = 'spec'
): SplitProposal {
  const basename = originalFilename.replace(/\.md$/i, '').replace(/\.spec$/i, '');

  const reasonParts: string[] = [];
  if (indicators.estimatedStories > 15) {
    reasonParts.push(`estimated ${indicators.estimatedStories} stories (threshold: 15)`);
  }
  if (indicators.featureDomains.length > 3) {
    reasonParts.push(`${indicators.featureDomains.length} distinct feature domains`);
  }
  if (indicators.indicators.length > 0) {
    reasonParts.push(indicators.indicators[0]);
  }

  const reason =
    reasonParts.length > 0
      ? `Spec should be split: ${reasonParts.join('; ')}`
      : 'Spec exceeds recommended complexity thresholds';

  const domainGroups = groupRelatedDomains(indicators.featureDomains);

  const proposedSpecs: ProposedSpec[] = domainGroups.map((sections) => {
    const featureName = sections[0];
    const filename = generateFilename(basename, featureName);

    let totalStories = 0;
    for (const section of sections) {
      const sectionContent = extractSectionContent(specContent, section);
      totalStories += estimateSectionStories(sectionContent);
    }

    return {
      filename,
      description: generateDescription(sections, specContent),
      estimatedStories: totalStories,
      sections,
    };
  });

  return {
    originalFile: originalFilename,
    reason,
    proposedSpecs,
  };
}
