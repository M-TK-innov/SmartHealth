import Link from 'next/link';
import Logo from '@/components/Logo';

/**
 * Cadre commun aux ecrans de connexion et d'inscription.
 * Deux colonnes sur grand ecran, une seule sur telephone : le formulaire passe
 * en premier, le panneau explicatif dessous.
 */
export function AuthShell({
  title,
  subtitle,
  aside,
  children,
  wide,
}: {
  title: string;
  subtitle: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`mx-auto grid gap-6 lg:grid-cols-[1fr_380px] ${wide ? 'max-w-5xl' : 'max-w-4xl'}`}>
      <div className="card-pad order-1">
        <div className="mb-5">
          <Link href="/" className="mb-4 inline-flex items-center gap-2.5">
            <Logo className="h-9 w-9 text-brand" />
            <span className="text-[15px] font-bold">SmartHealth</span>
          </Link>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
        </div>
        {children}
      </div>

      {aside && (
        <aside className="order-2 rounded-xl bg-brand p-5 text-white lg:order-2">
          <h2 className="text-sm font-bold uppercase tracking-widest text-white/70">Acces securise</h2>
          <div className="mt-3">{aside}</div>
        </aside>
      )}
    </div>
  );
}
