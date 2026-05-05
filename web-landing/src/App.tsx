import { useEffect, useRef, useState } from 'react';
import './index.css';

/* ── Intersection Observer hook for fade-in ── */
function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add('visible'); obs.unobserve(el); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function FadeIn({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useFadeIn();
  return <div ref={ref} className={`fade-in ${className}`}>{children}</div>;
}

/* ── Terminal typing effect ── */
const TERMINAL_LINES = [
  { type: 'prompt', text: 'cortex>' },
  { type: 'cmd', text: ' /beast' },
  { type: 'output', text: '→ [SYSTEM] BEASTMODE ENABLED · CognitionCore overclocked to 2.4GHz' },
  { type: 'dim', text: '  All engines (Math, Physics, Logic, Neural) set to maximum precision.' },
  { type: 'blank', text: '' },
  { type: 'prompt', text: 'cortex>' },
  { type: 'cmd', text: ' solve Schrodinger equation for Hydrogen atom' },
  { type: 'output', text: '→ [CognitionCore · Quantum] Ψ(r,θ,φ) = R_nl(r) Y_lm(θ,φ)' },
  { type: 'dim', text: '  E_n = -13.6 eV / n² · 100% Deterministic Proof · 0.2ms latency' },
  { type: 'blank', text: '' },
  { type: 'prompt', text: 'cortex>' },
  { type: 'cmd', text: ' /arl status' },
  { type: 'output', text: '→ [ARL] Autonomous Reasoning Loop Active (Cycle #4,812)' },
  { type: 'dim', text: '  Curiosity: 98% · Memory Consolidation: 100% · System Integrity: PASS' },
  { type: 'blank', text: '' },
  { type: 'prompt', text: 'cortex>' },
  { type: 'cmd', text: ' /cyberscan --beast' },
  { type: 'output', text: '→ [Mythos] Running 10-engine security audit on local cluster...' },
  { type: 'output', text: '→ ZERO-DAY detected in network-auth.ts (Line 142) · Remediation ready.' },
  { type: 'dim', text: '  Threat Ontology: 12-domain deep scan · Zero-Knowledge architecture' },
];

function Terminal() {
  const [visibleLines, setVisibleLines] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          let i = 0;
          const interval = setInterval(() => {
            i++;
            setVisibleLines(i);
            if (i >= TERMINAL_LINES.length) clearInterval(interval);
          }, 180);
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div className="terminal" ref={ref}>
      <div className="terminal-bar">
        <div className="tdot tdot-r" />
        <div className="tdot tdot-y" />
        <div className="tdot tdot-g" />
        <span className="tname">cortex — sovereign-inference</span>
      </div>
      <div className="terminal-content">
        {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => (
          <div className="line" key={i}>
            {line.type === 'blank' ? <br /> : <span className={line.type}>{line.text}</span>}
          </div>
        ))}
        {visibleLines < TERMINAL_LINES.length && (
          <span className="prompt" style={{ animation: 'fadeUp 0.5s ease infinite alternate' }}>▋</span>
        )}
      </div>
    </div>
  );
}

