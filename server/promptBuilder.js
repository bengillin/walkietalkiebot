function buildPrompt(input) {
  const { message, mode, history, imagePaths } = input;
  const blocks = [];
  if (history && history.length > 0) {
    const recent = history.slice(-10);
    blocks.push(
      "[Recent conversation]\n" + recent.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n") + "\n[/Recent conversation]"
    );
  }
  if (imagePaths && imagePaths.length > 0) {
    blocks.push(
      "[Attached Images - Use the Read tool to view these image files]\n" + imagePaths.join("\n") + "\n[/Attached Images]"
    );
  }
  blocks.push(`[MODE: ${mode.label}]
${mode.instruction}
[/MODE]`);
  if (mode.planDetection) {
    blocks.push(
      "[PLAN OUTPUT - If you produce a detailed plan, write it to /tmp/wtb-plan.md using the Write tool, then give a brief summary of what you planned.]"
    );
  }
  blocks.push(`User: ${message}`);
  return blocks.join("\n\n");
}
export {
  buildPrompt
};
