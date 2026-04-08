const DEEPSEEK_API = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

let inflight = 0;
const MAX_INFLIGHT = 2;
const queue = [];

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    drain();
  });
}

function drain() {
  while (inflight < MAX_INFLIGHT && queue.length > 0) {
    const { fn, resolve, reject } = queue.shift();
    inflight++;
    fn().then(resolve).catch(reject).finally(() => { inflight--; drain(); });
  }
}

async function callWithRetry(system, userContent, maxTokens, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(DEEPSEEK_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: system },
            { role: "user",   content: userContent },
          ],
        }),
      });
      if (res.status === 429 || res.status === 503) {
        if (i < retries - 1) { await new Promise(r => setTimeout(r, 2000 * (i+1))); continue; }
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return data.choices?.[0]?.message?.content || "";
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1500 * (i+1)));
    }
  }
}

export async function POST(req) {
  try {
    const { system, userContent, maxTokens = 800 } = await req.json();
    if (!system || !userContent) return Response.json({ error: "Missing params" }, { status: 400 });
    const text = await enqueue(() => callWithRetry(system, userContent, maxTokens));
    return Response.json({ text });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message || "API error" }, { status: 500 });
  }
}
