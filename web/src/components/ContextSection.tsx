import type { ReactElement } from 'react';
import type { StoryContext } from '../types';

interface ContextSectionProps {
  context: StoryContext;
  headingLevel?: 'h4' | 'h5';
}

interface ContextGroupProps {
  title: string;
  entries: Record<string, string>;
  headingLevel: 'h4' | 'h5';
  badge?: 'suggestion' | 'requirement';
}

function ContextGroup({ title, entries, headingLevel, badge }: ContextGroupProps): ReactElement | null {
  if (!entries) return null;

  const Heading = headingLevel;

  // Handle case where entries is a string instead of Record<string, string>
  if (typeof entries === 'string') {
    return (
      <div className="context-group">
        <Heading>
          {title}
          {badge && <span className={`context-badge ${badge}`}>{badge}</span>}
        </Heading>
        <div className="context-item">
          <pre className="context-item-content">{entries}</pre>
        </div>
      </div>
    );
  }

  // Ensure it's actually an object before calling Object.keys
  if (typeof entries !== 'object' || Object.keys(entries).length === 0) return null;

  return (
    <div className="context-group">
      <Heading>
        {title}
        {badge && <span className={`context-badge ${badge}`}>{badge}</span>}
      </Heading>
      {Object.entries(entries).map(([name, content]) => (
        <div key={name} className="context-item">
          <div className="context-item-name">{name}</div>
          <pre className="context-item-content">{typeof content === 'string' ? content : JSON.stringify(content, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}

interface ReferencesGroupProps {
  references: string[];
  headingLevel: 'h4' | 'h5';
}

function ReferencesGroup({ references, headingLevel }: ReferencesGroupProps): ReactElement {
  const Heading = headingLevel;

  return (
    <div className="context-group">
      <Heading>References</Heading>
      <ul className="drawer-list code">
        {references.map((ref, idx) => (
          <li key={idx}><code>{ref}</code></li>
        ))}
      </ul>
    </div>
  );
}

export function ContextSection({ context, headingLevel = 'h5' }: ContextSectionProps): ReactElement | null {
  // Check for new nested format
  const hasNewFormat = context.suggestions || context.requirements;

  // Check for legacy flat format
  const hasLegacyFormat =
    (context.schemas && Object.keys(context.schemas).length > 0) ||
    (context.prompts && Object.keys(context.prompts).length > 0) ||
    (context.dataContracts && Object.keys(context.dataContracts).length > 0) ||
    (context.examples && Object.keys(context.examples).length > 0) ||
    (context.references && context.references.length > 0);

  if (!hasNewFormat && !hasLegacyFormat) return null;

  return (
    <div className="drawer-context">
      {/* New nested format */}
      {context.requirements?.apiContracts && (
        <ContextGroup
          title="API Contracts"
          entries={context.requirements.apiContracts}
          headingLevel={headingLevel}
          badge="requirement"
        />
      )}
      {context.suggestions?.schemas && (
        <ContextGroup
          title="Schemas"
          entries={context.suggestions.schemas}
          headingLevel={headingLevel}
          badge="suggestion"
        />
      )}
      {context.suggestions?.prompts && (
        <ContextGroup
          title="Prompts"
          entries={context.suggestions.prompts}
          headingLevel={headingLevel}
          badge="suggestion"
        />
      )}
      {context.suggestions?.examples && (
        <ContextGroup
          title="Examples"
          entries={context.suggestions.examples}
          headingLevel={headingLevel}
          badge="suggestion"
        />
      )}
      {context.suggestions?.patterns && (
        <ContextGroup
          title="Patterns"
          entries={context.suggestions.patterns}
          headingLevel={headingLevel}
          badge="suggestion"
        />
      )}

      {/* Legacy flat format */}
      {context.schemas && !context.suggestions?.schemas && (
        <ContextGroup title="Schemas" entries={context.schemas} headingLevel={headingLevel} />
      )}
      {context.prompts && !context.suggestions?.prompts && (
        <ContextGroup title="Prompts" entries={context.prompts} headingLevel={headingLevel} />
      )}
      {context.dataContracts && (
        <ContextGroup
          title="Data Contracts"
          entries={context.dataContracts}
          headingLevel={headingLevel}
          badge="requirement"
        />
      )}
      {context.examples && !context.suggestions?.examples && (
        <ContextGroup title="Examples" entries={context.examples} headingLevel={headingLevel} />
      )}
      {context.references && context.references.length > 0 && (
        <ReferencesGroup references={context.references} headingLevel={headingLevel} />
      )}
    </div>
  );
}
