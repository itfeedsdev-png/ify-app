/**
 * Public marketing landing page served at `/`.
 *
 * Visual system follows the Linear "midnight precision instrument" reference:
 * near-black surfaces, hairline borders, Inter at 400-510 weights, tight
 * tracking, and a single chromatic accent (#e4f222) used only for the primary
 * action.
 *
 * Motion: Lenis smooth scrolling drives the page, sections reveal on entry via
 * IntersectionObserver, and a hairline progress bar tracks scroll position.
 * All motion is disabled under `prefers-reduced-motion`.
 */

import Lenis from "lenis";
import type { ReactNode } from "react";
import "lenis/dist/lenis.css";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const DOCS_URL = "/docs/";
const REPO_URL = "https://github.com/DaKheera47/job-ops";

/**
 * When the landing page is deployed on its own domain (e.g. Vercel), set
 * `VITE_APP_URL` to the main app origin so CTAs open the real app instead of
 * navigating inside the static landing bundle. Left unset (monolith build) it
 * keeps using react-router `Link`.
 */
const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined)?.replace(
  /\/$/,
  "",
);

function AppLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  if (APP_URL) {
    return (
      <a href={`${APP_URL}${to}`} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}

const SHELL = "mx-auto w-full max-w-[1200px] px-6";
const HAIRLINE = "border border-[#23252a]";
const CARD_INSET = { boxShadow: "rgb(35, 37, 42) 0px 0px 0px 1px inset" };

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ─── Motion ───────────────────────────────────────────────────────────────── */

/** Smooth scrolling for the whole page + normalized scroll progress [0..1]. */
function useLenis(): number {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    const lenis = new Lenis({ duration: 1.1, wheelMultiplier: 0.9 });
    let frame = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    };
    frame = requestAnimationFrame(raf);
    lenis.on("scroll", ({ progress: p }: { progress: number }) =>
      setProgress(p),
    );

    // Anchor links (#features, #how) route through Lenis for eased jumps.
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.(
        'a[href^="#"]',
      ) as HTMLAnchorElement | null;
      const id = anchor?.getAttribute("href")?.slice(1);
      const target = id && document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      lenis.scrollTo(target, { offset: -72 });
    };
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return progress;
}

/** Fades and lifts its children into place the first time they enter view. */
function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.dataset.shown = "true";
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.shown = "true";
        observer.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`translate-y-6 opacity-0 transition-[opacity,transform] duration-700 ease-out will-change-transform data-[shown=true]:translate-y-0 data-[shown=true]:opacity-100 motion-reduce:translate-y-0 motion-reduce:opacity-100 ${className}`}
    >
      {children}
    </div>
  );
}

/* ─── Primitives ───────────────────────────────────────────────────────────── */

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-[#62666d]">
      {children}
    </p>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/5 px-3 py-1 text-[12px] text-[#d0d6e0]">
      {children}
    </span>
  );
}

function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="rounded-[12px] bg-[#0f1011] p-3 sm:p-6" style={CARD_INSET}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="w-full rounded-[6px] border border-[#23252a]"
      />
    </div>
  );
}

function PrimaryCta({ children }: { children: React.ReactNode }) {
  return (
    <AppLink
      to="/sign-in?mode=signup"
      className="rounded-[6px] bg-[#e4f222] px-4 py-[10px] text-[14px] tracking-[-0.011em] text-[#08090a] transition-opacity hover:opacity-90 [font-weight:510]"
    >
      {children}
    </AppLink>
  );
}

/** One full-viewport band with its content vertically centered. */
function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      className="flex min-h-svh scroll-mt-14 flex-col justify-center py-24"
    >
      <div className={SHELL}>{children}</div>
    </section>
  );
}

/* ─── Content ──────────────────────────────────────────────────────────────── */

const STATS = [
  { value: "5", label: "pipeline stages" },
  { value: "8+", label: "LLM providers" },
  { value: "1", label: "container to self-host" },
  { value: "0", label: "data leaving your box" },
];

