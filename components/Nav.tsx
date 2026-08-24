'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { NavItem } from '@/lib/auth/nav-items';

/**
 * Navigation adaptative.
 *
 * Sur ordinateur et tablette en paysage, une barre horizontale en tete.
 * Sur telephone et tablette en portrait etroit, une barre d'onglets en bas :
 * c'est la zone atteignable au pouce, et le praticien tient son appareil d'une
 * main pendant qu'il examine le patient de l'autre.
 *
 * Les entrees sont filtrees par les droits du compte. Ce filtrage est du
 * confort, pas une securite : chaque page revalide ses droits cote serveur.
 */

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function TopNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={isActive(pathname, n.href) ? 'page' : undefined}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            isActive(pathname, n.href)
              ? 'bg-brand-soft font-medium text-brand-dark'
              : 'text-ink-soft hover:bg-brand-soft hover:text-brand-dark'
          }`}
        >
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Navigation principale"
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="flex">
        {items.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <li key={n.href} className="flex-1">
              <Link
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[11px] transition ${
                  active ? 'font-semibold text-brand-dark' : 'text-ink-soft'
                }`}
              >
                <span aria-hidden className={`text-base leading-none ${active ? 'opacity-100' : 'opacity-60'}`}>
                  {n.icon}
                </span>
                {n.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// ------------------------------------------------------------- menu compte

export function UserMenu({
  fullName,
  roleLabel,
  organizationName,
}: {
  fullName: string;
  roleLabel: string;
  organizationName: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.push('/connexion');
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg border border-line bg-white px-2 py-1.5 text-left transition hover:bg-paper"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">
          {initials || '?'}
        </span>
        <span className="hidden min-w-0 lg:block">
          <span className="block max-w-[11rem] truncate text-xs font-semibold leading-tight">{fullName}</span>
          <span className="block max-w-[11rem] truncate text-[10px] leading-tight text-ink-soft">{roleLabel}</span>
        </span>
      </button>

      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-hidden onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1 w-64 rounded-xl border border-line bg-white p-1.5 shadow-lg"
          >
            <div className="border-b border-line px-2.5 pb-2 pt-1.5">
              <p className="truncate text-sm font-semibold">{fullName}</p>
              <p className="truncate text-xs text-ink-soft">{roleLabel}</p>
              {organizationName && <p className="truncate text-xs text-ink-soft">{organizationName}</p>}
            </div>
            <Link
              href="/compte"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-2.5 py-2 text-sm hover:bg-paper"
            >
              Mon compte et mes droits
            </Link>
            <button
              onClick={logout}
              disabled={busy}
              className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-danger hover:bg-danger-soft"
            >
              {busy ? 'Deconnexion...' : 'Se deconnecter'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
