"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Radio,
  Sliders,
  WifiOff,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { RegressionBandsChart } from "@/components/charts/RegressionBandsChart";
import { useMarketData } from "@/hooks/useMarketData";
import { formatCurrency } from "@/lib/format";
import type { ColumnarDataset, ResearchSummary } from "@/lib/types";

export interface HomeClientProps {
  initialData: ColumnarDataset;
  research: ResearchSummary;
}

interface ZoneBadge {
  label: string;
  color: string;
}

interface NavCardConfig {
  href: string;
  title: string;
  description: string;
  cta: string;
  icon: LucideIcon;
}

const NAV_CARDS: readonly NavCardConfig[] = [
  {
    href: "/simulator",
    title: "Strategy Simulator",
    description:
      "Run custom backtests with any parameters on 14 years of Bitcoin history (2012–2026)",
    cta: "Open Simulator →",
    icon: Zap,
  },
  {
    href: "/research",
    title: "Research Results",
    description:
      "Explore Phase 3 optimization outcomes, including academic validation and maximum exploration scenarios",
    cta: "View Research →",
    icon: BarChart3,
  },
  {
    href: "/optimizer",
    title: "Live Parameters",
    description:
      "Inspect live-aligned optimal parameters and how independent regression prevents CBBI index drift",
    cta: "View Parameters →",
    icon: Sliders,
  },
  {
    href: "/docs",
    title: "Documentation",
    description:
      "Methodology, indicator glossary, metric definitions, and full research disclaimer",
    cta: "Read Docs →",
    icon: BookOpen,
  },
];

function getZoneBadge(indexValue: number): ZoneBadge {
  if (indexValue < 15) {
    return { label: "EXTREME UNDERVALUED", color: "#1a73e8" };
  }
  if (indexValue < 35) {
    return { label: "UNDERVALUED", color: "#188038" };
  }
  if (indexValue < 65) {
    return { label: "NEUTRAL", color: "#e37400" };
  }
  if (indexValue < 85) {
    return { label: "OVERVALUED", color: "#d93025" };
  }
  return { label: "EXTREME OVERVALUED", color: "#d93025" };
}

function getLatestValidMetrics(dataset: ColumnarDataset): {
  latestSignal: number;
  latestPrice: number;
  totalDays: number;
  minDate: string;
  maxDate: string;
} {
  const len = dataset.dates.length;
  const minDate = dataset.dates[0] ?? "2012-01-01";
  const maxDate = dataset.dates[len - 1] ?? minDate;

  let latestSignal = 50;
  for (let i = len - 1; i >= 0; i -= 1) {
    const val = dataset.trolololo[i];
    if (val !== null && val !== undefined && Number.isFinite(val)) {
      latestSignal = val;
      break;
    }
  }

  let latestPrice = 0;
  for (let i = len - 1; i >= 0; i -= 1) {
    const price = dataset.btc_close[i];
    if (price !== undefined && Number.isFinite(price) && price > 0) {
      latestPrice = price;
      break;
    }
  }

  return {
    latestSignal,
    latestPrice,
    totalDays: len,
    minDate,
    maxDate,
  };
}

