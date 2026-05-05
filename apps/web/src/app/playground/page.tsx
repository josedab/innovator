"use client";

import { useState } from "react";

interface PlaygroundEndpoint {
  name: string;
  method: string;
  path: string;
  description: string;
  body: Record<string, unknown>;
}

const ENDPOINTS: PlaygroundEndpoint[] = [
  { name: "Investigate", method: "POST", path: "/api/investigate", description: "Investigate a subject with AI", body: { subject: "AI in healthcare" } },
  { name: "Auto Pipeline", method: "POST", path: "/api/auto", description: "Run full innovation pipeline", body: { subject: "sustainable packaging" } },
  { name: "Score Ideas", method: "POST", path: "/api/score", description: "Score ideas across dimensions", body: { subject: "remote work tools", angleResults: [] } },
  { name: "Wargaming", method: "POST", path: "/api/wargaming", description: "Competitive wargaming simulation", body: { subject: "AI chatbots", ideaTitle: "Context-Aware Assistant", ideaDescription: "An AI assistant that maintains deep context", rounds: 3 } },
  { name: "Supply Chain", method: "POST", path: "/api/supply-chain", description: "Map innovation supply chain", body: { subject: "electric vehicles", ideaTitle: "Solid-State Battery", ideaDescription: "Next-gen solid-state batteries for EVs" } },
  { name: "Timing Analysis", method: "POST", path: "/api/timing", description: "Predict optimal execution timing", body: { subject: "quantum computing", ideas: [{ title: "Quantum ML", description: "Machine learning on quantum hardware" }] } },
  { name: "Team DNA", method: "POST", path: "/api/team-dna", description: "Analyze team innovation patterns", body: { teamId: "engineering", memberIds: ["user-1", "user-2"] } },
  { name: "Portfolio Optimize", method: "POST", path: "/api/portfolio-optimize", description: "Markowitz portfolio optimization", body: { scores: [{ ideaTitle: "Idea A", angleId: "scamper", feasibility: 8, impact: 7, novelty: 6, timeToImplement: "months", confidence: 0.8, rationale: "Strong" }, { ideaTitle: "Idea B", angleId: "inversion", feasibility: 5, impact: 9, novelty: 8, timeToImplement: "quarters", confidence: 0.7, rationale: "Bold" }] } },
  { name: "Cost Report", method: "GET", path: "/api/cost-report", description: "LLM cost-performance report", body: {} },
  { name: "Rubrics", method: "GET", path: "/api/rubric", description: "List scoring rubrics", body: {} },
];

function generateSnippet(endpoint: PlaygroundEndpoint, lang: string, baseUrl: string): string {
  const url = `${baseUrl}${endpoint.path}`;
  const bodyStr = JSON.stringify(endpoint.body, null, 2);

  switch (lang) {
    case "curl":
      if (endpoint.method === "GET") return `curl -s ${url} | jq .`;
      return `curl -s -X POST ${url} \\\n  -H "Content-Type: application/json" \\\n  -d '${bodyStr}' | jq .`;
    case "javascript":
      if (endpoint.method === "GET") return `const res = await fetch("${url}");\nconst data = await res.json();\nconsole.log(data);`;
      return `const res = await fetch("${url}", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify(${bodyStr})\n});\nconst data = await res.json();\nconsole.log(data);`;
    case "python":
      if (endpoint.method === "GET") return `import requests\n\nres = requests.get("${url}")\nprint(res.json())`;
      return `import requests\n\nres = requests.post(\n    "${url}",\n    json=${bodyStr.replace(/"/g, '"')}\n)\nprint(res.json())`;
    case "go":
      if (endpoint.method === "GET") return `resp, err := http.Get("${url}")\nif err != nil {\n    log.Fatal(err)\n}\ndefer resp.Body.Close()\nbody, _ := io.ReadAll(resp.Body)\nfmt.Println(string(body))`;
      return `payload := bytes.NewBufferString(\`${bodyStr}\`)\nresp, err := http.Post("${url}", "application/json", payload)\nif err != nil {\n    log.Fatal(err)\n}\ndefer resp.Body.Close()\nbody, _ := io.ReadAll(resp.Body)\nfmt.Println(string(body))`;
    default:
      return "";
  }
}

