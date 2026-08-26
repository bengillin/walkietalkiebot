const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"];
const RANK = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100
};
function isLogLevel(value) {
  return typeof value === "string" && LOG_LEVELS.includes(value);
}
function resolveLevel() {
  const fromEnv = process.env.WTB_LOG_LEVEL?.toLowerCase();
  return isLogLevel(fromEnv) ? fromEnv : "info";
}
let currentLevel = resolveLevel();
function getLogLevel() {
  return currentLevel;
}
function setLogLevel(level) {
  currentLevel = level;
}
function _reloadLogLevel() {
  currentLevel = resolveLevel();
}
function createLogger(scope) {
  const tag = `[${scope}]`;
  const at = (level, method) => (...args) => {
    if (RANK[level] < RANK[currentLevel]) return;
    console[method](tag, ...args);
  };
  return {
    debug: at("debug", "log"),
    info: at("info", "log"),
    warn: at("warn", "warn"),
    error: at("error", "error")
  };
}
export {
  LOG_LEVELS,
  _reloadLogLevel,
  createLogger,
  getLogLevel,
  setLogLevel
};
