'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AdminNav({ sections }: { sections: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="no-print -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 rounded-xl border border-line bg-white p-1 sm:min-w-0">
        {sections.map((s) => {
          const active = s.href === '/admin' ? pathname === '/admin' : pathname.startsWith(s.href);
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-1 sm:text-center ${
                active ? 'bg-brand text-white' : 'text-ink-soft hover:bg-paper'
              }`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
