import Link from 'next/link';
import { BlueprintPlan, DEMO_APARTMENT } from '@/components/BlueprintPlan';
import { TypedPrompt } from '@/components/TypedPrompt';
import { RevealObserver } from '@/components/RevealObserver';
import { AuroraBackground } from '@/components/AuroraBackground';

/* ── Nav ─────────────────────────────────────────────────────────────── */
function MarketingNav() {
  return (
    <nav className="topnav">
      {/* Logo */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 28, height: 28, display: 'grid', placeItems: 'center',
          borderRadius: 4, background: 'rgb(var(--text-rgb))', color: 'rgb(var(--bg-rgb))',
          fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 17, lineHeight: 1,
        }}>A</div>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: 20, letterSpacing: '-0.01em' }}>
          Archivox
        </span>
      </Link>

      <div style={{ display: 'flex', gap: 4, marginLeft: 32 }}>
        {[['Studio', '/project/demo/editor'], ['Dashboard', '/dashboard'], ['Plugin', '/plugin'], ['Pricing', '/#pricing']].map(([t, to]) => (
          <Link key={t} href={to} className="btn btn-link"
            style={{ padding: '6px 12px', color: 'rgb(var(--muted-rgb))', fontSize: 13 }}>{t}</Link>
        ))}
      </div>

      <div style={{ flex: 1 }} />
      <Link href="/signin" className="btn btn-link" style={{ padding: '6px 12px', color: 'rgb(var(--text-rgb))', fontSize: 13 }}>Sign in</Link>
      <Link href="/auth/signup" className="btn btn-primary">Start drafting →</Link>
    </nav>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section style={{
      position: 'relative', minHeight: 'calc(100vh - 60px)',
      padding: '48px 28px 64px', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <AuroraBackground />
      <div style={{
        position: 'relative', maxWidth: 1320, margin: '0 auto',
        width: '100%', flex: 1, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 36 }}>
          <div className="chip accent">
            <span className="dot" />v3.0 · rhino plugin + portfolio render
          </div>
          <div className="mono-label">47.81°N · 13.05°E · DRAFTED IN BERLIN</div>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: '1.15fr 1fr',
          gap: 56, alignItems: 'center', flex: 1,
        }}>
          <div>
            <h1 className="display-xl" style={{ margin: 0 }}>
              Design in Rhino.<br />Present with <em>AI</em>.
            </h1>
            <p style={{
              fontSize: 17, lineHeight: 1.55, color: 'rgb(var(--muted-rgb))',
              maxWidth: 480, marginTop: 28,
            }}>
              ArchiVox lives inside Rhino as an AI chat panel. Describe any element and
              watch it build — then export a section view and render it portfolio-ready in seconds.
            </p>
            <div style={{ display: 'flex', gap: 12, marginTop: 32, alignItems: 'center' }}>
              <Link href="/plugin" className="btn btn-primary" style={{ padding: '14px 22px', fontSize: 14 }}>
                Download the plugin →
              </Link>
              <Link href="/project/demo/editor" className="btn btn-ghost" style={{ padding: '14px 18px', fontSize: 13 }}>
                ▶ See portfolio examples
              </Link>
            </div>
            <div style={{
              display: 'flex', gap: 28, marginTop: 36,
              fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.12em', color: 'rgb(var(--muted-rgb))',
            }}>
              <span>RHINO 8 · GRASSHOPPER · IMAGEN 3 · IFC 4</span>
            </div>
          </div>
          <div>
            <TypedPrompt />
            <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="chip">1 RENDER</div>
              <div className="chip">1:50</div>
              <div className="chip accent"><span className="dot" />PASS</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginTop: 32 }}>
          <div className="mono-label">RHINO 8 COMPATIBLE · GRASSHOPPER · IMAGEN 3 RENDER · IFC 4 EXPORT</div>
          <div className="mono-label">SCROLL TO EXPLORE ↓</div>
        </div>
      </div>
    </section>
  );
}

/* ── Blueprint plan section ───────────────────────────────────────────── */
function HeroPlanSection() {
  return (
    <section style={{
      position: 'relative', padding: '60px 28px 100px',
      overflow: 'hidden', borderTop: '1px solid var(--border-subtle)',
    }}>
      <div style={{ position: 'relative', maxWidth: 1320, margin: '0 auto' }}>
        <div className="reveal" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <div className="mono-label">DRAWING · A-101 · FLOOR PLAN · GROUND</div>
          <div className="mono-label">REV · 04 · CHK · N.K. · 18.04.2026</div>
        </div>
        <div className="panel" style={{ padding: 24 }}>
          <BlueprintPlan rooms={DEMO_APARTMENT} width={720} height={420} drawOnReveal title="A-101.DWG" />
        </div>
      </div>
    </section>
  );
}

