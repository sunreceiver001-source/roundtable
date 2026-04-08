"use client";
import { useState, useRef, useEffect } from "react";
import { callClaude, buildCtx } from "@/lib/api";
import {
  PERSONAS, COLORS, KEEP_ROUNDS,
  RESEARCH_SYSTEM, SUMMARIZE_SYSTEM, FACT_CHECK_SYSTEM, JUDGE_SYSTEM,
} from "@/lib/constants";

// ─── UI helpers ───────────────────────────────────────────────────────────────

function Avatar({ initials, color, size = 36 }) {
  const c = COLORS[color] || COLORS.gray;
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: c.bg, border: `1.5px solid ${c.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.3, fontWeight: 500, color: c.text, flexShrink: 0,
    }}>{initials}</div>
  );
}

function Spinner({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0 12px" }}>
      <div style={{ display: "flex", gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            width: 5, height: 5, borderRadius: "50%", background: "#aaa",
            animation: `pulse 1.1s ease-in-out ${i * 0.18}s infinite`,
          }} />
        ))}
      </div>
      <span style={{ fontSize: 13, color: "#888", fontFamily: "monospace" }}>{label}</span>
    </div>
  );
}

function Message({ msg }) {
  const c_green = COLORS.green;
  if (msg.type === "fact_check") return (
    <div style={{ background: c_green.bg, border: `0.5px solid ${c_green.border}55`, borderRadius: 8, padding: "10px 14px", marginBottom: 10, display: "flex", gap: 10 }}>
      <span style={{ fontSize: 12, color: c_green.badge, flexShrink: 0, fontFamily: "monospace", paddingTop: 2 }}>核查</span>
      <div style={{ fontSize: 13, lineHeight: 1.75, color: c_green.text, whiteSpace: "pre-line" }}>{msg.content}</div>
    </div>
  );

  if (msg.type === "judge") return (
    <div style={{ background: "#f9f9f9", border: "0.5px solid #ddd", borderRadius: 10, padding: "14px 18px", marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 500, color: "#aaa", fontFamily: "monospace", letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>
        Judge · Round {msg.round}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.85, color: "#333", whiteSpace: "pre-line" }}>{msg.content}</div>
    </div>
  );

  if (msg.type === "user") return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
      <div style={{ background: "#f0f0f0", border: "0.5px solid #ddd", borderRadius: "12px 12px 2px 12px", padding: "10px 14px", maxWidth: "72%" }}>
        <div style={{ fontSize: 11, color: "#aaa", marginBottom: 5, fontFamily: "monospace" }}>你</div>
        <div style={{ fontSize: 14, lineHeight: 1.75, color: "#222" }}>{msg.content}</div>
      </div>
    </div>
  );

  const persona = PERSONAS[msg.key];
  const c = COLORS[persona?.color] || COLORS.gray;
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-start" }}>
      <Avatar initials={persona?.initials || "?"} color={persona?.color || "gray"} />
      <div style={{ background: "#fff", border: `0.5px solid ${c.border}44`, borderRadius: "2px 12px 12px 12px", padding: "11px 15px", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: c.text }}>{msg.name}</span>
          <span style={{ fontSize: 11, color: c.badge, background: c.bg, border: `0.5px solid ${c.border}66`, borderRadius: 6, padding: "1px 7px", fontFamily: "monospace" }}>
            {persona?.role}
          </span>
          {msg.key === "munger" && (
            <span style={{ fontSize: 10, color: COLORS.amber.text, background: COLORS.amber.bg, border: `0.5px solid ${COLORS.amber.border}66`, borderRadius: 6, padding: "1px 7px", fontFamily: "monospace", fontWeight: 500 }}>DA</span>
          )}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.8, color: "#222", whiteSpace: "pre-wrap" }}>{msg.content}</div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [topic, setTopic]           = useState("");
  const [hint, setHint]             = useState("");
  const [phase, setPhase]           = useState("setup");
  const [background, setBackground] = useState("");
  const [correction, setCorrection] = useState("");
  const [history, setHistory]       = useState([]);
  const [summary, setSummary]       = useState("");
  const [lastJudge, setLastJudge]   = useState("");
  const [round, setRound]           = useState(1);
  const [canConverge, setCanConverge] = useState(false);
  const [loading, setLoading]       = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [userInput, setUserInput]   = useState("");
  const [error, setError]           = useState("");
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history, loading]);

  // ── helpers ────────────────────────────────────────────────────────────────

  async function rollSummary(hist, prevSummary) {
    const rounds = [...new Set(hist.filter((m) => m.round).map((m) => m.round))].sort((a, b) => a - b);
    if (rounds.length <= KEEP_ROUNDS) return prevSummary;
    const old = hist.filter((m) => m.round && !rounds.slice(-KEEP_ROUNDS).includes(m.round));
    if (!old.length) return prevSummary;
    const text = old.map((m) => `【${m.name || m.type}】${m.content}`).join("\n\n");
    try {
      return await callClaude(SUMMARIZE_SYSTEM, (prevSummary ? `上一期摘要：\n${prevSummary}\n\n` : "") + `新增内容：\n${text}`, 400);
    } catch { return prevSummary; }
  }

  async function factCheck(msgs) {
    const combined = msgs.map((m) => m.content).join("\n");
    if (!combined.includes("🔴") && !combined.includes("需验证")) return null;
    try {
      return await callClaude(FACT_CHECK_SYSTEM, `本轮出现🔴或待验证声明，请核查：
${combined}`, 300);
    } catch { return null; }
  }

  // ── research ───────────────────────────────────────────────────────────────

  async function doResearch() {
    if (!topic.trim() || loading) return;
    setLoading(true); setError(""); setPhase("confirming");
    try {
      const input = hint.trim() ? `议题：${topic}\n\n搜索线索：${hint}` : `议题：${topic}`;
      const text = await callClaude(RESEARCH_SYSTEM, input, 1000);
      setBackground(text);
    } catch (e) {
      setError(e.message); setPhase("setup");
    } finally { setLoading(false); }
  }

  function confirmBg() {
    const bg = correction.trim() ? `${background}\n\n用户补充：${correction}` : background;
    setBackground(bg);
    setPhase("discussing");
    runRound(1, [], "", bg, "");
  }

  // ── round ──────────────────────────────────────────────────────────────────

  async function runRound(roundNum, curHistory, userMsg, bgOverride, lastJudgeOverride) {
    setLoading(true); setError("");
    const bg        = bgOverride        ?? background;
    const judgePrev = lastJudgeOverride ?? lastJudge;
    const isFirst   = !curHistory.some((m) => m.type === "persona");
    const rounds    = [...new Set(curHistory.filter((m) => m.round).map((m) => m.round))].sort((a, b) => a - b);
    const keepR     = rounds.slice(-KEEP_ROUNDS);
    const recent    = curHistory.filter((m) => (m.round && keepR.includes(m.round)) || (!m.round && m.type !== "judge"));

    try {
      // 1. 并行：张小龙 + 张一鸣
      setLoadingMsg("张小龙、张一鸣独立思考中...");
      const ctx = buildCtx({ bg, summary, recent, lastJudge: judgePrev, userMsg, isFirst });
      const [allenText, yimingText] = await Promise.all([
        callClaude(PERSONAS.allen.systemPrompt,  ctx),
        callClaude(PERSONAS.yiming.systemPrompt, ctx),
      ]);
      const t = Date.now();
      const allenMsg  = { id: t+1, type: "persona", key: "allen",  name: "张小龙", content: allenText,  round: roundNum };
      const yimingMsg = { id: t+2, type: "persona", key: "yiming", name: "张一鸣", content: yimingText, round: roundNum };

      // 2. 后置：芒格
      setLoadingMsg("芒格找攻击点...");
      const daCtx = ctx + `\n\n【本轮张小龙】${allenText}\n\n【本轮张一鸣】${yimingText}\n\n识别本轮多数意见并提出DA质疑。`;
      const mungerText = await callClaude(PERSONAS.munger.systemPrompt, daCtx);
      const mungerMsg = { id: t+3, type: "persona", key: "munger", name: "芒格", content: mungerText, round: roundNum };

      let newHistory = [...curHistory, allenMsg, yimingMsg, mungerMsg];

      // 3. 实时事实核查
      setLoadingMsg("核查直觉型论点...");
      const factResult = await factCheck([allenMsg, yimingMsg, mungerMsg]);
      if (factResult) newHistory.push({ id: t+4, type: "fact_check", name: "核查", content: factResult, round: roundNum });

      // 4. Judge 每3轮
      let newLastJudge = judgePrev;
      if (roundNum % 3 === 0) {
        setLoadingMsg("Judge 整理总结...");
        const judgeInput = newHistory
          .filter((m) => m.round && m.round > roundNum - 3)
          .map((m) => `【${m.name || m.type}·R${m.round}】${m.content}`).join("\n\n");
        const judgeText = await callClaude(JUDGE_SYSTEM, `背景：${bg}\n\n近期：\n${judgeInput}`, 500);
        newHistory.push({ id: t+5, type: "judge", name: "Judge", content: judgeText, round: roundNum });
        newLastJudge = judgeText;
        setLastJudge(judgeText);
        if (judgeText.includes("可以收敛")) setCanConverge(true);
      }

      // 5. 滚动摘要
      setLoadingMsg("整理历史...");
      const newSummary = await rollSummary(newHistory, summary);
      if (newSummary !== summary) setSummary(newSummary);

      setHistory(newHistory);
      setRound(roundNum + 1);
    } catch (e) {
      setError(e.message || "调用失败，请重试");
    } finally { setLoading(false); setLoadingMsg(""); }
  }

  async function submitUser() {
    if (!userInput.trim() || loading) return;
    const msg = { id: Date.now(), type: "user", name: "主持人", content: userInput, round };
    const updated = [...history, msg];
    setHistory(updated);
    const input = userInput;
    setUserInput("");
    await runRound(round, updated, input);
  }

  function reset() {
    setPhase("setup"); setHistory([]); setRound(1); setSummary("");
    setLastJudge(""); setCanConverge(false); setBackground("");
    setTopic(""); setHint(""); setCorrection(""); setError("");
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const headerStyle = {
    borderBottom: "0.5px solid #e5e5e5", padding: "11px 20px",
    display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, background: "#fff", zIndex: 10,
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:.25;transform:scale(.85)} 50%{opacity:1;transform:scale(1.15)} }
        * { box-sizing: border-box; }
        textarea, input { font-family: inherit; }
        button { cursor: pointer; border: 0.5px solid #ccc; borderRadius: 8px; padding: 8px 16px; background: #fff; font-size: 14px; }
        button:hover { background: #f5f5f5; }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
      `}</style>

      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontSize: 11, fontFamily: "monospace", letterSpacing: "0.1em", color: "#888", textTransform: "uppercase" }}>Roundtable</span>
        {phase === "discussing" && <>
          <span style={{ color: "#ddd" }}>·</span>
          <span style={{ fontSize: 13, color: "#666", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topic}</span>
          <span style={{ fontSize: 11, fontFamily: "monospace", color: "#aaa" }}>Round {round - 1}</span>
          {summary && <span style={{ fontSize: 10, fontFamily: "monospace", color: "#aaa", background: "#f5f5f5", padding: "2px 6px", borderRadius: 6 }}>摘要已压缩</span>}
          <button onClick={reset} style={{ fontSize: 12, padding: "4px 10px" }}>新话题</button>
        </>}
      </div>

      {/* Setup */}
      {phase === "setup" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
          <div style={{ maxWidth: 560, width: "100%" }}>
            <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 6 }}>圆桌讨论</h1>
            <p style={{ fontSize: 13.5, color: "#666", lineHeight: 1.7, marginBottom: 20 }}>
              独立实例并行 · 自动背景调研 · Judge建议注入 · 滚动摘要 · 实时事实核查
            </p>
            <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
              {Object.entries(PERSONAS).map(([key, p]) => {
                const c = COLORS[p.color];
                return (
                  <div key={key} style={{ flex: 1, padding: "12px 14px", background: "#fff", border: `0.5px solid ${c.border}55`, borderRadius: 12 }}>
                    <Avatar initials={p.initials} color={p.color} size={32} />
                    <div style={{ marginTop: 8, fontSize: 13, fontWeight: 500, color: c.text }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#999", marginTop: 3 }}>{p.role}</div>
                    {key === "munger" && <div style={{ marginTop: 6, fontSize: 10, color: c.text, background: c.bg, border: `0.5px solid ${c.border}55`, borderRadius: 6, padding: "1px 6px", display: "inline-block", fontFamily: "monospace" }}>DA · 后置</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: "#aaa", marginBottom: 6, fontFamily: "monospace" }}>议题</div>
              <textarea value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例如：汽水音乐进入中国市场后会有什么变化？" rows={3}
                style={{ width: "100%", resize: "vertical", border: "0.5px solid #ddd", borderRadius: 8, padding: "10px 12px", fontSize: 14, lineHeight: 1.6, outline: "none" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#aaa", marginBottom: 6, fontFamily: "monospace" }}>搜索线索 <span style={{ fontWeight: 400 }}>（可选）</span></div>
              <textarea value={hint} onChange={(e) => setHint(e.target.value)} placeholder="帮助定向搜索的关键词，例如：汽水音乐、独立音乐平台…" rows={2}
                style={{ width: "100%", resize: "vertical", border: "0.5px solid #ddd", borderRadius: 8, padding: "10px 12px", fontSize: 14, lineHeight: 1.6, outline: "none" }} />
            </div>
            {error && <div style={{ fontSize: 13, color: "#c00", marginBottom: 12 }}>{error}</div>}
            <button onClick={doResearch} disabled={!topic.trim() || loading} style={{ background: "#111", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14 }}>
              {loading ? "调研中..." : "开始调研 →"}
            </button>
          </div>
        </div>
      )}

      {/* Confirming */}
      {phase === "confirming" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
          <div style={{ maxWidth: 560, width: "100%" }}>
            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#aaa", marginBottom: 16, letterSpacing: "0.08em", textTransform: "uppercase" }}>Step 0 · 背景调研结果</div>
            {loading ? <Spinner label="正在搜索背景信息..." /> : <>
              <div style={{ background: "#f9f9f9", border: "0.5px solid #ddd", borderRadius: 10, padding: "16px 18px", marginBottom: 16, fontSize: 14, lineHeight: 1.85, color: "#333", whiteSpace: "pre-line" }}>
                {background}
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 6, fontFamily: "monospace" }}>补充或纠正（可选）</div>
                <textarea value={correction} onChange={(e) => setCorrection(e.target.value)} placeholder="如有误解或遗漏，在此补充…" rows={2}
                  style={{ width: "100%", resize: "vertical", border: "0.5px solid #ddd", borderRadius: 8, padding: "10px 12px", fontSize: 14, lineHeight: 1.6, outline: "none" }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={confirmBg} style={{ background: "#111", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 14 }}>确认，开始讨论 ↗</button>
                <button onClick={() => setPhase("setup")}>← 返回修改</button>
              </div>
            </>}
          </div>
        </div>
      )}

      {/* Discussing */}
      {phase === "discussing" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px", maxWidth: 760, width: "100%", margin: "0 auto" }}>
            {summary && (
              <details style={{ marginBottom: 16, background: "#f9f9f9", border: "0.5px solid #e5e5e5", borderRadius: 8, padding: "10px 14px" }}>
                <summary style={{ fontSize: 12, color: "#aaa", cursor: "pointer", fontFamily: "monospace" }}>早期轮次摘要（已压缩，展开查看）</summary>
                <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.8, color: "#666", whiteSpace: "pre-line" }}>{summary}</div>
              </details>
            )}
            {history.map((msg) => <Message key={msg.id} msg={msg} />)}
            {loading && <Spinner label={loadingMsg} />}
            {error && <div style={{ fontSize: 13, color: "#c00", background: "#fff0f0", border: "0.5px solid #fcc", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>{error}</div>}
            <div ref={bottomRef} />
          </div>
          <div style={{ borderTop: "0.5px solid #e5e5e5", padding: "12px 20px", display: "flex", gap: 10, maxWidth: 760, width: "100%", margin: "0 auto" }}>
            <input value={userInput} onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submitUser()}
              placeholder="发表观点或追问，或直接「继续」" disabled={loading}
              style={{ flex: 1, border: "0.5px solid #ddd", borderRadius: 8, padding: "9px 12px", fontSize: 14, outline: "none" }}
            />
            {userInput.trim()
              ? <button onClick={submitUser} disabled={loading} style={{ background: "#111", color: "#fff", border: "none", borderRadius: 8 }}>发言 ↗</button>
              : <button onClick={() => runRound(round, history, "")} disabled={loading}>继续 →</button>
            }
            {canConverge && !loading && (
              <button onClick={() => setPhase("done")} style={{ background: "#f0faf5", color: "#0a5", border: "0.5px solid #0a5" }}>收尾 ✓</button>
            )}
          </div>
        </>
      )}

      {/* Done */}
      {phase === "done" && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px" }}>
          <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 500, marginBottom: 10 }}>讨论已收敛</div>
            <div style={{ fontSize: 14, color: "#666", lineHeight: 1.7, marginBottom: 24 }}>Judge 判断讨论已充分，可以总结结论。</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setPhase("discussing")}>继续讨论</button>
              <button onClick={reset} style={{ background: "#111", color: "#fff", border: "none", borderRadius: 8 }}>新话题</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
