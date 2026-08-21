'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Navigation adaptative.
 *
 * Sur ordinateur et tablette en paysage, une barre horizontale en tete.
 * Sur telephone et tablette en portrait etroit, une barre d'onglets en bas :
 * c'est la zone atteignable au pouce, et le praticien tient son appareil d'une
 * main pendant qu'il examine le patient de l'autre.
 */

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Tableau de bord', short: 'Accueil', icon: '▦' },
  { href: '/patients', label: 'Patients', short: 'Patients', icon: '⚇' },
  { href: '/consultations', label: 'Consultations', short: 'Consult.', icon: '◑' },
  { href: '/interop', label: 'Interoperabilite', short: 'Interop', icon: '⇄' },
  { href: '/audit', label: 'Journal', short: 'Journal', icon: '≡' },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function TopNav() {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-1 md:flex">
      {NAV_ITEMS.map((n) => (
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

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="flex">
        {NAV_ITEMS.map((n) => {
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
