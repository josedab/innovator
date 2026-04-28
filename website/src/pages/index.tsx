import React from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';

const features = [
  {
    icon: '🔍',
    title: 'AI Investigation',
    description:
      'Enter any subject and get a structured analysis of key aspects, challenges, and opportunities — powered by your Copilot subscription.',
  },
  {
    icon: '🎯',
    title: '8 Innovation Angles',
    description:
      'Apply proven frameworks like SCAMPER, First Principles, Cross-Domain Analogy, and more to generate ideas you wouldn\'t find on your own.',
  },
  {
    icon: '🚀',
    title: 'Auto Mode',
    description:
      'Run all 8 angles automatically with real-time progress, then get a synthesized report ranking the best ideas by feasibility and impact.',
  },
  {
    icon: '💻',
    title: 'Web App + CLI',
    description:
      'Beautiful web interface for interactive exploration, plus a full CLI for scripting and automation. Same engine, two interfaces.',
  },
  {
    icon: '🔑',
    title: 'No API Keys Needed',
    description:
      'Built on the GitHub Copilot SDK — uses your existing subscription. Supports GPT-5, Claude Sonnet, and other models out of the box.',
  },
  {
    icon: '🛡️',
    title: 'Validated Outputs',
    description:
      'Every AI response is parsed with brace-balanced JSON extraction and validated with Zod schemas. Structured, typed, reliable.',
  },
];

const angles = [
  { icon: '🔄', name: 'SCAMPER', desc: 'Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse' },
  { icon: '🧱', name: 'First Principles', desc: 'Decompose to fundamentals, rebuild from scratch' },
  { icon: '🌐', name: 'Cross-Domain', desc: 'Map concepts from unrelated fields' },
  { icon: '🔒', name: 'Constraints', desc: 'Force creativity through provocative limits' },
  { icon: '🔃', name: 'Inversion', desc: 'Flip the problem, then reverse the insights' },
  { icon: '👥', name: 'Perspectives', desc: 'View through different stakeholder lenses' },
  { icon: '💭', name: 'What-If', desc: 'Explore provocative hypotheticals' },
  { icon: '⚡', name: 'Trend Collision', desc: 'Combine with emerging technologies' },
];

export default function Home(): React.JSX.Element {
  return (
    <Layout title="AI-Powered Innovation Engine" description="Explore any subject from multiple innovation angles using AI">
      {/* Hero */}
      <header className="hero hero--innovator">
        <div className="container text--center">
          <h1 className="hero__title">💡 Innovator</h1>
          <p className="hero__subtitle">
            Explore any subject from 8 proven innovation angles — powered by AI, driven by your Copilot subscription.
          </p>
          <div className="install-block">
            npm install && npm run dev
          </div>
          <div className="cta-buttons">
            <Link className="button button--primary button--lg" to="/docs/getting-started">
              Get Started →
            </Link>
            <Link
              className="button button--outline button--lg"
              style={{ color: 'white', borderColor: 'white' }}
              href="https://github.com/josedab/innovator"
            >
              GitHub
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Features */}
        <section className="container margin-vert--xl">
          <h2 className="text--center margin-bottom--lg">Why Innovator?</h2>
          <div className="features-grid">
            {features.map((f, i) => (
              <div key={i} className="feature-card">
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Angles */}
        <section style={{ background: 'var(--ifm-color-emphasis-100)' }}>
          <div className="container margin-vert--xl padding-vert--lg">
            <h2 className="text--center margin-bottom--lg">8 Innovation Angles</h2>
            <div className="features-grid">
              {angles.map((a, i) => (
                <div key={i} className="feature-card" style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '2.5rem' }}>{a.icon}</div>
                  <h3>{a.name}</h3>
                  <p style={{ fontSize: '0.9rem' }}>{a.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it Works */}
        <section className="container margin-vert--xl">
          <h2 className="text--center margin-bottom--lg">How It Works</h2>
          <div style={{ maxWidth: 700, margin: '0 auto', fontSize: '1.1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--ifm-color-primary)' }}>1</span>
              <div><strong>Enter a subject</strong> — any technology, product, process, or idea you want to innovate on.</div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--ifm-color-primary)' }}>2</span>
              <div><strong>AI investigates</strong> — identifies key aspects, state of the art, challenges, and opportunities.</div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--ifm-color-primary)' }}>3</span>
              <div><strong>Choose your angles</strong> — pick which innovation frameworks to apply, or use Auto Mode for all 8.</div>
            </div>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--ifm-color-primary)' }}>4</span>
              <div><strong>Get actionable ideas</strong> — each idea includes description, potential impact, and implementation hints. Auto Mode adds a ranked synthesis.</div>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
