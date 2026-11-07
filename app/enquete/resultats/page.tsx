import { cookies } from 'next/headers';
import { COOKIE, cleAttendue, refusConfiguration, sessionOuverte } from '@/lib/enquete/acces';
import { CHAMPS_LIBRES, depouiller, type Reponse } from '@/lib/enquete/questionnaire';
import { compterTout, configuree, lire, refusConfiguration as refusBase } from '@/lib/enquete/store';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Enquete usagers, depouillement — SmartHealth',
  robots: { index: false, follow: false },
};

/**
 * Depouillement de l'enquete usagers.
 *
 * CE QUE CETTE PAGE AFFICHE, ET CE QU'ELLE REFUSE D'AFFICHER
 *
 * Elle montre, par question, le nombre de personnes qui ont repondu ET la
 * base sur laquelle le pourcentage est calcule. Une question laissee vide
 * n'entre pas dans sa base : c'est la seule facon d'eviter des pourcentages
 * systematiquement sous-estimes, et la base reste sous les yeux pour que le
 * lecteur puisse refaire le calcul.
 *
 * Elle refuse de produire un chiffre unique de synthese, pour la meme raison
 * que le releve d'allegement : c'est celui-la qui serait cite partout, et il
 * ne voudrait rien dire.
 *
 * Sous trente reponses, un bandeau le dit. Un pourcentage sur neuf personnes
 * se presente comme un pourcentage et se lit comme une mesure ; il n'en est
 * pas une, et le jury le verra avant nous.
 */

const SEUIL_LISIBILITE = 30;

function pourcentage(nombre: number, base: number): string {
  if (base === 0) return '—';
  return `${Math.round((nombre / base) * 100)} %`;
}