const SECTIONS = [
  {
    id: "orchestrator",
    eyebrow: "Orchestrator",
    title: "Every job in one state machine",
    body: "Discovered, ready, applied, in progress, skipped. The pipeline crawls your sources, scores each posting against your resume, and only surfaces what is worth your afternoon. Fit assessment and score come attached, so triage is a glance instead of a read.",
    points: [
      "Fuzzy search over title, company and location with ⌘K",
      "Multi-select and bulk actions across any tab",
      "Keyboard-first: skip, promote, mark applied without the mouse",
    ],
    image: "/landing/in-progress-board.png",
    alt: "ify app in-progress board showing application stages",
  },
  {
    id: "ghostwriter",
    eyebrow: "Ghostwriter",
    title: "A tailored resume per posting",
    body: "Ghostwriter rewrites your summary, picks the projects that actually match the description, and renders a PDF from your confirmed resume document. The source of truth stays one document in Resume Studio — every application is a view of it, not a fork.",
    points: [
      "Tailored summary and project selection per job",
      "PDF generation and regeneration on demand",
      "Bring your own model: OpenRouter, OpenAI, Anthropic, Ollama, LM Studio",
    ],
    image: "/landing/settings-model-section.png",
    alt: "ify app model configuration settings",
    reverse: true,
  },
  {
    id: "tracking",
    eyebrow: "Post-application tracking",
    title: "The inbox reads itself",
    body: "Connect Gmail and replies get classified into the events that matter — screening, interview, offer, rejection. Review the ones the classifier is unsure about, then push confirmed updates onto the in-progress board.",
    points: [
      "Automatic Gmail sync or fully manual event logging",
      "In-progress board for everything past the apply button",
      "Tracer links that tell you when a posting goes cold",
    ],
    image: "/landing/tracking-inbox.png",
    alt: "ify app tracking inbox with classified email events",
  },
  {
    id: "analytics",
    eyebrow: "Analytics",
    title: "A funnel, not a feeling",
    body: "Applications over time, funnel conversion, and where candidacies stall. Enough signal to change what you apply to next week instead of guessing at the end of the month.",
    points: [
      "Applications and funnel graphs on the overview",
      "Watchlist for companies you want first crack at",
      "Visa sponsor lookup wired into the job detail",
    ],
    image: "/landing/overview-dashboard.png",
    alt: "ify app overview dashboard",
    reverse: true,
  },
];

const STEPS = [
  {
    n: "01",
    title: "Import your resume",
    body: "Onboarding parses it, shows you the result, and keeps it as the primary context for scoring and tailoring.",
  },
  {
    n: "02",
    title: "Run the pipeline",
    body: "Pick sources and search terms. Extractors crawl, the model scores, and ready jobs land at the top of the board.",
  },
  {
    n: "03",
    title: "Apply and track",
    body: "Ghostwrite, download the PDF, mark applied. From there the inbox and the in-progress board carry it.",
  },
];

const CAPABILITIES = [
  ["Self-hosted", "One Docker container, SQLite on your disk."],
  ["Bring your own key", "OpenRouter, OpenAI, Anthropic, GLM, Gemini, Ollama."],
  ["Webhooks", "Fire on applied and stage changes into anything."],
  ["Keyboard shortcuts", "Full board control without leaving home row."],
  ["Visa sponsors", "Sponsor lookup attached to each posting."],
  ["Backups", "Scheduled snapshots with retention and restore."],
];

const NAV_LINKS: Array<[string, string]> = [
  ["Features", "#features"],
  ["How it works", "#how"],
  ["Self-hosting", DOCS_URL],
  ["GitHub", REPO_URL],
];

/* ─── Page ─────────────────────────────────────────────────────────────────── */

