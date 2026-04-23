import { useState } from 'react';
import './index.css';

function App() {
  const [email, setEmail] = useState('');

  return (
    <div className="app-container">
      {/* Background Ambience */}
      <div className="ambient-glow glow-1"></div>
      <div className="ambient-glow glow-2"></div>

      {/* Navigation */}
      <nav className="navbar">
        <div className="logo">
          <div className="logo-dot"></div>
          CORTEX
        </div>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#demo">Watch Demo</a>
          <a href="mailto:founders@cortex-local.ai" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
            Contact Us
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="hero">
        <div className="hero-badge">
          <span>⚡ YC Summer 2026</span>
        </div>
        <h1>The Sovereign Intelligence Infrastructure.</h1>
        <p>
          CORTEX replaces the SOC, the Threat Intel analyst, and the Penetration Tester with an air-gapped, neuro-symbolic reasoning engine that defends networks autonomously in real-time.
        </p>
        
        <div className="cta-group">
          <a href="#demo" className="btn btn-primary">
            Watch the Demo
          </a>
          <a href="mailto:waitlist@cortex-local.ai?subject=Beta Access" className="btn btn-secondary">
            Join Waitlist
          </a>
        </div>
      </main>

      {/* Demo Section Placeholder */}
      <section id="demo" className="demo-section">
        <div className="terminal-window">
          <div className="terminal-header">
            <div className="terminal-dot dot-red"></div>
            <div className="terminal-dot dot-yellow"></div>
            <div className="terminal-dot dot-green"></div>
            <div className="terminal-title">cortex-agentic-os — local-inference</div>
          </div>
          <div className="terminal-body">
            <div className="video-placeholder">
              <div className="play-icon">
                ▶
              </div>
              <p>Demo Video (1 Minute) goes here</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="features">
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">
              🔒
            </div>
            <h3>Air-Gapped Sovereignty</h3>
            <p>
              Operates entirely on local GGUF models. Your proprietary architecture, keys, and internal documentation never touch the cloud.
            </p>
          </div>
          <div className="feature-card purple">
            <div className="feature-icon">
              ⚔️
            </div>
            <h3>Mythos Threat Engine</h3>
            <p>
              Unlike traditional scanners, CORTEX uses an ontological graph to natively understand the 12-layer cybersecurity stack, hunting for architectural "Myth Gaps".
            </p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">
              🏆
            </div>
            <h3>100% Cybench Score</h3>
            <p>
              The first system to achieve a perfect score on the Cybench security benchmark, proving mathematical determinism over probabilistic hallucination.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;
