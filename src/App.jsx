import React, { useState, useEffect, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { BookOpen, Activity, TrendingUp, CheckCircle, ChevronRight, ChevronLeft, Calculator, Sparkles, MessageSquare, Send, Loader2, Bot, Menu, X } from 'lucide-react';

// --- 配置部分 ---
// 【重要提示】：
// 1. 在当前的在线预览环境中，apiKey 必须保持为空字符串 ""，环境会自动处理。
// 2. 当你将此代码复制到本地 Vite 项目或部署到 Vercel 时，请注释掉 const apiKey = ""; 
//    并取消注释下面这一行，以便读取 .env 文件中的密钥：
// const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
// 优先读取环境变量，如果没有则为空（但在Vercel上我们会设置环境变量）
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

// --- 通用工具函数 ---
const callGemini = async (prompt, systemInstruction = "") => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          // Gemini 3.0 建议：
          // 1. 使用 thinkingLevel: "high" (默认值) 来获得最强的推理能力，特别适合数学辅导。
          // 2. 保持 temperature 为默认值 (1.0)，不要随意降低，以免破坏推理链。
          generationConfig: {
            thinkingConfig: { thinkingLevel: "high" }
          }
        }),
      }
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error("Gemini API call failed:", error);
    return null;
  }
};

const callGeminiJson = async (prompt, systemInstruction = "") => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: "application/json",
            thinkingConfig: { thinkingLevel: "low" }
          }
        }),
      }
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text);
  } catch (error) {
    console.error("Gemini API JSON call failed:", error);
    return null;
  }
};

const callGeminiStream = async (prompt, systemInstruction = "", onChunk) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            thinkingConfig: { thinkingLevel: "low" }
          }
        }),
      }
    );

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      let lines = buffer.split("\n");
      buffer = lines.pop(); // Keep the last incomplete line in the buffer

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("data: ")) {
          try {
            const jsonStr = trimmedLine.slice(6);
            if (jsonStr === "[DONE]") continue;

            const data = JSON.parse(jsonStr);
            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
              const text = data.candidates[0].content.parts[0].text;
              if (text) onChunk(text);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  } catch (error) {
    console.error("Gemini API stream call failed:", error);
    onChunk("\n[网络错误，请稍后再试]");
  }
};

