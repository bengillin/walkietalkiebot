import { spawn } from "child_process";
function spawnClaude(options) {
  const { prompt, history, callbacks } = options;
  const recentMessages = (history || []).slice(-10);
  let contextBlock = "";
  if (recentMessages.length > 0) {
    contextBlock = "[Recent conversation]\n" + recentMessages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n") + "\n[/Recent conversation]\n\n";
  }
  const voiceMessage = `${contextBlock}[VOICE MODE - Keep responses to 1-2 sentences, no markdown, speak naturally]

User: ${prompt}`;
  const args = [
    "-p",
    voiceMessage,
    "--output-format",
    "stream-json",
    "--verbose",
    "--permission-mode",
    "bypassPermissions",
    "--no-session-persistence"
  ];
  const claudePath = process.env.CLAUDE_PATH || "claude";
  console.log("Spawning claude:", claudePath, "prompt length:", voiceMessage.length);
  const env = { ...process.env, FORCE_COLOR: "0" };
  delete env.CLAUDECODE;
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
          const textContent = event.message?.content?.find((c) => c.type === "text");
          if (textContent?.text) {
            let text = textContent.text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, "");
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
            let text = event.delta.text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, "");
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
  return {
    pid: claude.pid || 0,
    kill: () => {
      try {
        claude.kill("SIGTERM");
      } catch {
      }
    },
    promise
  };
}
export {
  spawnClaude
};