export default async function ResultatsPage({
  searchParams,
}: {
  searchParams: Promise<{ refus?: string }>;
}) {
  const { refus } = await searchParams;
  const cle = cleAttendue();
  const jeton = (await cookies()).get(COOKIE)?.value ?? null;

  if (!cle) {
    return (
      <Cadre>
        <h1 className="text-lg font-bold">Depouillement ferme</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{refusConfiguration()}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Nommer la variable manquante n expose rien : c est son <i>contenu</i> qui est un secret,
          et il ne se pose que dans l environnement du serveur.
        </p>
      </Cadre>
    );
  }

  if (!sessionOuverte(jeton, cle, new Date())) {
    return (
      <Cadre>
        <h1 className="text-lg font-bold">Depouillement de l enquete</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Cette page n est pas publique. Elle demande la cle de lecture.
        </p>
        <form action="/api/enquete/acces" method="post" className="mt-4 space-y-3">
          <label className="block text-sm font-semibold" htmlFor="cle">
            Cle de lecture
          </label>
          <input
            id="cle"
            name="cle"
            type="password"
            autoComplete="off"
            className="input w-full max-w-sm"
            required
          />
          {refus === '1' && (
            <p className="text-sm font-semibold text-danger">Cle refusee.</p>
          )}
          <button type="submit" className="btn-primary">
            Ouvrir
          </button>
        </form>
      </Cadre>
    );
  }

  if (!configuree()) {
    return (
      <Cadre>
        <h1 className="text-lg font-bold">Aucune base de collecte</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{refusBase()}</p>
      </Cadre>
    );
  }

  let lignes: Reponse[] = [];
  let total = 0;
  let panne: string | null = null;
  try {
    lignes = (await lire(1000)) as Reponse[];
    total = await compterTout();
  } catch (e) {
    panne = e instanceof Error ? e.message : 'Lecture impossible.';
  }

  if (panne) {
    return (
      <Cadre>
        <h1 className="text-lg font-bold">Base injoignable</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{panne}</p>
      </Cadre>
    );
  }

  const depouille = depouiller(lignes);
  const usager = depouille.filter((q) => q.groupe === 'usager');
  const agent = depouille.filter((q) => q.groupe === 'agent');

  const textes = CHAMPS_LIBRES.filter((c) => c.compteCommeReponse).map((champ) => ({
    champ,
    valeurs: lignes.map((l) => l[champ.cle]).filter((v): v is string => Boolean(v)),
  }));

  const centres = new Map<string, number>();
  for (const ligne of lignes) {
    const nom = ligne.centre;
    if (!nom) continue;
    centres.set(nom, (centres.get(nom) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Enquete usagers : depouillement</h1>
          <p className="text-sm text-ink-soft">
            {total} reponse{total > 1 ? 's' : ''} recue{total > 1 ? 's' : ''}
            {lignes.length < total ? `, ${lignes.length} affichees` : ''}.
          </p>
        </div>
        <div className="flex gap-2">
          <a className="btn-ghost btn-sm" href="/enquete/resultats/export">
            Exporter en CSV
          </a>
          <form action="/api/enquete/acces" method="post">
            <input type="hidden" name="sortir" value="1" />
            <button type="submit" className="btn-ghost btn-sm">
              Fermer
            </button>
          </form>
        </div>
      </header>

      {total < SEUIL_LISIBILITE && (
        <p className="rounded border-l-4 border-brand bg-brand/5 p-4 text-sm leading-relaxed">
          <b>Moins de {SEUIL_LISIBILITE} reponses.</b> Les pourcentages ci-dessous sont affiches
          parce qu ils aident a suivre la collecte, pas parce qu ils mesurent quelque chose. Citer
          un pourcentage calcule sur une poignee de personnes, c est offrir au lecteur la premiere
          objection.
        </p>
      )}

      <Bloc titre="Questionnaire usager" questions={usager} />
      <Bloc titre="Questionnaire agent" questions={agent} />

      {centres.size > 0 && (
        <section className="card-pad">
          <h2 className="section-title mb-2">Centres cites</h2>
          <ul className="space-y-1 text-sm text-ink-soft">
            {[...centres.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([nom, n]) => (
                <li key={nom}>
                  {nom} <span className="tabular-nums">({n})</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {textes.map(({ champ, valeurs }) => (
        <section key={champ.cle} className="card-pad">
          <h2 className="section-title mb-2">
            {champ.intitule} <span className="font-normal text-ink-soft">({valeurs.length})</span>
          </h2>
          {valeurs.length === 0 ? (
            <p className="text-sm text-ink-soft">Rien pour le moment.</p>
          ) : (
            <ul className="space-y-2 text-sm leading-relaxed">
              {valeurs.map((v, i) => (
                <li key={i} className="border-l-2 border-line pl-3">
                  {v}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="card-pad">
        <h2 className="section-title mb-2">Comment lire ces chiffres</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Chaque question a sa propre base : une personne qui repond aux six questions usager et a
          aucune question agent compte dans les six premieres bases, et dans aucune des cinq
          suivantes. Le nombre entre parentheses apres chaque question est cette base.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Les reponses sont <b>anonymes</b> : la table ne porte ni nom, ni telephone, ni numero de
          dossier, ni adresse reseau. Elle ne permet donc pas de savoir si deux reponses viennent
          de la meme personne, et ce depouillement ne le pretend pas.
        </p>
      </section>
    </div>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="card-pad">{children}</div>
    </div>
  );
}

function Bloc({
  titre,
  questions,
}: {
  titre: string;
  questions: ReturnType<typeof depouiller>;
}) {
  return (
    <section className="card">
      <header className="border-b border-line px-5 py-3">
        <h2 className="section-title">{titre}</h2>
      </header>
      <div className="divide-y divide-line">
        {questions.map((q) => (
          <div key={q.cle} className="px-5 py-4">
            <h3 className="text-sm font-bold">
              <span className="text-brand">{q.numero}.</span> {q.intitule}{' '}
              <span className="font-normal text-ink-soft">({q.exprimees})</span>
            </h3>
            <ul className="mt-2 space-y-1.5">
              {q.decomptes.map((d) => (
                <li key={d.valeur} className="flex items-center gap-3 text-sm">
                  <span className="w-12 shrink-0 text-right font-semibold tabular-nums">
                    {pourcentage(d.nombre, q.exprimees)}
                  </span>
                  <span
                    className="h-2 shrink-0 rounded bg-brand"
                    style={{
                      width: q.exprimees ? `${Math.round((d.nombre / q.exprimees) * 120)}px` : 0,
                    }}
                    aria-hidden
                  />
                  <span className="text-ink-soft">
                    {d.libelle} <span className="tabular-nums">({d.nombre})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
