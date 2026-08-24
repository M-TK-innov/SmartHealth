import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { BottomNav, TopNav, UserMenu } from '@/components/Nav';
import { navItemsFor } from '@/lib/auth/nav-items';
import { PwaRuntime } from '@/components/Pwa';
import { auth } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/auth/roles';

export const metadata: Metadata = {
  title: 'ParleDocteur — scribe medical IA',
  description:
    'Ecoute la consultation, structure les donnees cliniques, enrichit le dossier medical et prepare une ordonnance que le medecin valide. Interoperable FHIR R4 / HL7 v2 / DHIS2.',
  applicationName: 'ParleDocteur',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'ParleDocteur' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon-64.png', sizes: '64x64', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // le pincement reste autorise : sur une ordonnance ou un compte rendu,
  // interdire le zoom est un probleme d'accessibilite, pas un detail
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f6f5c' },
    { media: '(prefers-color-scheme: dark)', color: '#0a5245' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const ctx = await auth();
  const items = ctx ? navItemsFor([...ctx.permissions]) : [];
  const facility = ctx?.organization?.name ?? process.env.FACILITY_NAME ?? 'Structure de sante';

  return (
    <html lang="fr">
      <body>
        <PwaRuntime />

        <header className="no-print sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2.5 sm:gap-5 sm:px-6 sm:py-3">
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-lg text-white">
                &#9673;
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-bold leading-none">ParleDocteur</span>
                <span className="hidden text-[11px] leading-tight text-ink-soft sm:block">Scribe medical IA</span>
              </span>
            </Link>

            <TopNav items={items} />

            <div className="ml-auto flex items-center gap-3">
              {ctx ? (
                <>
                  <div className="hidden min-w-0 text-right text-xs text-ink-soft xl:block">
                    <div className="truncate font-semibold text-ink">{facility}</div>
                  </div>
                  <UserMenu
                    fullName={ctx.user.full_name}
                    roleLabel={ROLE_LABELS[ctx.user.role]}
                    organizationName={ctx.organization?.name ?? null}
                  />
                </>
              ) : (
                <Link href="/connexion" className="btn-primary btn-sm">
                  Se connecter
                </Link>
              )}
            </div>
          </div>
        </header>

        {/* pb-24 sur mobile : reserve la hauteur de la barre d'onglets fixe */}
        <main className="mx-auto max-w-[1400px] px-4 py-4 pb-24 sm:px-6 sm:py-6 md:pb-6">{children}</main>

        <footer className="no-print mx-auto max-w-[1400px] px-4 pb-24 pt-4 text-xs leading-relaxed text-ink-soft sm:px-6 md:pb-10">
          ParleDocteur est un outil d aide a la documentation clinique. Toute donnee proposee par l intelligence
          artificielle doit etre relue et validee par un professionnel de sante avant integration au dossier ou
          delivrance d une ordonnance. La responsabilite medicale demeure entierement celle du praticien.
        </footer>

        <BottomNav items={items} />
      </body>
    </html>
  );
}
