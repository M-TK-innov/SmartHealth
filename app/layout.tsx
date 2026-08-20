import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'ParleDocteur — scribe medical IA',
  description:
    'Ecoute la consultation, structure les donnees cliniques, enrichit le dossier medical et prepare une ordonnance que le medecin valide. Interoperable FHIR R4 / HL7 v2 / DHIS2.',
};

const NAV = [
  { href: '/', label: 'Tableau de bord' },
  { href: '/patients', label: 'Patients' },
  { href: '/consultations', label: 'Consultations' },
  { href: '/interop', label: 'Interoperabilite' },
  { href: '/audit', label: 'Journal' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const facility = process.env.FACILITY_NAME || 'Structure de sante';
  return (
    <html lang="fr">
      <body>
        <header className="no-print sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-lg text-white">
                &#9673;
              </span>
              <span>
                <span className="block text-[15px] font-bold leading-none">ParleDocteur</span>
                <span className="block text-[11px] leading-tight text-ink-soft">Scribe medical IA</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-lg px-3 py-1.5 text-sm text-ink-soft transition hover:bg-brand-soft hover:text-brand-dark"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto text-right text-xs text-ink-soft">
              <div className="font-semibold text-ink">{facility}</div>
              <div>{process.env.FACILITY_ID || 'sans identifiant'}</div>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-6 py-6">{children}</main>
        <footer className="no-print mx-auto max-w-[1400px] px-6 pb-10 pt-4 text-xs leading-relaxed text-ink-soft">
          ParleDocteur est un outil d aide a la documentation clinique. Toute donnee proposee par l intelligence
          artificielle doit etre relue et validee par un professionnel de sante avant integration au dossier ou
          delivrance d une ordonnance. La responsabilite medicale demeure entierement celle du praticien.
        </footer>
      </body>
    </html>
  );
}