export function HomeClient({ initialData, research }: HomeClientProps) {
  const { data, isLive, isLoadingLive, lastDate } = useMarketData(initialData);

  const metrics = useMemo(() => getLatestValidMetrics(data), [data]);
  const zone = useMemo(
    () => getZoneBadge(metrics.latestSignal),
    [metrics.latestSignal]
  );

  const markerPercent = Math.min(Math.max(metrics.latestSignal, 0), 100);
  const coverageEnd = lastDate || metrics.maxDate;
  const trialsFormatted =
    research.metadata.total_trials_per_run.toLocaleString("en-US");

  return (
    <div className="space-y-8">
      {/* ── Hero Header ── */}
      <header>
        <h1 className="page-title">₿ BTC Strategy Lab</h1>
        <p className="page-subtitle mt-1.5">
          Bitcoin backtesting simulator powered by on-chain indicator analysis
          {" · "}Academic research tool
        </p>
        <div className="hero-tagline mt-4">
          Test, validate, and explore Bitcoin timing strategies using
          1.29&thinsp;M optimization trials and 14 years of on-chain data with
          zero lookahead bias.
        </div>
      </header>

      {/* ── 3 Dynamic Neo-Brutalist KPI Cards ── */}
      <section
        aria-label="Key market metrics"
        className="grid grid-cols-1 gap-5 md:grid-cols-3"
      >
        {/* Card 1: Regression Index */}
        <div className="brutal-card-static flex flex-col justify-between p-6">
          <div>
            <div className="metric-label">REGRESSION INDEX</div>
            <div className="mt-1 font-display text-[2.6rem] font-extrabold leading-none tracking-[-0.03em] text-[#213448]">
              {metrics.latestSignal.toFixed(1)}%
            </div>
            <div
              className="mt-3 inline-block px-3 py-1 font-label text-xs font-bold uppercase"
              style={{
                backgroundColor: `${zone.color}12`,
                color: zone.color,
                border: `2px solid ${zone.color}`,
                boxShadow: `2px 2px 0px 0px ${zone.color}40`,
              }}
            >
              {zone.label}
            </div>
          </div>

          <div className="mt-6">
            <div
              className="relative h-[6px] w-full border border-[#c9c2b8]"
              style={{
                background:
                  "linear-gradient(90deg, #1a73e8 0%, #188038 25%, #e37400 50%, #d93025 75%, #a50e0e 100%)",
              }}
            >
              <div
                aria-hidden="true"
                className="absolute -top-[5px] -ml-[2px] h-[14px] w-[4px] border border-[#213448] bg-white shadow-[1px_1px_0px_#213448]"
                style={{ left: `${markerPercent}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between font-label text-[0.65rem] font-semibold text-[#547792]">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* Card 2: BTC Price */}
        <div className="brutal-card-static flex flex-col justify-center p-6">
          <div className="metric-label">BTC PRICE</div>
          <div className="mt-1 font-display text-[2.6rem] font-extrabold leading-none tracking-[-0.03em] text-[#0a7c6e]">
            {formatCurrency(metrics.latestPrice)}
          </div>
          <div className="mt-2 font-body text-[0.95rem] font-medium text-[#547792]">
            Current market price
          </div>
        </div>

        {/* Card 3: Data Points */}
        <div className="brutal-card-static flex flex-col justify-center p-6">
          <div className="metric-label">DATA POINTS</div>
          <div className="mt-1 font-display text-[2.6rem] font-extrabold leading-none tracking-[-0.03em] text-[#d97706]">
            {metrics.totalDays.toLocaleString("en-US")}
          </div>
          <div className="mt-2 font-body text-[0.95rem] font-medium text-[#547792]">
            Since {metrics.minDate}
          </div>
        </div>
      </section>

      {/* ── 4 Equal-Height Navigation Cards ── */}
      <section
        aria-label="Platform sections"
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4"
      >
        {NAV_CARDS.map(({ href, title, description, cta, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group block h-full no-underline"
          >
            <div className="brutal-nav-card h-full">
              <div className="brutal-nav-card-icon">
                <Icon
                  className="h-6 w-6 text-[#0a7c6e]"
                  aria-hidden="true"
                />
              </div>
              <h2 className="font-display text-[1.12rem] font-bold tracking-tight text-[#213448]">
                {title}
              </h2>
              <p className="font-body text-[0.87rem] leading-relaxed text-[#547792]">
                {description}
              </p>
              <div className="brutal-nav-card-cta">{cta}</div>
            </div>
          </Link>
        ))}
      </section>

      {/* ── Logarithmic Regression Bands Chart ── */}
      <section aria-labelledby="regression-bands-heading" className="pt-2">
        <h2
          id="regression-bands-heading"
          className="font-display text-xl font-bold text-[#213448]"
        >
          Logarithmic Regression Bands
        </h2>
        <p className="mt-1 font-body text-sm text-[#547792]">
          Historical Bitcoin price plotted on a log scale with fitted
          logarithmic regression model bands (Top and Bottom).
        </p>
        <div className="brutal-card-static mt-3 p-3 sm:p-5">
          <RegressionBandsChart dataset={data} />
        </div>
      </section>

      <hr className="brutal-divider" />

      {/* ── Balanced 2-Column Research & Dataset Info Section ── */}
      <section className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Left Column: About + How it Works */}
        <div className="space-y-6">
          <div>
            <h3 className="font-display text-lg font-bold text-[#213448]">
              About This Research
            </h3>
            <p className="mt-2.5 max-w-[65ch] font-body text-[0.95rem] leading-[1.68] text-[#2d3f50]">
              This app is the interactive deliverable of an academic research
              project that asks:{" "}
              <strong>
                which Bitcoin on-chain indicator makes the best trading signal,
                and what are its optimal parameters?
              </strong>{" "}
              Ten indicators (9 CBBI sub-indicators including Pi Cycle Top, MVRV
              Z-Score, Puell Multiple, RUPL, Logarithmic Regression, plus the
              CBBI Confidence Score) were analyzed using Spearman correlation
              across 5 lag windows.
            </p>
            <p className="mt-3 max-w-[65ch] font-body text-[0.95rem] leading-[1.68] text-[#2d3f50]">
              The winner: <strong>Logarithmic Regression</strong> (Rainbow
              Chart), with a composite score of 0.6557 and Spearman{" "}
              &rho;&nbsp;=&nbsp;&minus;0.4261 at 90-day lag. This indicator is
              computed independently from BTC price data via Dynamic Channel
              Normalization, avoiding any dependency on third-party APIs.
            </p>
          </div>

          <div>
            <h3 className="font-display text-lg font-bold text-[#213448]">
              How the Simulator Works
            </h3>
            <ol className="mt-2.5 max-w-[65ch] list-decimal space-y-1.5 pl-5 font-body text-[0.95rem] leading-[1.7] text-[#2d3f50]">
              <li>
                <strong>Set a Buy Threshold</strong>: when Logarithmic
                Regression is at or below (<code>&le;</code>) this value, the
                strategy buys a fixed&nbsp;% of your cash
              </li>
              <li>
                <strong>Set a Sell Threshold</strong>: when Logarithmic
                Regression is at or above (<code>&ge;</code>) this value, the
                strategy sells a fixed&nbsp;% of your BTC
              </li>
              <li>
                <strong>Between thresholds</strong>: the strategy holds (no
                action)
              </li>
              <li>
                Execution happens at the{" "}
                <strong>next day&rsquo;s open price</strong> (T+1) to prevent
                lookahead bias
              </li>
            </ol>
          </div>
        </div>

        {/* Right Column: Dataset Information + Live/Offline Strip */}
        <div className="space-y-4">
          <h3 className="font-display text-lg font-bold text-[#213448]">
            Dataset Information
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="brutal-card-static p-4">
              <div className="metric-label">Data Coverage</div>
              <div className="font-display text-lg font-bold text-[#213448]">
                {metrics.minDate} &rarr; {coverageEnd}
              </div>
            </div>
            <div className="brutal-card-static p-4">
              <div className="metric-label">Total Trading Days</div>
              <div className="font-display text-lg font-bold text-[#213448]">
                {metrics.totalDays.toLocaleString("en-US")}
              </div>
            </div>
            <div className="brutal-card-static p-4">
              <div className="metric-label">Signal Indicator</div>
              <div className="font-display text-lg font-bold text-[#213448]">
                Logarithmic Regression Index
              </div>
            </div>
            <div className="brutal-card-static p-4">
              <div className="metric-label">Optimization Trials Run</div>
              <div className="font-display text-lg font-bold text-[#213448]">
                {trialsFormatted} &times; 2 scenarios
              </div>
            </div>
          </div>

          {isLive ? (
            <div className="brutal-info-strip border-l-4 border-l-[#0a7c6e] bg-[#edf4f7] text-[#213448]">
              <div className="flex items-center gap-2 font-display text-sm font-bold text-[#0a7c6e]">
                <Radio className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Live Data Connected</span>
              </div>
              <p className="mt-1 font-body text-sm leading-relaxed">
                Using latest data up to <strong>{coverageEnd}</strong>.
                Logarithmic Regression is computed independently from Yahoo
                Finance BTC prices.
              </p>
            </div>
          ) : isLoadingLive ? (
            <div className="brutal-info-strip border-l-4 border-l-[#547792] bg-[#edf4f7] text-[#213448]">
              <div className="flex items-center gap-2 font-display text-sm font-bold text-[#547792]">
                <Radio
                  className="h-4 w-4 shrink-0 animate-pulse"
                  aria-hidden="true"
                />
                <span>Syncing Live Market Feed…</span>
              </div>
              <p className="mt-1 font-body text-sm leading-relaxed">
                Displaying verified snapshot up to{" "}
                <strong>{coverageEnd}</strong> while checking Yahoo Finance for
                new daily bars.
              </p>
            </div>
          ) : (
            <div className="brutal-info-strip border-l-4 border-l-[#d97706] bg-[#fffbeb] text-[#78350f]">
              <div className="flex items-center gap-2 font-display text-sm font-bold text-[#d97706]">
                <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Offline Mode</span>
              </div>
              <p className="mt-1 font-body text-sm leading-relaxed">
                Live data fetch unavailable. Displaying static data frozen at{" "}
                <strong>{coverageEnd}</strong>.
              </p>
            </div>
          )}
        </div>
      </section>

      <hr className="brutal-divider" />

      {/* ── Disclaimer ── */}
      <aside aria-label="Research disclaimer" className="brutal-disclaimer">
        <div className="flex items-start gap-2.5">
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-[#dc2626]"
            aria-hidden="true"
          />
          <div>
            <strong>Disclaimer:</strong> BTC Strategy Lab is an academic
            research tool built for educational purposes. All results are based
            on historical backtesting only. Past performance does not guarantee
            future results. Nothing on this platform constitutes financial
            advice. Cryptocurrency trading involves substantial risk of loss.
            This tool was developed as part of undergraduate research (PKL 2026)
            and is not affiliated with CBBI.info or any financial institution.
          </div>
        </div>
      </aside>

      {/* ── Footer ── */}
      <footer className="pb-2 pt-4 text-center font-label text-xs text-[#547792]/75">
        BTC Strategy Lab &middot; Built on academic research &middot; Data
        source: cbbi.info + Yahoo Finance
      </footer>
    </div>
  );
}
