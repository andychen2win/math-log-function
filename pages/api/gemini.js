// 这个文件运行在服务端，绝对安全
// 它负责中转前端的请求，附带上 API Key 发送给 Google

export const config = {
    runtime: 'edge', // 使用 Edge Runtime 获得更快的冷启动速度
};

export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    try {
        // 1. 从环境变量获取 Key (Zeabur 后台配置的变量)
        const apiKey = process.env.GEMINI_API_KEY; // 注意：Zeabur 变量名最好用 GEMINI_API_KEY

        if (!apiKey) {
            return new Response(JSON.stringify({ error: '服务端未配置 GEMINI_API_KEY' }), { status: 500 });
        }

        // 2. 解析前端发来的数据
        const { mode, prompt, systemInstruction, history } = await req.json();

        let url = "";
        let body = {};

        // 3. 根据前端请求的模式，组装 Google API 请求
        // ✅ 修改：忠于原代码，使用 gemini-3-pro-preview 模型
        const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview";

        if (mode === 'stream') {
            // 流式对话模式
            url = `${baseUrl}:streamGenerateContent?alt=sse&key=${apiKey}`;
            body = {
                contents: history.map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.text }]
                })),
                systemInstruction: { parts: [{ text: systemInstruction || "" }] },
                // ✅ 忠于原代码：流式模式使用 low thinking
                generationConfig: { thinkingConfig: { thinkingLevel: "low" } }
            };
        } else if (mode === 'json') {
            // JSON 生成模式 (用于出题)
            url = `${baseUrl}:generateContent?key=${apiKey}`;
            body = {
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: systemInstruction || "" }] },
                // ✅ 忠于原代码：JSON 模式使用 low thinking，并指定 MIME Type
                generationConfig: {
                    responseMimeType: "application/json",
                    thinkingConfig: { thinkingLevel: "low" }
                }
            };
        } else {
            // 普通文本模式 (用于解释概念)
            url = `${baseUrl}:generateContent?key=${apiKey}`;
            body = {
                contents: [{ parts: [{ text: prompt }] }],
                systemInstruction: { parts: [{ text: systemInstruction || "" }] },
                // ✅ 忠于原代码：普通教学模式使用 high thinking 以获得最强数学推理能力
                generationConfig: { thinkingConfig: { thinkingLevel: "high" } }
            };
        }

        // 4. 向 Google 发起请求
        const googleRes = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!googleRes.ok) {
            const errorText = await googleRes.text();
            return new Response(JSON.stringify({ error: `Google API Error: ${googleRes.status}`, details: errorText }), { status: googleRes.status });
        }

        // 5. 如果是流式请求，直接透传数据流；否则返回 JSON
        if (mode === 'stream') {
            return new Response(googleRes.body, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive',
                },
            });
        } else {
            const data = await googleRes.json();
            return new Response(JSON.stringify(data), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}