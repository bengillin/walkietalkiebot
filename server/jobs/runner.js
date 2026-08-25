import { spawn, execFileSync } from "child_process";
import { writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { buildPrompt } from "../promptBuilder.js";
import { getMode } from "../modes.js";
function detectPlanFromTool(toolName, input) {
  if (toolName !== "Write" && toolName !== "Edit") return null;
  const filePath = input.file_path || "";
  const content = input.content || input.new_string || "";
  if (!content || content.length < 100) return null;
  const isPlanFile = /plan/i.test(filePath);
  const headingCount = (content.match(/^#{1,3}\s+.+/gm) || []).length;
  const listItemCount = (content.match(/^(?:\d+\.|[-*])\s+/gm) || []).length;
  const hasPlanHeading = /^#{1,3}\s+.*(?:plan|implementation|approach|strategy|roadmap|phases?|proposal)/im.test(content);
  const hasStructure = headingCount >= 2 && listItemCount >= 4;
  if (!isPlanFile && !hasPlanHeading && !hasStructure) return null;
  let title = "Untitled Plan";
  const titleMatch = content.match(
    /^#{1,3}\s+(.*(?:plan|implementation|approach|strategy|roadmap|phases?|proposal).*)/im
  );
  if (titleMatch) {
    title = titleMatch[1].replace(/\*\*/g, "").replace(/`/g, "").trim();
  } else {
    const firstHeading = content.match(/^#{1,3}\s+(.+)/m);
    if (firstHeading) {
      title = firstHeading[1].replace(/\*\*/g, "").replace(/`/g, "").trim();
    }
  }
  if (title.length > 100) title = title.slice(0, 97) + "...";
  return { title, content };
}
let claudeCliCache = null;
function isClaudeCliAvailable() {
  if (claudeCliCache && Date.now() - claudeCliCache.checkedAt < 6e4) {
    return claudeCliCache.available;
  }
  const claudePath = process.env.CLAUDE_PATH || "claude";
  try {
    execFileSync("which", [claudePath], { stdio: "ignore" });
    claudeCliCache = { available: true, checkedAt: Date.now() };
    return true;
  } catch {
    claudeCliCache = { available: false, checkedAt: Date.now() };
    return false;
  }
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_NOT_FOUND = "No conversation found with session ID";
const SESSION_IN_USE = "is already in use";
const establishedSessions = /* @__PURE__ */ new Set();
function _resetSessionTracking() {
  establishedSessions.clear();
}
function spawnClaude(options) {
  const { prompt, history, images, rawMode, mode: modeName, conversationId, callbacks } = options;
  if (!isClaudeCliAvailable()) {
    const promise2 = Promise.resolve(1);
    setTimeout(() => {
      callbacks.onError(
        "Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code"
      );
      callbacks.onComplete(1);
    }, 0);
    return { pid: 0, kill: () => {
    }, promise: promise2 };
  }
  const tempImagePaths = [];
  if (images && images.length > 0) {
    const tempDir = join(tmpdir(), "wtb-images");
    mkdirSync(tempDir, { recursive: true });
    for (const img of images) {
      const base64Data = img.dataUrl.split(",")[1];
      if (!base64Data) continue;
      const ext = img.fileName.split(".").pop() || "png";
      const tempPath = join(tempDir, `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
      writeFileSync(tempPath, Buffer.from(base64Data, "base64"));
      tempImagePaths.push(tempPath);
    }
  }
  const imagePaths = tempImagePaths.length > 0 ? tempImagePaths : void 0;
  const mode = rawMode ? null : getMode(modeName || "voice");
  const buildFullPrompt = (includeHistory) => {
    if (rawMode) {
      const imageBlock = tempImagePaths.length > 0 ? "Read these image files and then follow the instructions below:\n" + tempImagePaths.join("\n") + "\n\n" : "";
      return `${imageBlock}${prompt}`;
    }
    return buildPrompt({
      message: prompt,
      mode,
      history: includeHistory ? history : void 0,
      imagePaths
    });
  };
  const claudePath = process.env.CLAUDE_PATH || "claude";
  const env = { ...process.env, FORCE_COLOR: "0" };
  delete env.CLAUDECODE;
  const baseArgs = [
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "bypassPermissions"
  ];
  let cleaned = false;
  const cleanupTempFiles = () => {
    if (cleaned) return;
    cleaned = true;
    for (const p of tempImagePaths) {
      try {
        unlinkSync(p);
      } catch {
      }
    }
  };
  const useSession = !rawMode && !!conversationId && UUID_RE.test(conversationId);
  if (!useSession) {
    const args = ["-p", buildFullPrompt(true), ...baseArgs, "--no-session-persistence"];
    console.log(
      "Spawning claude:",
      claudePath,
      "len",
      args[1].length,
      rawMode ? "(raw)" : "(voice)"
    );
    const proc = runClaudeProcess(claudePath, args, env, {
      ...callbacks,
      onComplete: (code) => {
        cleanupTempFiles();
        callbacks.onComplete(code);
      }
    });
    return {
      pid: proc.child.pid || 0,
      kill: () => {
        try {
          proc.child.kill("SIGTERM");
        } catch {
        }
      },
      promise: proc.promise
    };
  }
  const convId = conversationId;
  let resolveFinal;
  const promise = new Promise((res) => {
    resolveFinal = res;
  });
  let current;
  const launch = (strategy, isRetry) => {
    const sessionArgs = strategy === "create" ? ["--session-id", convId] : ["--resume", convId];
    const args = ["-p", buildFullPrompt(strategy === "create"), ...baseArgs, ...sessionArgs];
    console.log(
      "Spawning claude:",
      claudePath,
      `(session ${strategy}${isRetry ? " retry" : ""})`,
      "len",
      args[1].length
    );
    let sawContent = false;
    let sessionFault = false;
    current = runClaudeProcess(claudePath, args, env, {
      onText: (t) => {
        sawContent = true;
        callbacks.onText(t);
      },
      onActivity: (a) => {
        if (a.type === "tool_start" || a.type === "tool_input" || a.type === "tool_end") {
          sawContent = true;
        }
        if (sessionFault && !sawContent && a.type === "all_complete") return;
        callbacks.onActivity(a);
      },
      onPlan: callbacks.onPlan,
      onError: (msg) => {
        if (!sawContent && (msg.includes(SESSION_NOT_FOUND) || msg.includes(SESSION_IN_USE))) {
          sessionFault = true;
          return;
        }
        callbacks.onError(msg);
      },
      onComplete: (code) => {
        if (sessionFault && !sawContent && !isRetry) {
          launch(strategy === "create" ? "resume" : "create", true);
          return;
        }
        if (code === 0) establishedSessions.add(convId);
        else if (sessionFault) establishedSessions.delete(convId);
        cleanupTempFiles();
        callbacks.onComplete(code);
        resolveFinal(code);
      }
    });
  };
  launch(establishedSessions.has(convId) ? "resume" : "create", false);
  return {
    pid: current.child.pid || 0,
    kill: () => {
      try {
        current?.child.kill("SIGTERM");
      } catch {
      }
    },
    promise
  };
}
function runClaudeProcess(claudePath, args, env, callbacks) {
  const claude = spawn(claudePath, args, {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false
  });
  let buffer = "";
  const toolInputs = {};
  const toolNames = {};
  let currentToolId = null;
  claude.stdout.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type === "assistant") {
          const textContent = event.message?.content?.find(
            (c) => c.type === "text"
          );
          if (textContent?.text) {
            const text = textContent.text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, "");
            if (text.trim()) {
              callbacks.onText(text);
            }
          }
          const toolUseBlocks = event.message?.content?.filter((c) => c.type === "tool_use") || [];
          for (const toolBlock of toolUseBlocks) {
            if (toolBlock.id && toolBlock.input) {
              toolInputs[toolBlock.id] = JSON.stringify(toolBlock.input);
            }
            let inputDetail = "";
            if (toolBlock.input) {
              if (toolBlock.input.file_path) inputDetail = toolBlock.input.file_path;
              else if (toolBlock.input.command) inputDetail = toolBlock.input.command;
              else if (toolBlock.input.pattern) inputDetail = toolBlock.input.pattern;
            }
            callbacks.onActivity({
              type: "tool_start",
              tool: toolBlock.name,
              id: toolBlock.id,
              input: inputDetail
            });
            if (callbacks.onPlan && toolBlock.input) {
              const plan = detectPlanFromTool(toolBlock.name, toolBlock.input);
              if (plan) callbacks.onPlan(plan);
            }
          }
        } else if (event.type === "content_block_start") {
          if (event.content_block?.type === "tool_use") {
            currentToolId = event.content_block.id;
            toolInputs[currentToolId] = "";
            toolNames[currentToolId] = event.content_block.name;
            callbacks.onActivity({
              type: "tool_start",
              tool: event.content_block.name,
              id: event.content_block.id
            });
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta?.type === "text_delta" && event.delta?.text) {
            const text = event.delta.text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, "");
            if (text) {
              callbacks.onText(text);
            }
          } else if (event.delta?.type === "input_json_delta" && currentToolId) {
            toolInputs[currentToolId] = (toolInputs[currentToolId] || "") + event.delta.partial_json;
          }
        } else if (event.type === "content_block_stop" && currentToolId) {
          try {
            const inputJson = toolInputs[currentToolId];
            if (inputJson) {
              const input = JSON.parse(inputJson);
              let inputDetail = "";
              if (input.file_path) inputDetail = input.file_path;
              else if (input.command) inputDetail = input.command;
              else if (input.pattern) inputDetail = input.pattern;
              if (inputDetail) {
                callbacks.onActivity({
                  type: "tool_input",
                  id: currentToolId,
                  input: inputDetail
                });
              }
              if (callbacks.onPlan) {
                const toolName = toolNames[currentToolId] || "";
                const plan = detectPlanFromTool(toolName, input);
                if (plan) callbacks.onPlan(plan);
              }
            }
          } catch {
          }
          currentToolId = null;
        } else if (event.type === "result") {
          const subtype = event.subtype || "complete";
          callbacks.onActivity({
            type: "all_complete",
            status: subtype === "error" ? "error" : "complete"
          });
        } else if (event.type === "user") {
          const toolResults = event.message?.content?.filter((c) => c.type === "tool_result") || [];
          for (const result of toolResults) {
            const toolId = result.tool_use_id;
            const toolName = toolNames[toolId] || "tool";
            const isError = result.is_error === true;
            let output = "";
            if (typeof result.content === "string") {
              output = result.content.slice(0, 200);
            } else if (Array.isArray(result.content)) {
              const textContent = result.content.find((c) => c.type === "text");
              output = textContent?.text?.slice(0, 200) || "";
            }
            callbacks.onActivity({
              type: "tool_end",
              tool: toolName,
              id: toolId,
              status: isError ? "error" : "complete",
              output
            });
          }
        }
      } catch (e) {
        console.log("Parse error for line:", line.slice(0, 100));
      }
    }
  });
  claude.stderr.on("data", (data) => {
    const text = data.toString();
    console.error("Claude stderr:", text);
    callbacks.onError(text);
  });
  const promise = new Promise((resolve) => {
    claude.on("close", (code) => {
      callbacks.onComplete(code || 0);
      resolve(code || 0);
    });
    claude.on("error", (err) => {
      callbacks.onError(err.message);
      callbacks.onComplete(1);
      resolve(1);
    });
  });
  return { child: claude, promise };
}
export {
  _resetSessionTracking,
  isClaudeCliAvailable,
  spawnClaude
};