/* ── Logo strip ───────────────────────────────────────────────────────── */
function LogoStrip() {
  const names = ['STUDIO NORDE', 'HAUS-BUREAU', 'MERIDIAN CO.', 'ØSTLUND & ASSOC.', 'CRANESIDE', 'ATELIER KONT.'];
  return (
    <section style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', padding: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', maxWidth: 1320, margin: '0 auto', gap: 28 }}>
        <div className="mono-label" style={{ whiteSpace: 'nowrap' }}>IN PRACTICE AT ——</div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
          {names.map(n => (
            <span key={n} className="font-display" style={{ fontSize: 18, color: 'rgb(var(--muted-rgb))', letterSpacing: '0.04em', opacity: 0.75 }}>{n}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── How it works ─────────────────────────────────────────────────────── */
function HowItWorks() {
  const steps = [
    { n: '01', t: 'Describe', body: 'Plain language. Target areas, orientations, codes, program. No templates, no wizards.' },
    { n: '02', t: 'Draft',    body: 'Orthographic floor plan, elevation stubs, and a layered .dwg are produced in under a second.' },
    { n: '03', t: 'Validate', body: 'Every line is checked against DIN, EN, and your studio\'s own rule pack.' },
    { n: '04', t: 'Export',   body: 'Ship .dwg, .dxf, .ifc, .pdf — or paste the AutoLISP straight into AutoCAD.' },
  ];
  return (
    <section style={{ padding: '80px 28px' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div className="reveal" style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', marginBottom: 48 }}>
          <div>
            <div className="eyebrow">02 · METHOD</div>
            <h2 className="display-lg" style={{ marginTop: 14 }}>Four moves,<br />one drawing.</h2>
          </div>
          <p className="muted" style={{ maxWidth: 400, fontSize: 14 }}>
            ArchiVox replaces the blank canvas with a grammar. You narrate intent; the instrument drafts, checks, and hands back a file your team already knows how to open.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
          {steps.map((s, i) => (
            <div key={i} className="panel-2 reveal" style={{ padding: 24, minHeight: 200, position: 'relative' }}>
              <div className="mono-label">{s.n}</div>
              <div className="font-display" style={{ fontSize: 32, marginTop: 14 }}>{s.t}</div>
              <p className="muted" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.55 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Metrics ──────────────────────────────────────────────────────────── */
function MetricStrip() {
  const stats: [string, string][] = [
    ['94%',   'of drafts pass code validation on first pass'],
    ['32×',   'faster than traditional plan-to-DWG workflows'],
    ['4,218', 'studios drafting in ArchiVox'],
    ['0.94s', 'median plan generation time'],
  ];
  return (
    <section className="reveal" style={{ padding: '80px 28px' }}>
      <div style={{
        maxWidth: 1320, margin: '0 auto',
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        border: '1px solid var(--border-subtle)', borderRadius: 14,
        overflow: 'hidden', background: 'rgb(var(--panel-rgb))',
      }}>
        {stats.map(([n, label], i) => (
          <div key={i} style={{ padding: '36px 28px', borderLeft: i === 0 ? 'none' : '1px solid var(--border-subtle)', position: 'relative' }}>
            <div className="font-display" style={{ fontSize: 56, lineHeight: 1, color: 'var(--accent-fg)' }}>{n}</div>
            <div className="muted" style={{ marginTop: 14, fontSize: 13, maxWidth: 220 }}>{label}</div>
            <div className="mono-label" style={{ position: 'absolute', top: 14, right: 16 }}>{String(i + 1).padStart(2, '0')}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Validation table ─────────────────────────────────────────────────── */
function ValidationTable() {
  const rows = [
    { id: 'DIN-18040-2 §5.3.2', msg: 'Bathroom turning circle Ø 1500mm', status: 'pass' },
    { id: 'DIN-18040-2 §5.5.1', msg: 'Min. corridor width 1200mm', status: 'pass' },
    { id: 'EN 12464-1',         msg: 'Kitchen task-area illuminance ≥ 500lx', status: 'pass' },
    { id: 'AV/ORIENT',          msg: 'Living-room aperture bearing 183°S', status: 'pass' },
    { id: 'DIN-4109',           msg: "Party wall Rw',res ≥ 53dB — missing mass spec", status: 'warn' },
    { id: 'AV/CIRC',            msg: 'Bed-03 ingress requires passage via bath envelope', status: 'fail' },
  ];
  return (
    <div className="panel" style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="mono-label">VALIDATION · 06 RULES · 04 PASS · 01 WARN · 01 FAIL</div>
      </div>
      {rows.map((r, i) => {
        const color = r.status === 'pass' ? 'var(--accent-fg)' : r.status === 'warn' ? '#E0B85A' : '#E07070';
        return (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '200px 1fr auto',
            gap: 16, padding: '12px 18px',
            borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
            alignItems: 'center',
          }}>
            <div className="mono-label">{r.id}</div>
            <div style={{ fontSize: 13.5 }}>{r.msg}</div>
            <div className="chip" style={{ borderColor: 'transparent', background: `color-mix(in oklab, ${color} 12%, transparent)`, color }}>
              <span className="dot" style={{ background: color }} />{r.status.toUpperCase()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Principles / Capabilities ────────────────────────────────────────── */
function Principles() {
  return (
    <section style={{ padding: '80px 28px', background: 'rgb(var(--panel-rgb))', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div className="eyebrow reveal">03 · CAPABILITIES</div>
        <h2 className="display-lg reveal" style={{ marginTop: 14, marginBottom: 56, maxWidth: 900 }}>
          Not a chatbot — <em>an instrument.</em>
        </h2>

        {/* Feature row 1 */}
        <div className="reveal" style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: 48, padding: '64px 0', borderTop: '1px solid var(--border-subtle)' }}>
          <div>
            <div className="mono-label">01 · THE EDITOR</div>
            <h3 className="display-lg" style={{ margin: '18px 0' }}>An orthographic canvas, not a conversation.</h3>
            <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 420 }}>
              Every generation lands on a real drawing. Rotate walls, nudge doorways with arrow keys, split a room by dragging a line.
            </p>
          </div>
          <div className="panel" style={{ padding: 28, aspectRatio: '16/9.5' }}>
            <BlueprintPlan rooms={DEMO_APARTMENT} width={720} height={420} drawOnReveal />
          </div>
        </div>

        {/* Feature row 2 */}
        <div className="reveal" style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: 48, padding: '64px 0', borderTop: '1px solid var(--border-subtle)' }}>
          <div>
            <div className="mono-label">02 · THE VALIDATOR</div>
            <h3 className="display-lg" style={{ margin: '18px 0' }}>Every rule your studio argues about, checked continuously.</h3>
            <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 420 }}>
              DIN, EN, local amendments, fire egress, accessibility turning circles, daylight factors. Load your studio's rule pack.
            </p>
          </div>
          <ValidationTable />
        </div>
      </div>
    </section>
  );
}

/* ── Pricing ──────────────────────────────────────────────────────────── */
function PricingTile({ name, price, period, tagline, features, cta, accent }: {
  name: string; price: string; period: string; tagline: string;
  features: string[]; cta: string; accent?: boolean;
}) {
  return (
    <div className="panel reveal" style={{ padding: 28, position: 'relative', overflow: 'hidden', borderColor: accent ? 'var(--accent-fg)' : undefined, borderWidth: accent ? 1.5 : 1 }}>
      {accent && (
        <div style={{ position: 'absolute', top: 16, right: 16 }} className="chip accent">
          <span className="dot" />most studios
        </div>
      )}
      <div className="mono-label">{name}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 18 }}>
        <div className="font-display" style={{ fontSize: 64, lineHeight: 0.9, color: accent ? 'var(--accent-fg)' : 'inherit' }}>{price}</div>
        <div className="muted" style={{ fontSize: 13 }}>{period}</div>
      </div>
      <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>{tagline}</div>
      <div className="sep" style={{ margin: '20px 0' }} />
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
            <span style={{ color: 'var(--accent-fg)', flexShrink: 0, marginTop: 2 }}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link href="/auth/signup" className={`btn ${accent ? 'btn-primary' : 'btn-ghost'}`}
        style={{ width: '100%', marginTop: 24, padding: '12px 18px' }}>
        {cta} →
      </Link>
    </div>
  );
}

function Pricing() {
  return (
    <section id="pricing" style={{ padding: '80px 28px' }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div className="reveal" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, marginBottom: 48 }}>
          <div>
            <div className="eyebrow">04 · PLANS</div>
            <h2 className="display-lg" style={{ marginTop: 14 }}>One instrument.<br />Three workbenches.</h2>
          </div>
          <p className="muted" style={{ fontSize: 14, alignSelf: 'end' }}>
            Billed annually. All tiers include .dwg / .dxf / .ifc export, unlimited validation runs, and 12-month version history. Students draft free.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
          <PricingTile name="STUDENT" price="€0" period="/ forever"
            tagline="For anyone with a .edu in their email."
            features={['Unlimited drafts, .dwg export', 'DIN 18040 validation', '3 concurrent projects', 'Watermarked PDF sheets']}
            cta="Verify .edu address" />
          <PricingTile name="STUDIO" price="€29" period="/ seat / month"
            tagline="Small practices drafting across 10–50 projects a year."
            features={['Everything in Student, plus:', 'Unlimited projects & collaborators', 'Custom rule packs', 'AutoLISP + parametric blocks', 'Shared component library']}
            cta="Start 14-day trial" accent />
          <PricingTile name="ATELIER" price="€2,400" period="/ year"
            tagline="Studios of 25+, or regulated practice."
            features={['Everything in Studio, plus:', 'SSO / SAML + SCIM provisioning', 'On-prem / EU-sovereign deployment', 'Dedicated validator engineer', 'BIM Level-2 IFC-4 handoff']}
            cta="Request a call" />
        </div>
      </div>
    </section>
  );
}

/* ── Final CTA ────────────────────────────────────────────────────────── */
function FinalCTA() {
  return (
    <section style={{ padding: '120px 28px', position: 'relative', overflow: 'hidden', borderTop: '1px solid var(--border-subtle)' }}>
      <AuroraBackground subtle />
      <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <div className="eyebrow reveal">05 · BEGIN</div>
        <h2 className="reveal" style={{
          fontFamily: 'var(--font-display)', fontWeight: 400,
          fontSize: 'clamp(56px, 9vw, 132px)', lineHeight: 0.98,
          letterSpacing: '-0.028em', margin: '22px 0',
        }}>
          Your first plan<br />is ready before<br />your <em style={{ color: 'var(--accent-fg)', fontStyle: 'italic' }}>coffee</em> is.
        </h2>
        <p className="muted reveal" style={{ fontSize: 17, maxWidth: 560, margin: '0 auto' }}>
          Free for students with a .edu address. Fourteen days, no card, for your studio.
        </p>
        <div className="reveal" style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 40 }}>
          <Link href="/plugin" className="btn btn-primary" style={{ padding: '14px 24px', fontSize: 14 }}>
            Download the plugin →
          </Link>
          <Link href="/project/demo/editor" className="btn btn-ghost" style={{ padding: '14px 20px', fontSize: 13 }}>
            ▶ Take the tour
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Footer ───────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border-subtle)', padding: '60px 28px 40px',
      display: 'grid', gridTemplateColumns: '1.4fr repeat(4, 1fr)', gap: 40,
    }}>
      <div>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 4, background: 'rgb(var(--text-rgb))', color: 'rgb(var(--bg-rgb))', fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 17 }}>A</div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>Archivox</span>
        </Link>
        <p className="muted" style={{ marginTop: 16, maxWidth: 260, fontSize: 13 }}>Your brief, rendered as a plan.</p>
        <div className="mono-label" style={{ marginTop: 28 }}>© 2026 ARCHIVOX LABS, GMBH</div>
      </div>
      {[
        { h: 'Product',   items: [['Studio', '/project/demo/editor'], ['Dashboard', '/dashboard'], ['Export', '/project/demo/export']] },
        { h: 'Resources', items: [['Documentation', '/'], ['Templates', '/']] },
        { h: 'Practice',  items: [['For students', '/auth/signup'], ['For studios', '/auth/signup']] },
        { h: 'Company',   items: [['Sign in', '/signin'], ['Contact', '/']] },
      ].map(col => (
        <div key={col.h}>
          <div className="mono-label" style={{ marginBottom: 14 }}>{col.h}</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {col.items.map(([t, to]) => (
              <li key={t}><Link href={to} className="muted" style={{ fontSize: 13 }}>{t}</Link></li>
            ))}
          </ul>
        </div>
      ))}
    </footer>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <>
      <RevealObserver />
      <MarketingNav />
      <Hero />
      <HeroPlanSection />
      <LogoStrip />
      <HowItWorks />
      <MetricStrip />
      <Principles />
      <Pricing />
      <FinalCTA />
      <Footer />
    </>
  );
}
