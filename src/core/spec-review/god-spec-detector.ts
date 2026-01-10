/**
 * God Spec Detection Module
 *
 * Analyzes spec content for "god spec" indicators - signs that the spec is too large,
 * too broad, or lacks cohesion and should be split into smaller, focused specs.
 */

import type { CodebaseContext, GodSpecIndicators } from '../../types/index.js';

/** Patterns indicating user journey sections in a spec */
const USER_JOURNEY_PATTERNS = [
  /\b(?:admin|administrator)\s+(?:workflow|journey|flow)/i,
  /\b(?:end-?user|customer|user)\s+(?:workflow|journey|flow)/i,
  /\b(?:integration|api|developer)\s+(?:workflow|journey|flow)/i,
  /\b(?:as an?\s+(?:admin|user|developer|customer))/i,
];

/** Patterns indicating system boundaries in a spec */
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

/** Patterns indicating different personas */
const PERSONA_PATTERNS = [
  /\badmin(?:istrator)?\b/i,
  /\bend-?user\b/i,
  /\bcustomer\b/i,
  /\bdeveloper\b/i,
  /\boperator\b/i,
  /\bsupport\s+(?:team|staff|agent)\b/i,
];

/**
 * Counts words in spec content, excluding code blocks and markdown artifacts
 */
function countWords(content: string): number {
  const withoutCodeBlocks = content.replace(/```[\s\S]*?```/g, '');
  const withoutInlineCode = withoutCodeBlocks.replace(/`[^`]+`/g, '');
  const words = withoutInlineCode.split(/\s+/).filter((word) => word.length > 0);
  return words.length;
}

/**
 * Counts feature sections in spec content (## level headers that indicate features)
 */
function countFeatureSections(content: string): number {
  const featureHeaders =
    content.match(/^##\s+(?!Table of Contents|Overview|Background|Context|Introduction|Glossary|References|Appendix)/gim) || [];
  return featureHeaders.length;
}

/**
 * Estimates the number of user stories that would result from decomposing the spec
 */
export function estimateStoryCount(content: string): number {
  let estimate = 0;

  const acceptanceCriteria = content.match(/^[-*]\s+(?:Given|When|Then|Should|Must|Can|Will)/gim) || [];
  estimate += acceptanceCriteria.length;

  const requirements = content.match(/^[-*]\s+(?:The system|Users?|Admin)/gim) || [];
  estimate += requirements.length;

  const numberedItems = content.match(/^\d+\.\s+\S/gm) || [];
  estimate += Math.ceil(numberedItems.length * 0.5);

  const featureSections = countFeatureSections(content);
  estimate += featureSections * 2;

  const wordCount = countWords(content);
  const lengthBasedEstimate = Math.ceil(wordCount / 200);

  return Math.max(estimate, lengthBasedEstimate, 1);
}

/**
 * Identifies distinct feature domains in the spec
 */
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

/**
 * Identifies system boundaries touched by the spec
 */
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

/**
 * Counts distinct user journeys in the spec
 */
function countUserJourneys(content: string): number {
  let journeyCount = 0;

  for (const pattern of USER_JOURNEY_PATTERNS) {
    if (pattern.test(content)) {
      journeyCount++;
    }
  }

  const personaMatches = new Set<string>();
  for (const pattern of PERSONA_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      personaMatches.add(matches[0].toLowerCase());
    }
  }

  return Math.max(journeyCount, personaMatches.size > 2 ? personaMatches.size : 0);
}

/**
 * Checks if the spec has a clear definition of done
 */
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

/**
 * Checks size indicators per PRD rules
 */
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

/**
 * Checks scope indicators per PRD rules
 */
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

/**
 * Checks cohesion indicators per PRD rules
 */
function checkCohesionIndicators(content: string): CohesionIndicators {
  const hasDoD = hasDefinitionOfDone(content);
  const personaMatches = new Set<string>();

  for (const pattern of PERSONA_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      personaMatches.add(matches[0].toLowerCase());
    }
  }

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