// --- LaTeX 渲染组件 ---
const MathText = ({ children }) => {
  const [katexLoaded, setKatexLoaded] = useState(false);

  useEffect(() => {
    if (!document.getElementById('katex-css')) {
      const link = document.createElement('link');
      link.id = 'katex-css';
      link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (!window.katex) {
      const script = document.createElement('script');
      script.src = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js";
      script.onload = () => setKatexLoaded(true);
      document.head.appendChild(script);
    } else {
      setKatexLoaded(true);
    }
  }, []);

  const renderText = (text) => {
    if (!text) return null;
    const regex = /\$([^\$]+)\$/g;
    const parts = text.split(regex);
    return parts.map((part, index) => {
      if (index % 2 === 0) return <span key={index}>{part}</span>;
      else {
        if (katexLoaded && window.katex) {
          try {
            const html = window.katex.renderToString(part, { throwOnError: false, displayMode: false });
            return <span key={index} dangerouslySetInnerHTML={{ __html: html }} className="mx-1 font-serif" />;
          } catch (e) {
            return <code key={index} className="bg-slate-100 px-1 rounded text-red-500">{`$${part}$`}</code>;
          }
        } else {
          return <code key={index} className="bg-slate-100 px-1 rounded text-slate-600 font-mono">{`$${part}$`}</code>;
        }
      }
    });
  };
  return <span>{renderText(children)}</span>;
};

// --- 主应用组件 ---
const App = () => {
  const [activeTab, setActiveTab] = useState('concept');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const renderContent = () => {
    switch (activeTab) {
      case 'concept': return <ConceptSection />;
      case 'graphs': return <GraphSection />;
      case 'growth': return <GrowthSection />;
      case 'quiz': return <QuizSection />;
      case 'tutor': return <AITutorSection />;
      default: return <ConceptSection />;
    }
  };

  const navItems = [
    { id: 'concept', label: '概念引入', icon: <Activity size={18} /> },
    { id: 'graphs', label: '图象与性质', icon: <TrendingUp size={18} /> },
    { id: 'growth', label: '函数增长差异', icon: <Activity size={18} /> },
    { id: 'quiz', label: '自测与应用', icon: <CheckCircle size={18} /> },
    { id: 'tutor', label: 'AI 智能助教', icon: <Sparkles size={18} className="text-yellow-400" />, highlight: true },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shrink-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <BookOpen size={20} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">高中数学：对数函数</h1>
            <p className="text-xs text-slate-500">人教A版 4.4 节</p>
          </div>
        </div>

        {/* Desktop Nav */}
        <div className="hidden md:flex gap-1 bg-slate-100 p-1 rounded-lg">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === item.id
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                } ${item.highlight ? 'text-indigo-600' : ''}`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Mobile Nav Overlay */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-[60px] left-0 right-0 bg-white border-b border-slate-200 z-10 animate-in slide-in-from-top-2">
          <div className="p-2 flex flex-col gap-1">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setIsMenuOpen(false); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === item.id
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50">
        <div className="max-w-5xl mx-auto pb-10">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

// --- 课程 Section 组件 ---

const ConceptSection = () => {
  const [showInverse, setShowInverse] = useState(false);
  const data = [];
  for (let x = -2; x <= 2.5; x += 0.2) {
    const y_exp = Math.pow(2, x);
    data.push({ x: parseFloat(x.toFixed(2)), expY: parseFloat(y_exp.toFixed(2)), lineY: parseFloat(x.toFixed(2)) });
  }
  const logData = [];
  for (let x = 0.1; x <= 6; x += 0.2) {
    logData.push({ x: parseFloat(x.toFixed(2)), logY: parseFloat((Math.log(x) / Math.log(2)).toFixed(2)) });
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Activity className="text-blue-500" />
          从碳14衰减说起
        </h2>
        <div className="prose prose-slate max-w-none text-slate-600">
          <p className="mb-4">
            <MathText>{'我们在之前学习了生物体内碳14含量 $y$ 随时间 $x$ 衰减的规律：$y = (\\frac{1}{2})^{\\frac{x}{5730}}$。'}</MathText>
            反过来，如果我们测出了碳14的含量 $y$，如何求出生物死亡的时间 $x$ 呢？
          </p>
          <div className="bg-indigo-50 p-4 rounded-lg border-l-4 border-indigo-500 my-4">
            <p className="font-bold text-indigo-900 mb-2">这就是对数函数的由来：</p>
            <p className="mb-2">
              <MathText>{'由指数形式 $y = a^x$ 可以得到对数形式 $x = \\log_a y$。为了符合函数通常用 $x$ 表示自变量、$y$ 表示因变量的习惯，我们将字母对调，得到对数函数：'}</MathText>
            </p>
            <div className="text-xl text-center font-bold my-4 text-indigo-700 bg-white/50 py-2 rounded">
              <MathText>{'$y = \\log_a x \\quad (a>0, a \\neq 1)$'}</MathText>
            </div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">反函数关系可视化</h3>
            <button
              onClick={() => setShowInverse(!showInverse)}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${showInverse ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {showInverse ? '隐藏对数函数' : '显示对数函数 (反函数)'}
            </button>
          </div>
          <div className="h-[300px] w-full bg-slate-50 rounded-lg p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" dataKey="x" domain={[-2, 6]} stroke="#94a3b8" />
                <YAxis type="number" domain={[-2, 6]} stroke="#94a3b8" />
                <Tooltip />
                <ReferenceLine segment={[{ x: -2, y: -2 }, { x: 6, y: 6 }]} stroke="#cbd5e1" strokeDasharray="5 5" label={{ value: 'y=x', fill: '#94a3b8', fontSize: 12 }} />
                <Line data={data} type="monotone" dataKey="expY" stroke="#ef4444" strokeWidth={2} name="指数 y=2^x" dot={false} />
                {showInverse && <Line data={logData} type="monotone" dataKey="logY" stroke="#3b82f6" strokeWidth={2} name="对数 y=log₂x" dot={false} />}
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500 mt-3 text-center">
            <MathText>{'观察：$y=2^x$ 与 $y=\\log_2 x$ 的图象关于直线 $y=x$ 对称'}</MathText>
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-yellow-50 p-5 rounded-xl border border-yellow-200 h-full">
            <h4 className="font-bold text-yellow-800 mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              定义域与值域的互换
            </h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center bg-white/60 p-3 rounded-lg border border-yellow-100">
                <span className="text-sm font-medium text-slate-600"><MathText>{'指数函数 $y=a^x$'}</MathText></span>
                <span className="text-xs font-mono bg-yellow-100 px-2 py-1 rounded text-yellow-900"><MathText>{'定义域 R，值域 (0, +\\infty)'}</MathText></span>
              </div>
              <div className="flex justify-center text-yellow-400">
                <div className="rotate-90 md:rotate-0">⬇️ 互为反函数 ⬆️</div>
              </div>
              <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-yellow-200 shadow-sm">
                <span className="text-sm font-bold text-indigo-600"><MathText>{'对数函数 $y=\\log_a x$'}</MathText></span>
                <span className="text-xs font-mono bg-indigo-100 px-2 py-1 rounded text-indigo-900"><MathText>{'定义域 (0, +\\infty)，值域 R'}</MathText></span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-yellow-200">
              <h5 className="font-bold text-yellow-800 mb-2 text-sm">关键定点</h5>
              <ul className="space-y-2 text-sm text-yellow-900">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                  <MathText>{'指数函数恒过 $(0, 1)$'}</MathText>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  <MathText>{'对数函数恒过 $(1, 0)$'}</MathText>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const GraphSection = () => {
  const [base, setBase] = useState(2);
  const [showComparison, setShowComparison] = useState(false);
  const generateLogData = (a) => {
    const data = [];
    const steps = [0.1, 0.2, 0.3, 0.5, 0.7, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];
    steps.forEach(x => {
      if (a === 1) return;
      const y = Math.log(x) / Math.log(a);
      data.push({ x, y });
    });
    return data;
  };
  const currentData = generateLogData(base);
  const comparisonData2 = generateLogData(2);
  const comparisonDataHalf = generateLogData(0.5);
  const mergedComparisonData = comparisonData2.map((p, i) => ({
    x: p.x, y2: p.y, yHalf: comparisonDataHalf[i]?.y
  }));
  const isIncreasing = base > 1;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="text-blue-500" />
              <MathText>{'探究 $y = \\log_a x$ 的图象'}</MathText>
            </h3>
            <p className="text-sm text-slate-500 mt-1">拖动滑块改变底数 a，观察图象变化</p>
          </div>
          <div className="flex items-center gap-4 bg-slate-100 px-4 py-3 rounded-xl w-full md:w-auto">
            <span className="text-sm font-bold text-slate-700 whitespace-nowrap">底数 a = {base}</span>
            <input type="range" min="0.1" max="5" step="0.1" value={base}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (val === 1) return;
                setBase(val);
              }}
              className="w-full md:w-32 h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>
        </div>

        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" dataKey="x" domain={[0, 10]} stroke="#94a3b8" label={{ value: 'x', position: 'insideBottomRight', offset: -5 }} />
              <YAxis type="number" domain={[-4, 4]} stroke="#94a3b8" label={{ value: 'y', position: 'insideTopLeft', offset: 10 }} />
              <Tooltip formatter={(value) => value.toFixed(2)} labelFormatter={(label) => `x = ${label}`} />
              <ReferenceLine x={1} stroke="#cbd5e1" strokeDasharray="3 3" />
              <ReferenceLine y={0} stroke="#64748b" />
              <ReferenceLine x={0} stroke="#64748b" />
              {!showComparison ? (
                <Line data={currentData} type="monotone" dataKey="y" stroke={isIncreasing ? "#2563eb" : "#db2777"} strokeWidth={3} dot={{ r: 3 }} name={`y = log${base}(x)`} />
              ) : (
                <>
                  <Line data={mergedComparisonData} type="monotone" dataKey="y2" stroke="#2563eb" strokeWidth={2} name="y = log2(x)" />
                  <Line data={mergedComparisonData} type="monotone" dataKey="yHalf" stroke="#db2777" strokeWidth={2} name="y = log0.5(x)" />
                  <Legend />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex justify-center">
          <label className="flex items-center space-x-2 cursor-pointer select-none bg-slate-50 px-4 py-2 rounded-lg hover:bg-slate-100 transition">
            <input type="checkbox" checked={showComparison} onChange={() => setShowComparison(!showComparison)} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
            <span className="text-sm text-slate-700 font-medium"><MathText>{'对比 $y=\\log_2 x$ 与 $y=\\log_{0.5} x$ (关于x轴对称)'}</MathText></span>
          </label>
        </div>
      </div>

      <div className={`p-6 rounded-xl border-l-4 shadow-sm transition-all duration-500 ${isIncreasing ? 'bg-blue-50 border-blue-500' : 'bg-pink-50 border-pink-500'}`}>
        <h4 className={`font-bold text-lg mb-3 ${isIncreasing ? 'text-blue-800' : 'text-pink-800'}`}>
          当前性质总结 (a = {base}, {isIncreasing ? 'a > 1' : '0 < a < 1'})
        </h4>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <div className={`mt-1 p-1 rounded-full ${isIncreasing ? 'bg-blue-200 text-blue-700' : 'bg-pink-200 text-pink-700'}`}>
              {isIncreasing ? <TrendingUp size={16} /> : <TrendingUp size={16} className="transform rotate-90" />}
            </div>
            <div>
              <span className="font-semibold block text-slate-800 text-sm">单调性</span>
              <span className="text-sm text-slate-600">
                <MathText>{isIncreasing ? '在 $(0, +\\infty)$ 上是增函数' : '在 $(0, +\\infty)$ 上是减函数'}</MathText>
              </span>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-1 p-1 rounded-full bg-slate-200 text-slate-700">
              <Activity size={16} />
            </div>
            <div>
              <span className="font-semibold block text-slate-800 text-sm">取值分布</span>
              <span className="text-sm text-slate-600">
                {isIncreasing
                  ? <MathText>{'$x > 1$ 时 $y > 0$'}</MathText>
                  : <MathText>{'$x > 1$ 时 $y < 0$'}</MathText>}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const GrowthSection = () => {
  const [range, setRange] = useState(10);
  const generateGrowthData = (max) => {
    const data = [];
    const step = max / 20;
    for (let x = 0.1; x <= max; x += step) {
      data.push({
        x: parseFloat(x.toFixed(1)), linear: parseFloat(x.toFixed(2)), exp: parseFloat(Math.pow(2, x).toFixed(2)), log: parseFloat((Math.log(x) / Math.log(2)).toFixed(2))
      });
    }
    return data;
  };
  const data = generateGrowthData(range);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">三种函数的增长差异</h2>
            <p className="text-slate-500 text-sm mt-1"><MathText>{'对比 $y=x$, $y=2^x$, $y=\\log_2 x$ 在不同尺度下的表现'}</MathText></p>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-lg">
            {[5, 20, 50].map(v => (
              <button key={v} onClick={() => setRange(v)} className={`px-4 py-1.5 rounded-md text-sm transition ${range === v ? 'bg-white shadow text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'}`}>
                {v === 5 ? '小范围' : v === 20 ? '中范围' : '大范围'}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" type="number" domain={[0, range]} label={{ value: 'x', position: 'insideBottomRight', offset: -5 }} />
              <YAxis label={{ value: 'y', position: 'insideTopLeft', offset: 10 }} />
              <Tooltip />
              <Legend verticalAlign="top" height={36} />
              <Line type="monotone" dataKey="exp" stroke="#ef4444" strokeWidth={2} name="指数 y = 2^x" dot={false} />
              <Line type="monotone" dataKey="linear" stroke="#10b981" strokeWidth={2} name="一次 y = x" dot={false} />
              <Line type="monotone" dataKey="log" stroke="#3b82f6" strokeWidth={2} name="对数 y = log₂x" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border-t-4 border-red-500">
          <h4 className="font-bold text-red-600 mb-2">指数爆炸</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            <MathText>{'$y=2^x$ 增长极快。当 $x$ 较大时，几乎垂直上升。'}</MathText>
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-t-4 border-green-500">
          <h4 className="font-bold text-green-600 mb-2">匀速增长</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            <MathText>{'$y=x$ 是线性增长，速度保持不变。'}</MathText>
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border-t-4 border-blue-500">
          <h4 className="font-bold text-blue-600 mb-2">对数增长</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            <MathText>{'$y=\\log_2 x$ 虽然一直增长，但速度越来越慢。'}</MathText>
          </p>
        </div>
      </div>
    </div>
  );
};

const QuizSection = () => {
  const [questions, setQuestions] = useState([
    { id: 1, question: "函数 $f(x) = \\log_2(x-1)$ 的定义域是？", options: ["$(0, +\\infty)$", "$[1, +\\infty)$", "$(1, +\\infty)$", "$(-\\infty, 1)$"], correct: 2, explanation: "对数函数的真数必须大于0。即 $x-1 > 0$，解得 $x > 1$。" },
    { id: 2, question: "已知 $a = \\log_3 2$, $b = \\log_3 0.5$，比较 $a, b$ 的大小？", options: ["$a > b$", "$a < b$", "$a = b$", "无法比较"], correct: 0, explanation: "底数 $3 > 1$，函数 $y = \\log_3 x$ 是增函数。因为 $2 > 0.5$，所以 $\\log_3 2 > \\log_3 0.5$，即 $a > b$。" },
    { id: 3, question: "若 $\\log_a 3 < \\log_a 5$，则底数 $a$ 的取值范围是？", options: ["$0 < a < 1$", "$a > 1$", "$a > 0$", "$a \\neq 1$"], correct: 1, explanation: "题目中真数 $3 < 5$，而函数值 $\\log_a 3 < \\log_a 5$，不等号方向相同，说明函数是单调递增的，因此底数 $a > 1$。" }
  ]);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [answers, setAnswers] = useState({});
  const [showResult, setShowResult] = useState(false);

  const handleSelect = (qId, optionIdx) => {
    setAnswers(prev => ({ ...prev, [qId]: optionIdx }));
    setShowResult(false);
  };
  const isCorrect = (qId, correctIdx) => answers[qId] === correctIdx;

  const generateNewQuestion = async () => {
    if (!apiKey) { alert("请先配置 API Key 才能使用 AI 出题功能。"); return; }
    setLoadingQuestion(true);
    const prompt = `生成一个关于高中对数函数(logarithmic functions)的单项选择题。请返回纯 JSON 格式。格式：{"question": "题目(LaTeX)", "options": ["A", "B", "C", "D"], "correct": 0, "explanation": "解析(LaTeX)"}`;
    const result = await callGeminiJson(prompt);
    if (result) setQuestions(prev => [...prev, { id: Date.now(), ...result }]);
    setLoadingQuestion(false);
  };

  return (
    <div className="max-w-3xl mx-auto animate-in slide-in-from-bottom duration-500">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 bg-indigo-50 border-b border-indigo-100 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2"><CheckCircle className="w-6 h-6" /> 课堂小测</h2>
            <p className="text-indigo-600 text-sm mt-1">检验一下你对对数函数性质的掌握程度</p>
          </div>
          <button onClick={generateNewQuestion} disabled={loadingQuestion} className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-700 border border-indigo-200 hover:bg-indigo-50 rounded-lg transition disabled:opacity-50 shadow-sm font-medium">
            {loadingQuestion ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-yellow-500" />}
            {loadingQuestion ? '生成中...' : 'AI 生成新题'}
          </button>
        </div>
        <div className="p-6 space-y-8">
          {questions.map((q, idx) => (
            <div key={q.id} className="space-y-4 animate-in fade-in">
              <h3 className="font-semibold text-lg text-slate-800"><span className="mr-2 text-slate-400 font-mono">0{idx + 1}.</span><MathText>{q.question}</MathText></h3>
              <div className="grid grid-cols-1 gap-3">
                {q.options.map((opt, optIdx) => (
                  <button key={optIdx} onClick={() => handleSelect(q.id, optIdx)} className={`px-4 py-3 rounded-lg text-left text-sm font-medium transition-all border flex items-center ${answers[q.id] === optIdx ? 'bg-indigo-50 border-indigo-500 text-indigo-900 ring-1 ring-indigo-500' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                    <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs mr-3 shrink-0">{String.fromCharCode(65 + optIdx)}</span>
                    <MathText>{opt}</MathText>
                  </button>
                ))}
              </div>
              {showResult && (
                <div className={`mt-3 p-4 rounded-lg text-sm ${isCorrect(q.id, q.correct) ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  <p className="font-bold mb-1 flex items-center gap-2">{isCorrect(q.id, q.correct) ? <CheckCircle size={16} /> : <Activity size={16} />}{isCorrect(q.id, q.correct) ? "回答正确！" : "再想一想..."}</p>
                  <p><MathText>{q.explanation}</MathText></p>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button onClick={() => setShowResult(true)} className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition shadow-sm">提交答案</button>
        </div>
      </div>
    </div>
  );
};

const AITutorSection = () => {
  const [messages, setMessages] = useState([{ role: 'assistant', text: '你好！我是你的对数函数智能助教。关于定义域、图象性质或者具体的数学题，有什么不懂的都可以问我哦！' }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleSend = async () => {
    if (!apiKey) { alert("请先配置 API Key。"); return; }
    if (!input.trim()) return;

    const userMsg = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Initial empty assistant message
    setMessages(prev => [...prev, { role: 'assistant', text: "" }]);

    const systemPrompt = `你是一位精炼的高中数学辅导助手，专注于“对数函数”答疑。
    **核心原则：极简、直观、准确**
    1. **拒绝废话**：开场白不超过一句话，直接回答核心问题。
    2. **结构化输出**：必须使用 Markdown 列表（- 或 1.）呈现知识点。
    3. **公式规范**：数学公式**必须**包裹在单个对应的 $ 符号中（如 $\\log_a x$），禁止裸写公式。
    4. **排版整洁**：段落之间必须空一行。`;

    await callGeminiStream(input, systemPrompt, (chunk) => {
      setMessages(prev => {
        const newMsgs = [...prev];
        const lastIndex = newMsgs.length - 1;
        const lastMsg = newMsgs[lastIndex];

        // Fix: Create a shallow copy of the last message object before mutation
        // This prevents duplication issues in React Strict Mode where updaters run twice
        if (lastMsg.role === 'assistant') {
          newMsgs[lastIndex] = {
            ...lastMsg,
            text: lastMsg.text + chunk
          };
        }
        return newMsgs;
      });
    });

    setIsLoading(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-indigo-100 flex flex-col h-[600px] animate-in fade-in zoom-in-95 duration-500 overflow-hidden">
      <div className="p-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center gap-3">
        <div className="p-2 bg-white/20 rounded-full backdrop-blur-sm"><Bot className="w-6 h-6 text-white" /></div>
        <div><h3 className="font-bold text-lg">AI 智能助教</h3><p className="text-indigo-100 text-xs opacity-90">7*24小时回答问题</p></div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3.5 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-white text-slate-700 border border-slate-200 rounded-bl-none'}`}>
              {msg.role === 'assistant' ? <MathText>{msg.text}</MathText> : <span>{msg.text}</span>}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1].text === "" && <div className="flex justify-start"><div className="bg-white p-4 rounded-2xl rounded-bl-none shadow-sm border border-slate-200 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-indigo-500" /><span className="text-sm text-slate-500">老师正在思考中...</span></div></div>}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend()} placeholder="输入你的问题..." className="flex-1 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition bg-slate-50" />
          <button onClick={handleSend} disabled={isLoading || !input.trim()} className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"><Send className="w-5 h-5" /></button>
        </div>
      </div>
    </div>
  );
};

export default App;