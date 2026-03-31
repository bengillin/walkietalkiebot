import { existsSync, readdirSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
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
const MODES_DIR = join(homedir(), ".wtb", "modes");
function loadCustomModes() {
  if (!existsSync(MODES_DIR)) return [];
  const modes = [];
  let files;
  try {
    files = readdirSync(MODES_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  for (const file of files) {
    try {
      const content = readFileSync(join(MODES_DIR, file), "utf-8");
      const mode = JSON.parse(content);
      if (mode.name && mode.label && mode.instruction) {
        modes.push({
          name: mode.name,
          label: mode.label,
          description: mode.description || "",
          icon: mode.icon || "\u2699\uFE0F",
          instruction: mode.instruction,
          planDetection: mode.planDetection ?? false
        });
      } else {
        console.warn(`Skipping mode ${file}: missing required fields (name, label, instruction)`);
      }
    } catch (err) {
      console.warn(`Failed to load mode ${file}:`, err);
    }
  }
  return modes;
}
let cachedModes = null;
function getAllModes() {
  if (!cachedModes) {
    const custom = loadCustomModes();
    const customNames = new Set(custom.map((m) => m.name));
    cachedModes = [
      ...BUILT_IN_MODES.filter((m) => !customNames.has(m.name)),
      ...custom
    ];
  }
  return cachedModes;
}
function getModes() {
  return getAllModes();
}
function getMode(name) {
  return getAllModes().find((m) => m.name === name) || BUILT_IN_MODES[0];
}
function getModeInfoList() {
  return getAllModes().map(({ name, label, description, icon }) => ({ name, label, description, icon }));
}
function reloadModes() {
  cachedModes = null;
}
export {
  getMode,
  getModeInfoList,
  getModes,
  reloadModes
};