/* ── Copy handler ── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="copy-btn"
      title="Copy to clipboard"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
    >
      {copied ? '✓' : '⎘'}
    </button>
  );
}

/* ── Main App ── */
export default function App() {
  return (
    <div>
      {/* ── Navigation ── */}
      <nav className="nav" id="nav">
        <a href="#" className="nav-logo">
          <span className="dot" />
          CORTEX
        </a>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#architecture">Architecture</a>
          <a href="#use-cases">Use Cases</a>
          <a href="#contact">Contact</a>
          <a href="mailto:vimalspaceton618@gmail.com?subject=CORTEX Inquiry" className="nav-cta">
            Get in Touch
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="hero" id="hero">
        <div className="hero-badge">
          <span className="badge-dot" />
          Now in Private Beta
        </div>
        <h1>
          Private AI for<br />
          <span className="accent">sensitive codebases.</span>
        </h1>
        <p className="hero-sub">
          CORTEX is local-first sovereign intelligence infrastructure.
          Neuro-symbolic reasoning, multi-agent development, and cybersecurity — 
          100% on your hardware. Nothing leaves your machine.
        </p>
        <div className="hero-actions">
          <a href="mailto:vimalspaceton618@gmail.com?subject=CORTEX Demo Request" className="btn-solid">
            Request a Demo
          </a>
          <a href="#features" className="btn-outline">
            Learn More
          </a>
        </div>
        <div className="install-bar">
          <div className="install-cmd">
            <code>npm install -g @cortex-local/cli</code>
            <CopyButton text="npm install -g @cortex-local/cli" />
          </div>
        </div>
      </section>

      {/* ── Logos / Trust Bar ── */}
      <div className="logos-section">
        <p className="logos-label">Built for teams that can't afford data leaks</p>
        <div className="logos-row">
          <span>Defense</span>
          <span>Healthcare</span>
          <span>Finance</span>
          <span>Government</span>
          <span>Enterprise</span>
        </div>
      </div>

      {/* ── Terminal Demo ── */}
      <FadeIn>
        <section className="terminal-section" id="demo">
          <Terminal />
        </section>
      </FadeIn>

      {/* ── Features ── */}
      <FadeIn>
        <section className="section" id="features">
          <p className="section-label">Capabilities</p>
          <h2 className="section-title">Everything runs locally.<br />Nothing is approximate.</h2>
          <p className="section-sub">
            CORTEX combines deterministic STEM engines with adaptive neural networks in a single process. No API calls. No cloud dependency. Full proof traces.
          </p>
          <div className="features-grid">
            <div className="feature-cell">
              <div className="f-icon">🔒</div>
              <h3>Air-Gapped Sovereignty</h3>
              <p>Runs entirely on local GGUF models. Your architecture, keys, and documentation never leave your hardware.</p>
            </div>
            <div className="feature-cell">
              <div className="f-icon">⚡</div>
              <h3>Deterministic STEM</h3>
              <p>Symbolic math, physics simulation across 6 domains, and formal logic proofs — with 100% confidence and full traces.</p>
            </div>
            <div className="feature-cell">
              <div className="f-icon">🧠</div>
              <h3>Neuro-Symbolic Engine</h3>
              <p>Liquid Time-Constant neural network with RK4 integration and Hebbian learning. Adapts during inference, not just training.</p>
            </div>
            <div className="feature-cell">
              <div className="f-icon">⚔️</div>
              <h3>Mythos Threat Engine</h3>
              <p>12-domain cybersecurity ontology that maps architecture descriptions to known TTPs. Finds "Myth Gaps" other scanners miss.</p>
            </div>
            <div className="feature-cell">
              <div className="f-icon">🤖</div>
              <h3>7-Agent Swarm</h3>
              <p>Developer, Explorer, Planner, Quality, DevOps, Browser, and Network agents with automatic task routing and verification.</p>
            </div>
            <div className="feature-cell">
              <div className="f-icon">🔗</div>
              <h3>LLM Absorption</h3>
              <p>Drop any GGUF model into your directory. CORTEX probes it, profiles domain strengths, and routes queries to the best model.</p>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* ── Architecture ── */}
      <FadeIn>
        <section className="section" id="architecture">
          <p className="section-label">Architecture</p>
          <h2 className="section-title">Single process. Zero latency.</h2>
          <p className="section-sub">
            No microservices. No containers. The cognition core and agent swarm run in-process with direct function calls.
          </p>
          <div className="arch-diagram">
{`┌─── CORTEX v4.0 ─── Single Unified Process ──────────────────────────────┐
│                                                                          │
│  ┌─ CognitionCore ────────────────────────────────────────────────┐     │
│  │  SymbolicMath │ Physics (6 domains) │ FormalLogic │ ODE-Net    │     │
│  │  Mythos       │ EpisodicMemory      │ LLM Absorber            │     │
│  └────────────────────────────────────────────────────────────────┘     │
│        ↕ direct function call · zero network latency                     │
│  ┌─ AgentManager ─────────────────────────────────────────────────┐     │
│  │  Smart Routing → Local CognitionCore OR Cloud LLM Fallback     │     │
│  │  7 Sub-agents │ Plugin System │ SharedContext                    │     │
│  └────────────────────────────────────────────────────────────────┘     │
│        ↕                                                                  │
│  ┌─ Interface ────────────────────────────────────────────────────┐     │
│  │  Terminal UI │ /beast │ /cyberscan │ /dashboard Telemetry       │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘`}
          </div>
        </section>
      </FadeIn>

      {/* ── Use Cases ── */}
      <FadeIn>
        <section className="section" id="use-cases">
          <p className="section-label">Use Cases</p>
          <h2 className="section-title">Who is CORTEX for?</h2>
          <p className="section-sub">
            Any team where sending code to a third-party API isn't an option.
          </p>
          <div className="use-cases-grid">
            <div className="use-case-card">
              <div className="uc-icon">🛡️</div>
              <h3>Defense & Intelligence</h3>
              <p>Air-gapped environments where classified codebases need AI assistance without any external network calls.</p>
            </div>
            <div className="use-case-card">
              <div className="uc-icon">🏥</div>
              <h3>Healthcare & HIPAA</h3>
              <p>Process PHI-adjacent code and infrastructure without risking compliance violations from cloud AI providers.</p>
            </div>
            <div className="use-case-card">
              <div className="uc-icon">🏦</div>
              <h3>Financial Services</h3>
              <p>SOC 2, PCI-DSS compliant development assistance. Threat modeling and penetration testing without data exposure.</p>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* ── Contact ── */}
      <FadeIn>
        <section className="contact-section" id="contact">
          <div className="contact-inner">
            <p className="section-label">Get in Touch</p>
            <h2 className="section-title">Ready to take control of your AI?</h2>
            <p className="section-sub centered">
              Whether you're exploring private AI for your team or want to see CORTEX in action — we'd love to hear from you.
            </p>
            <div className="contact-methods">
              <a href="mailto:vimalspaceton618@gmail.com" className="contact-card" id="contact-email">
                <div className="c-icon">✉</div>
                <div className="c-info">
                  <div className="c-label">Email</div>
                  <div className="c-value">vimalspaceton618@gmail.com</div>
                </div>
              </a>
              <a href="tel:+919445905788" className="contact-card" id="contact-phone">
                <div className="c-icon">📞</div>
                <div className="c-info">
                  <div className="c-label">Phone</div>
                  <div className="c-value">+91 94459 05788</div>
                </div>
              </a>
            </div>
            <div className="contact-cta">
              <a href="mailto:vimalspaceton618@gmail.com?subject=CORTEX Demo Request&body=Hi, I'd like to learn more about CORTEX and schedule a demo." className="btn-contact" id="contact-demo-btn">
                Request a Demo →
              </a>
            </div>
          </div>
        </section>
      </FadeIn>

      {/* ── Footer ── */}
      <footer className="footer">
        <div className="footer-links">
          <a href="mailto:vimalspaceton618@gmail.com">Contact</a>
          <a href="https://github.com/vimalspaceton618-afk/CORTEX" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
        <p>© 2026 SpaceTon. All rights reserved. Proprietary software.</p>
      </footer>
    </div>
  );
}