export default function PlaygroundPage() {
  const [selected, setSelected] = useState<PlaygroundEndpoint>(ENDPOINTS[0]);
  const [body, setBody] = useState(JSON.stringify(ENDPOINTS[0].body, null, 2));
  const [response, setResponse] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState("curl");
  const [error, setError] = useState("");

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  const handleSelect = (ep: PlaygroundEndpoint) => {
    setSelected(ep);
    setBody(JSON.stringify(ep.body, null, 2));
    setResponse("");
    setError("");
  };

  const handleRun = async () => {
    setLoading(true);
    setError("");
    setResponse("");
    try {
      const options: RequestInit = { method: selected.method, headers: { "Content-Type": "application/json" } };
      if (selected.method !== "GET") {
        options.body = body;
      }
      const res = await fetch(selected.path, options);
      const data = await res.json();
      setResponse(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">🧪 API Playground</h1>
        <p className="text-gray-400 mb-8">Explore the Innovator API with live examples and code snippets</p>

        <div className="grid grid-cols-12 gap-6">
          {/* Endpoint List */}
          <div className="col-span-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase mb-3">Endpoints</h2>
            <div className="space-y-1">
              {ENDPOINTS.map((ep) => (
                <button
                  key={ep.path}
                  onClick={() => handleSelect(ep)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    selected.path === ep.path ? "bg-blue-600 text-white" : "hover:bg-gray-800 text-gray-300"
                  }`}
                >
                  <span className={`inline-block w-12 font-mono text-xs ${ep.method === "GET" ? "text-green-400" : "text-yellow-400"}`}>
                    {ep.method}
                  </span>
                  {ep.name}
                </button>
              ))}
            </div>
          </div>

          {/* Main Panel */}
          <div className="col-span-9 space-y-6">
            {/* Endpoint Info */}
            <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
              <div className="flex items-center gap-3 mb-2">
                <span className={`px-2 py-0.5 rounded text-xs font-mono ${selected.method === "GET" ? "bg-green-900 text-green-300" : "bg-yellow-900 text-yellow-300"}`}>
                  {selected.method}
                </span>
                <code className="text-sm text-gray-300">{selected.path}</code>
              </div>
              <p className="text-gray-400 text-sm">{selected.description}</p>
            </div>

            {/* Request Body */}
            {selected.method !== "GET" && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Request Body</h3>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full h-48 bg-gray-900 border border-gray-700 rounded-lg p-4 font-mono text-sm text-gray-300 resize-y"
                  spellCheck={false}
                />
              </div>
            )}

            {/* Run Button */}
            <button
              onClick={handleRun}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-lg font-medium transition"
            >
              {loading ? "Running..." : "▶ Send Request"}
            </button>

            {/* Response */}
            {(response || error) && (
              <div>
                <h3 className="text-sm font-semibold text-gray-400 mb-2">Response</h3>
                <pre className={`bg-gray-900 border rounded-lg p-4 text-sm overflow-auto max-h-96 ${error ? "border-red-800 text-red-300" : "border-gray-700 text-green-300"}`}>
                  {error || response}
                </pre>
              </div>
            )}

            {/* Code Snippets */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold text-gray-400">Code Snippet</h3>
                <div className="flex gap-1">
                  {["curl", "javascript", "python", "go"].map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={`px-2 py-0.5 text-xs rounded ${lang === l ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}
                    >
                      {l === "javascript" ? "JS" : l === "curl" ? "cURL" : l.charAt(0).toUpperCase() + l.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 overflow-auto">
                {generateSnippet(selected, lang, baseUrl)}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
