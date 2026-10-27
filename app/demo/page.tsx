import Link from 'next/link';
import { MODE_DEMO } from '@/lib/db';
import { PARCOURS, COMPTES, MOT_DE_PASSE_DEMO } from '@/lib/demo/parcours';
import { auth } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'ParleDocteur — parcours de demonstration',
};

/**
 * Parcours guide de la demonstration.
 *
 * Il existe parce qu'une plateforme hospitaliere ne se decouvre pas en
 * cliquant au hasard : l'invariant du lit ne se voit qu'en essayant
 * d'admettre deux patients au meme endroit, et le refus d'inciser sans
 * time out ne se voit qu'en essayant d'inciser. Chaque etape dit donc
 * QUOI faire et CE QU'ON DOIT VOIR — sans quoi un visiteur conclut que
 * l'application plante la ou elle refuse.
 */
export default async function DemoPage() {
  const ctx = await auth();

  return (
    <div className="grid gap-6">
      <section className="card-pad">
        <h1 className="text-xl font-bold">Parcours de demonstration</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Chaque etape ci-dessous montre une regle que l&apos;application fait tenir. Les refus
          qu&apos;on y rencontre sont le sujet, pas des pannes : un refus nomme toujours son
          motif et son remede.
        </p>
        {!MODE_DEMO && (
          <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            Cette installation n&apos;est pas en mode demonstration : les donnees que vous
            modifierez sont celles de la base reelle.
          </p>
        )}
      </section>

      <section className="card">
        <header className="border-b border-line px-5 py-3">
          <h2 className="text-lg font-bold">Comptes d&apos;essai</h2>
          <p className="text-xs text-ink-soft">
            Mot de passe commun : <code className="font-mono">{MOT_DE_PASSE_DEMO}</code>. Les
            droits different d&apos;un compte a l&apos;autre, et c&apos;est voulu — plusieurs
            etapes consistent justement a se voir refuser quelque chose.
          </p>
        </header>
        <ul className="divide-y divide-line">
          {COMPTES.map((c) => (
            <li key={c.email} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <code className="font-mono text-sm font-semibold">{c.email}</code>
                <span className="chip bg-brand-soft text-brand-dark">{c.role}</span>
              </div>
              <p className="mt-0.5 text-sm text-ink-soft">{c.peut}</p>
            </li>
          ))}
        </ul>
        {!ctx && (
          <div className="border-t border-line px-5 py-3">
            <Link href="/connexion" className="btn-primary btn-sm">
              Se connecter
            </Link>
          </div>
        )}
      </section>

      {PARCOURS.map((groupe) => (
        <section key={groupe.titre} className="card">
          <header className="border-b border-line px-5 py-3">
            <h2 className="text-lg font-bold">{groupe.titre}</h2>
            <p className="text-xs text-ink-soft">{groupe.pourquoi}</p>
          </header>
          <ol className="divide-y divide-line">
            {groupe.etapes.map((e, i) => (
              <li key={e.quoi} className="flex gap-3 px-5 py-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-paper text-xs font-bold">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.quoi}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    <b className="text-ink">Ce qu&apos;on doit voir :</b> {e.attendu}
                  </p>
                  {e.ou && (
                    <Link href={e.ou} className="mt-1 inline-block text-sm text-brand-dark hover:underline">
                      {e.ou}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      <section className="card-pad">
        <h2 className="text-base font-bold">Ce que la demonstration ne montre pas</h2>
        <ul className="mt-2 grid gap-1.5 text-sm text-ink-soft">
          <li>
            <b className="text-ink">La persistance.</b> La base vit en memoire : ce que vous
            saisissez disparait au recyclage de l&apos;instance. En installation reelle, elle
            tient dans un fichier sur le poste.
          </li>
          <li>
            <b className="text-ink">Le fonctionnement hors ligne.</b> Les poids du modele de
            transcription — 240 Mo — ne sont pas publies ici ; le navigateur les prend sur
            internet au premier usage. L&apos;installateur, lui, les embarque, et le poste
            n&apos;a alors plus besoin de reseau.
          </li>
          <li>
            <b className="text-ink">Les moteurs serveur.</b> Griot et whisper.cpp tournent a
            cote de l&apos;application sur une installation reelle ; ici seul le moteur
            navigateur est disponible.
          </li>
        </ul>
      </section>
    </div>
  );
}
