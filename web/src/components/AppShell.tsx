"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  FlaskConical,
  Home,
  Menu,
  Sliders,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/simulator", label: "Simulator", icon: Zap },
  { href: "/research", label: "Research Results", icon: FlaskConical },
  { href: "/optimizer", label: "Live Optimizer", icon: Sliders },
  { href: "/docs", label: "Documentation", icon: BookOpen },
];

function isRouteActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-between p-5">
      <div>
        <Link
          href="/"
          onClick={onNavigate}
          className="mb-6 flex items-center gap-2.5 border-b-2 border-[#c9c2b8] pb-4 no-underline"
        >
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-[#213448] bg-[#0a7c6e] font-display text-lg font-bold text-white shadow-[2px_2px_0px_0px_rgba(33,52,72,0.25)]"
          >
            ₿
          </span>
          <div className="min-w-0">
            <div className="font-display text-base font-bold leading-tight tracking-tight text-[#213448]">
              BTC Strategy Lab
            </div>
            <div className="font-label text-[11px] font-medium uppercase tracking-wider text-[#547792]">
              On-Chain Research
            </div>
          </div>
        </Link>

        <nav aria-label="Primary navigation" className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isRouteActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center gap-3 border-l-[3px] px-3.5 py-2.5 font-display text-[0.9rem] no-underline transition-colors",
                  active
                    ? "border-[#0a7c6e] bg-[#0a7c6e]/10 font-bold text-[#0a7c6e]"
                    : "border-transparent font-medium text-[#213448] hover:border-[#0a7c6e]/35 hover:bg-[#0a7c6e]/5 hover:text-[#0a7c6e]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="pt-4">
        <a
          href="https://github.com/bennypepper/poly-strategy-lab"
          target="_blank"
          rel="noopener noreferrer"
          className="group mb-4 block border-2 border-[#c9c2b8] bg-[#fff8f1] p-3 no-underline shadow-[3px_3px_0px_0px_rgba(33,52,72,0.12)] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-[#0a7c6e] hover:shadow-[4px_4px_0px_0px_rgba(10,124,110,0.2)]"
        >
          <div className="flex items-center justify-between font-label text-[10px] font-bold uppercase tracking-wider text-[#547792]">
            <span>Multi-Asset V2</span>
            <ArrowUpRight
              className="h-3.5 w-3.5 text-[#0a7c6e] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              aria-hidden="true"
            />
          </div>
          <div className="mt-0.5 font-display text-xs font-bold text-[#213448] group-hover:text-[#0a7c6e]">
            Poly Strategy Lab
          </div>
        </a>

        <hr className="my-4 border-t-2 border-[#c9c2b8]" />

        <footer className="text-center font-body text-xs leading-relaxed text-[#547792]">
          <div>
            Built with ☕ by{" "}
            <a
              href="https://github.com/bennypepper"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#0a7c6e] no-underline hover:underline"
            >
              Benedict Pepper
            </a>
          </div>
          <div className="mt-1 font-label text-[11px] text-[#547792]">
            Ma Chung University · PKL Research © 2026
          </div>
        </footer>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:border-r-2 lg:border-[#c9c2b8] lg:bg-[#ede8e0]">
        <SidebarContent pathname={pathname} />
      </aside>

      {/* Mobile Sticky Top Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b-2 border-[#c9c2b8] bg-[#ede8e0] px-4 py-3 lg:hidden">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-base font-bold text-[#213448] no-underline"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center border-2 border-[#213448] bg-[#0a7c6e] text-sm font-bold text-white"
          >
            ₿
          </span>
          <span>BTC Strategy Lab</span>
        </Link>

        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileOpen}
          className="brutal-btn px-2.5 py-1.5"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div
            className="fixed inset-0 bg-[#213448]/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r-2 border-[#c9c2b8] bg-[#ede8e0] shadow-[6px_0px_0px_0px_rgba(33,52,72,0.2)]">
            <div className="flex justify-end px-4 pt-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="brutal-btn px-2 py-1"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <SidebarContent
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-8 lg:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
