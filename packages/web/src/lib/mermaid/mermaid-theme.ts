/**
 * Mermaid theme variables for 'base' theme.
 * With theme:'base', mermaid uses ONLY these variables — no derived colors.
 * Every text-related variable is explicitly set to light colors for our dark UI.
 */
export const mermaidThemeVariables = {
  // Background
  darkMode: true,
  background: 'transparent',
  mainBkg: '#1e3a5f',
  secondBkg: '#1a2740',
  tertiaryColor: '#2a1f35',

  // Text — every text variable explicitly light
  primaryTextColor: '#e2e8f0',
  secondaryTextColor: '#a0aec0',
  tertiaryTextColor: '#a0aec0',
  textColor: '#e2e8f0',

  // Borders & lines
  primaryBorderColor: '#3b82f6',
  secondaryBorderColor: '#22d3ee',
  border1: '#475569',
  border2: '#334155',
  lineColor: '#64748b',

  // Accents
  primaryColor: '#1e3a5f',
  secondaryColor: '#1a3a2a',

  // Node colors
  nodeBorder: '#3b82f6',
  nodeTextColor: '#e2e8f0',
  clusterBkg: '#0f172a',
  clusterBorder: '#475569',
  titleColor: '#93c5fd',
  defaultLinkColor: '#94a3b8',

  // State diagram
  labelColor: '#e2e8f0',
  altBackground: '#1a2740',
  compositeBackground: '#1a2740',
  compositeTitleBackground: '#1e3a5f',
  compositeBorder: '#475569',
  stateLabelColor: '#e2e8f0',
  stateBkg: '#1e3a5f',

  // Class diagram
  classText: '#e2e8f0',

  // Gantt
  taskTextColor: '#e2e8f0',
  taskTextDarkColor: '#e2e8f0',
  sectionBkgColor: '#1e3a5f',
  sectionBkgColor2: '#1a2740',

  // Notes — light background with dark text for readability
  noteBkgColor: '#f0f4f8',
  noteTextColor: '#1e293b',
  noteBorderColor: '#fbbf24',

  // Sequence diagram — all text explicitly white
  actorBkg: '#1e3a5f',
  actorBorder: '#3b82f6',
  actorTextColor: '#e2e8f0',
  actorLineColor: '#64748b',
  signalColor: '#94a3b8',
  signalTextColor: '#e2e8f0',
  labelBoxBkgColor: '#1e293b',
  labelBoxBorderColor: '#475569',
  labelTextColor: '#e2e8f0',
  loopTextColor: '#93c5fd',
  activationBorderColor: '#3b82f6',
  activationBkgColor: '#1e3a5f',
  sequenceNumberColor: '#e2e8f0',

  // Flowchart
  edgeLabelBackground: '#1e293b',

  // Pie chart
  pie1: '#3b82f6',
  pie2: '#22c55e',
  pie3: '#eab308',
  pie4: '#ef4444',
  pie5: '#a855f7',
  pie6: '#06b6d4',
  pie7: '#f97316',
  pieTitleTextColor: '#e2e8f0',
  pieSectionTextColor: '#e2e8f0',
  pieLegendTextColor: '#e2e8f0',
  pieStrokeColor: '#475569',

  // ER diagram
  attributeBackgroundColorOdd: '#1e3a5f',
  attributeBackgroundColorEven: '#1a2740',

  // Fonts
  fontSize: '14px',
};
