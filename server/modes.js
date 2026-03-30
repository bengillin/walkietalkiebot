const BUILT_IN_MODES = [
  {
    name: "voice",
    label: "Voice",
    description: "Brief, spoken responses",
    icon: "\u{1F399}\uFE0F",
    instruction: "Keep responses to 1-2 sentences, no markdown, speak naturally. Be direct and concise \u2014 your responses are spoken aloud.",
    planDetection: false
  },
  {
    name: "pair",
    label: "Pair",
    description: "Collaborative coding partner",
    icon: "\u{1F465}",
    instruction: "You are a pair programming partner. Think out loud about your approach. Ask clarifying questions before making big changes. Explain your reasoning as you go. Use markdown for code blocks.",
    planDetection: false
  },
  {
    name: "architect",
    label: "Architect",
    description: "Systems thinking and trade-offs",
    icon: "\u{1F3D7}\uFE0F",
    instruction: "Think in systems. Consider trade-offs, scalability, and maintainability. Ask clarifying questions before proposing solutions. Use structured output with headers and lists. Be thorough \u2014 detail matters more than brevity.",
    planDetection: true
  },
  {
    name: "code-review",
    label: "Code Review",
    description: "Thorough code analysis",
    icon: "\u{1F50D}",
    instruction: "Review code for bugs, security issues, performance problems, and style. Be specific \u2014 reference file paths and line numbers. Categorize findings by severity. Suggest concrete fixes, not vague improvements.",
    planDetection: false
  },
  {
    name: "debug",
    label: "Debug",
    description: "Systematic problem diagnosis",
    icon: "\u{1F41B}",
    instruction: "Diagnose problems step by step. Read error messages and logs carefully. Form hypotheses and test them. Don't guess \u2014 verify. Ask for specific information when needed. Suggest targeted fixes with clear reasoning.",
    planDetection: false
  }
];
function getModes() {
  return BUILT_IN_MODES;
}
function getMode(name) {
  return BUILT_IN_MODES.find((m) => m.name === name) || BUILT_IN_MODES[0];
}
function getModeInfoList() {
  return BUILT_IN_MODES.map(({ name, label, description, icon }) => ({ name, label, description, icon }));
}
export {
  getMode,
  getModeInfoList,
  getModes
};
