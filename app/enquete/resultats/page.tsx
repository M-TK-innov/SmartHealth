import { CHAMPS_LIBRES, depouiller, type Reponse } from '@/lib/enquete/questionnaire';
import { compterTout, configuree, lire, refusConfiguration } from '@/lib/enquete/store';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Enquete usagers, depouillement — SmartHealth',
  // La page est ouverte, elle n'est pas pour autant faite pour etre trouvee
  // par un moteur. L'en-tete X-Robots-Tag de vercel.json dit la meme chose au
  // niveau du serveur : les deux se repetent volontairement, parce qu'une
  // balise seule ne protege pas une reponse servie a un robot qui ne lit que
  // les en-tetes.
  robots: { index: false, follow: false },
};

/**
 * Depouillement de l'enquete usagers. PAGE PUBLIQUE.
 *
 * Elle a d'abord ete fermee par une cle, puis ouverte sur demande : montrer
 * les chiffres a un jury sans avoir a transmettre quoi que ce soit. Ce que
 * cela change est ecrit ici plutot que decouvert plus tard.
 *
 * CE QUI DEVIENT VISIBLE DE TOUS : les decomptes, les centres cites, et les
 * textes libres. Ces derniers viennent d'un formulaire ouvert : personne ne
 * les relit avant affichage, et la page le dit a son lecteur. React echappe
 * ce qu'il affiche, donc rien de ce qui est saisi ne s'execute ; mais une
 * phrase deplacee, elle, s'affiche. C'est le prix d'une page ouverte, et il
 * se paie en retirant la ligne concernee de la base, pas en esperant.
 *
 * CE QUI RESTE VRAI : la table ne porte aucune donnee nominative. Ouvrir
 * cette page n'expose l'identite de personne, parce qu'il n'y en a aucune a
 * exposer. C'est la seule raison pour laquelle l'ouverture est tenable.
 *
 * CE QUE CETTE PAGE REFUSE DE FAIRE
 *
 * Donner un chiffre unique de synthese. Chaque question a sa propre base, et
 * cette base est affichee a cote du pourcentage : une personne qui repond aux
 * sept questions usager et a aucune question agent compte dans sept bases, pas
 * dans treize. Tout rapporter au nombre de formulaires donnerait des chiffres
 * faux, et toujours a la baisse.
 */

const SEUIL_LISIBILITE = 30;

/** Au-dela, la page n'affiche plus les textes un par un. */
const TEXTES_AFFICHES = 200;

function pourcentage(nombre: number, base: number): string {
  if (base === 0) return '—';
  return `${Math.round((nombre / base) * 100)} %`;
}

export default async function ResultatsPage() {
  if (!configuree()) {
    return (
      <Cadre>
        <h1 className="text-lg font-bold">Aucune base de collecte</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{refusConfiguration()}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Nommer la variable manquante n expose rien : c est son <i>contenu</i> qui est un secret,
          et il ne se pose que dans l environnement du serveur.
        </p>
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

  const textes = CHAMPS_LIBRES.filter((c) => c.compteCommeReponse).map((champ) => {
    const valeurs = lignes.map((l) => l[champ.cle]).filter((v): v is string => Boolean(v));
    return { champ, valeurs, affiches: valeurs.slice(0, TEXTES_AFFICHES) };
  });
  const auMoinsUnTexte = textes.some((t) => t.valeurs.length > 0);

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
            {lignes.length < total ? `, ${lignes.length} depouillees` : ''}.
          </p>
        </div>
        <a className="btn-ghost btn-sm" href="/enquete/resultats/export">
          Exporter en CSV
        </a>
      </header>

      {total === 0 ? (
        <p className="rounded border-l-4 border-brand bg-brand/5 p-4 text-sm leading-relaxed">
          <b>Aucune reponse pour le moment.</b> Le questionnaire est en ligne et la collecte est
          ouverte : cette page se remplira a mesure que des reponses arriveront.
        </p>
      ) : (
        total < SEUIL_LISIBILITE && (
          <p className="rounded border-l-4 border-brand bg-brand/5 p-4 text-sm leading-relaxed">
            <b>Moins de {SEUIL_LISIBILITE} reponses.</b> Les pourcentages ci-dessous sont affiches
            parce qu ils aident a suivre la collecte, pas parce qu ils mesurent quelque chose.
            Citer un pourcentage calcule sur une poignee de personnes, c est offrir au lecteur la
            premiere objection.
          </p>
        )
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

      {auMoinsUnTexte && (
        <p className="rounded border-l-4 border-line bg-surface p-4 text-sm leading-relaxed text-ink-soft">
          Les reponses libres ci-dessous sont reproduites <b>telles qu elles ont ete ecrites</b>,
          par un formulaire ouvert a tous et sans relecture prealable. Elles engagent celui qui les
          a ecrites, et personne d autre.
        </p>
      )}

      {textes.map(({ champ, valeurs, affiches }) => (
        <section key={champ.cle} className="card-pad">
          <h2 className="section-title mb-2">
            {champ.intitule} <span className="font-normal text-ink-soft">({valeurs.length})</span>
          </h2>
          {valeurs.length === 0 ? (
            <p className="text-sm text-ink-soft">Rien pour le moment.</p>
          ) : (
            <>
              <ul className="space-y-2 text-sm leading-relaxed">
                {affiches.map((v, i) => (
                  <li key={i} className="border-l-2 border-line pl-3">
                    {v}
                  </li>
                ))}
              </ul>
              {valeurs.length > affiches.length && (
                <p className="mt-3 text-sm text-ink-soft">
                  {valeurs.length - affiches.length} autre
                  {valeurs.length - affiches.length > 1 ? 's' : ''} reponse
                  {valeurs.length - affiches.length > 1 ? 's' : ''} libre
                  {valeurs.length - affiches.length > 1 ? 's' : ''} dans l export CSV.
                </p>
              )}
            </>
          )}
        </section>
      ))}

      <section className="card-pad">
        <h2 className="section-title mb-2">Comment lire ces chiffres</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Chaque question a sa propre base : une personne qui repond aux sept questions usager et a
          aucune question agent compte dans les sept premieres bases, et dans aucune des six
          suivantes. Le nombre entre parentheses apres chaque question est cette base.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Les reponses sont <b>anonymes</b> : la table ne porte ni nom, ni telephone, ni numero de
          dossier, ni adresse reseau. Elle ne permet donc pas de savoir si deux reponses viennent
          de la meme personne, et ce depouillement ne le pretend pas. C est aussi ce qui permet a
          cette page d etre ouverte : il n y a aucune identite a exposer.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          L echantillon n est pas representatif. Il decrit les personnes qui ont accepte de
          repondre, la ou le questionnaire a circule. Ces limites se citent avec les chiffres,
          pas a la place.
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

function Bloc({ titre, questions }: { titre: string; questions: ReturnType<typeof depouiller> }) {
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
