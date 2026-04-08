export async function callClaude(system, userContent, maxTokens = 800) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, userContent, maxTokens }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text;
}

export function buildCtx({ bg, summary, recent, lastJudge, userMsg, isFirst }) {
  const parts = [`【背景简报】\n${bg}`];
  if (summary) parts.push(`【历史摘要（早期轮次）】\n${summary}`);
  if (recent.length) {
    const lines = recent.map((m) => {
      if (m.type === "user")  return `【主持人】${m.content}`;
      if (m.type === "judge") return `【Judge总结】${m.content}`;
      return `【${m.name}】${m.content}`;
    }).join("\n\n");
    parts.push(`【近期发言】\n${lines}`);
  }
  if (lastJudge) parts.push(`【Judge上轮建议】\n${lastJudge}`);
  if (userMsg)   parts.push(`【主持人最新发言（优先回应）】\n${userMsg}`);
  parts.push(
    isFirst
      ? "第一轮讨论，请发表初始立场和核心观点。"
      : "继续讨论，回应Judge建议方向，必要时直接反驳对方。"
  );
  return parts.join("\n\n");
}
