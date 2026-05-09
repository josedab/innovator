import { getSession } from "@innovator/core";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function EmbedPage({ params }: PageProps) {
  const { sessionId } = await params;
  if (!sessionId || sessionId.length > 200 || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    notFound();
  }
  const session = getSession(sessionId);
  if (!session) notFound();

  const ideaCount = session.angleResults.reduce((sum, ar) => sum + ar.ideas.length, 0);
  const topIdeas = session.synthesis?.topIdeas?.slice(0, 3)
    ?? session.angleResults.flatMap((ar) => ar.ideas).slice(0, 3);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: system-ui, -apple-system, sans-serif; color: #333; max-width: 600px; padding: 16px; }
          .header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
          .title { font-size: 18px; font-weight: 700; }
          .meta { font-size: 12px; color: #888; margin-bottom: 16px; }
          .idea { border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px; margin-bottom: 8px; }
          .idea-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
          .idea-desc { font-size: 12px; color: #666; }
          .footer { margin-top: 12px; font-size: 11px; color: #aaa; text-align: center; }
          .footer a { color: #4f46e5; text-decoration: none; }
          .footer a:hover { text-decoration: underline; }
          @media (prefers-color-scheme: dark) {
            body { background: #1a1a1a; color: #e5e5e5; }
            .idea { border-color: #333; }
            .idea-desc { color: #999; }
          }
        `}</style>
      </head>
      <body>
        <div className="header">
          <span>💡</span>
          <span className="title">{session.subject}</span>
        </div>
        <p className="meta">
          {session.angleResults.length} angles · {ideaCount} ideas
        </p>
        {topIdeas.map((idea, i) => (
          <div key={i} className="idea">
            <div className="idea-title">{idea.title}</div>
            <div className="idea-desc">{idea.description}</div>
          </div>
        ))}
        <div className="footer">
          Powered by <a href={`/share/${sessionId}`} target="_blank" rel="noopener">Innovator</a>
        </div>
      </body>
    </html>
  );
}