export const LandingPage: React.FC = () => {
  const progress = useLenis();

  return (
    <div
      className="min-h-screen bg-[#08090a] text-[#d0d6e0] antialiased"
      style={{
        fontFamily: "Inter, Geist, ui-sans-serif, system-ui, sans-serif",
        fontFeatureSettings: '"cv01" on, "ss03" on, "zero" on',
      }}
    >
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[#23252a] bg-[#08090a]/80 backdrop-blur">
        <nav className={`${SHELL} flex h-14 items-center justify-between`}>
          <div className="flex items-center gap-2">
            <img src="/favicon.png" alt="" className="h-5 w-5 rounded-[4px]" />
            <span className="text-[16px] text-white [font-weight:510]">
              ify app
            </span>
          </div>

          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map(([label, href]) => (
              <a
                key={label}
                href={href}
                className="px-3 py-2 text-[13px] text-[#d0d6e0] hover:underline"
              >
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <AppLink
              to="/sign-in"
              className="px-3 py-2 text-[13px] text-[#d0d6e0] hover:underline"
            >
              Sign in
            </AppLink>
            <AppLink
              to="/sign-in?mode=signup"
              className="rounded-full bg-white px-4 py-2 text-[13px] text-[#08090a] [font-weight:510]"
            >
              Get started
            </AppLink>
          </div>
        </nav>
        {/* Scroll progress hairline */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-[-1px] h-px origin-left bg-[#e4f222]"
          style={{ transform: `scaleX(${progress})` }}
        />
      </header>

      <main>
        {/* Hero — fills the first viewport, screenshot bleeds off the bottom */}
        <section className="relative flex min-h-svh flex-col justify-between overflow-hidden pt-24 md:h-svh md:min-h-[680px] md:pt-28">
          <div className={SHELL}>
            <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
              <Reveal className="max-w-[760px]">
                <div className="mb-6 flex flex-wrap items-center gap-2">
                  <Pill>Self-hosted</Pill>
                  <Pill>Bring your own model</Pill>
                </div>
                <h1 className="text-[clamp(40px,7vw,64px)] leading-[1] tracking-[-0.022em] text-white [font-weight:510]">
                  Your job search,
                  <br />
                  run like a pipeline.
                </h1>
                <p className="mt-6 max-w-[560px] text-[17px] leading-[1.6] text-[#8a8f98]">
                  ify app discovers roles, scores them against your resume,
                  ghostwrites a tailored application, and tracks every reply —
                  in one orchestrator you run yourself.
                </p>
              </Reveal>

              <Reveal delay={120} className="shrink-0">
                <div className="flex items-center gap-3">
                  <PrimaryCta>Start free</PrimaryCta>
                  <a
                    href={DOCS_URL}
                    className={`${HAIRLINE} rounded-[6px] px-3 py-2 text-[13px] text-[#d0d6e0] transition-colors hover:border-[#383b3f]`}
                  >
                    Read the docs →
                  </a>
                </div>
              </Reveal>
            </div>
          </div>

          {/* Product screenshot on the atmospheric floor */}
          <Reveal delay={200} className={`${SHELL} relative mt-12 shrink-0`}>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-6 bottom-0 z-10 h-1/2"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(8,9,10,0) 10%, rgba(208,214,224,0.10) 100%)",
              }}
            />
            <Shot
              src="/landing/orchestrator-jobs.png"
              alt="ify app orchestrator board"
            />
          </Reveal>
        </section>

        {/* Feature sections — one focal point per viewport */}
        <div id="features">
          {SECTIONS.map((s) => (
            <Section key={s.id} id={s.id}>
              <div
                className={`flex flex-col gap-12 lg:items-center ${
                  s.reverse ? "lg:flex-row-reverse" : "lg:flex-row"
                }`}
              >
                <Reveal className="lg:w-[42%]">
                  <Eyebrow>{s.eyebrow}</Eyebrow>
                  <h2 className="mt-4 text-[clamp(28px,4vw,32px)] leading-[1.13] tracking-[-0.022em] text-white [font-weight:510]">
                    {s.title}
                  </h2>
                  <p className="mt-4 text-[16px] leading-[1.5] text-[#8a8f98]">
                    {s.body}
                  </p>
                  <ul className="mt-6 flex flex-col gap-3">
                    {s.points.map((p) => (
                      <li
                        key={p}
                        className="flex gap-3 text-[15px] leading-[1.6] tracking-[-0.011em] text-[#d0d6e0]"
                      >
                        <span aria-hidden className="text-[#62666d]">
                          —
                        </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                </Reveal>
                <Reveal delay={120} className="lg:w-[58%]">
                  <Shot src={s.image} alt={s.alt} />
                </Reveal>
              </div>
            </Section>
          ))}
        </div>

        {/* How it works */}
        <Section id="how">
          <Reveal>
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-4 max-w-[640px] text-[clamp(28px,4vw,32px)] leading-[1.13] tracking-[-0.022em] text-white [font-weight:510]">
              Three steps, then it runs without you.
            </h2>
          </Reveal>

          <div className="mt-12 grid gap-px overflow-hidden rounded-[12px] bg-[#23252a] md:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal key={step.n} delay={i * 100} className="bg-[#0f1011]">
                <div className="h-full p-6">
                  <div className="font-mono text-[12px] text-[#e4f222]">
                    {step.n}
                  </div>
                  <h3 className="mt-4 text-[17px] text-white [font-weight:510]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-[1.6] tracking-[-0.011em] text-[#8a8f98]">
                    {step.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="mt-16 flex flex-wrap items-baseline gap-x-16 gap-y-8">
            {STATS.map((s, i) => (
              <Reveal key={s.label} delay={i * 80}>
                <div className="font-mono text-[32px] leading-none text-white">
                  {s.value}
                </div>
                <div className="mt-2 text-[13px] text-[#62666d]">{s.label}</div>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* Command palette callout */}
        <Section id="search">
          <Reveal>
            <div
              className="overflow-hidden rounded-[12px] bg-[#0f1011] p-6 sm:p-10"
              style={CARD_INSET}
            >
              <div className="flex flex-col gap-10 lg:flex-row lg:items-center">
                <div className="lg:w-[38%]">
                  <Eyebrow>Search</Eyebrow>
                  <h2 className="mt-4 text-[24px] leading-[1.33] tracking-[-0.012em] text-white [font-weight:510]">
                    Everything is one keystroke away
                  </h2>
                  <p className="mt-4 text-[15px] leading-[1.6] tracking-[-0.011em] text-[#8a8f98]">
                    Open the palette with{" "}
                    <kbd className="rounded-[4px] bg-white/5 px-1.5 py-0.5 font-mono text-[12px] text-[#d0d6e0]">
                      ⌘K
                    </kbd>
                    , fuzzy match across every posting, and scope results with{" "}
                    <code className="font-mono text-[13px] text-[#d0d6e0]">
                      @status
                    </code>{" "}
                    locks.
                  </p>
                </div>
                <div className="lg:w-[62%]">
                  <img
                    src="/landing/job-search-bar.png"
                    alt="ify app job search palette"
                    loading="lazy"
                    className="w-full rounded-[6px] border border-[#23252a]"
                  />
                </div>
              </div>
            </div>
          </Reveal>
        </Section>

        {/* Capabilities */}
        <Section>
          <Reveal>
            <Eyebrow>Also included</Eyebrow>
          </Reveal>
          <div className="mt-10 grid gap-x-16 gap-y-10 md:grid-cols-2">
            {CAPABILITIES.map(([title, body], i) => (
              <Reveal key={title} delay={(i % 2) * 80}>
                <div className="border-t border-[#23252a] pt-5">
                  <h3 className="text-[15px] text-white [font-weight:510]">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-[15px] leading-[1.6] tracking-[-0.011em] text-[#8a8f98]">
                    {body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* Closing CTA — shares the last viewport with the footer */}
        <section className="flex min-h-svh flex-col pt-24">
          <div className={`${SHELL} my-auto`}>
            <Reveal>
              <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between">
                <h2 className="max-w-[640px] text-[clamp(32px,5vw,48px)] leading-[1] tracking-[-0.022em] text-white [font-weight:510]">
                  Stop managing your job search in a spreadsheet.
                </h2>
                <div className="flex shrink-0 items-center gap-3">
                  <PrimaryCta>Start free</PrimaryCta>
                  <a
                    href={REPO_URL}
                    className={`${HAIRLINE} rounded-[6px] px-3 py-2 text-[13px] text-[#d0d6e0] transition-colors hover:border-[#383b3f]`}
                  >
                    Self-host it →
                  </a>
                </div>
              </div>
            </Reveal>
          </div>

          <footer className="border-t border-[#23252a]">
            <div
              className={`${SHELL} flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between`}
            >
              <div className="flex items-center gap-2">
                <img
                  src="/favicon.png"
                  alt=""
                  className="h-4 w-4 rounded-[4px]"
                />
                <span className="text-[13px] text-[#8a8f98]">
                  ify app — {new Date().getFullYear()}
                </span>
              </div>
              <div className="flex items-center gap-6 text-[13px] text-[#8a8f98]">
                <a href={DOCS_URL} className="hover:text-[#d0d6e0]">
                  Docs
                </a>
                <a href={REPO_URL} className="hover:text-[#d0d6e0]">
                  GitHub
                </a>
                <AppLink to="/sign-in" className="hover:text-[#d0d6e0]">
                  Sign in
                </AppLink>
              </div>
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
};
