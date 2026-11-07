import Link from 'next/link';
import { organizationFilter, requirePermission } from '@/lib/auth/guard';
import { bornesDuMois, resumePeriode } from '@/lib/allegement/store';
import { formuler } from '@/lib/allegement/mesure';
import { fuseauDe } from '@/lib/localisation-store';
import { jourCivil } from '@/lib/temps';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Allegement administratif — SmartHealth' };

const MOIS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
];

/**
 * Releve d'allegement administratif.
 *
 * CE QUE CET ECRAN REFUSE DE FAIRE
 *
 * Donner un chiffre unique. Il serait cite partout, et il melangerait ce
 * qu'on a CONSTATE avec ce qu'on a DEDUIT. Les deux colonnes restent donc
 * separees jusqu'au bout, et aucune ne s'additionne a l'autre.
 *
 * La distinction n'est pas une coquetterie : une facture consultee a
 * distance, on en est temoin ; un examen qui n'a pas ete refait, on ne
 * l'observe jamais, on l'infere. Un releve qui confond les deux se fait
 * demolir sur la premiere question, et emporte le reste avec lui.
 *
 * AUCUNE DONNEE NOMINATIVE N'EST LUE ICI. La table ne contient ni patient,
 * ni consultation, ni soignant : une structure, un jour, un type, une
 * quantite.
 */
export default async function AllegementPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; m?: string }>;
}) {
  const ctx = await requirePermission('stats:facility', '/admin/allegement');
  const { a, m } = await searchParams;

  const fuseau = ctx.user.organization_id ? fuseauDe(ctx.user.organization_id) : undefined;
  const [anneeCourante, moisCourant] = jourCivil(new Date(), fuseau).split('-').map(Number);

  const mois = Number(m) >= 1 && Number(m) <= 12 ? Number(m) : moisCourant;
  const annee = Number(a) >= 2000 && Number(a) <= 2100 ? Number(a) : anneeCourante;
  const enCours = annee === anneeCourante && mois === moisCourant;

  const { debut, fin } = bornesDuMois(annee, mois);
  const resume = resumePeriode(organizationFilter(ctx), debut, fin);
  const vide = resume.totalConstate === 0 && resume.totalInfere === 0;

  const precedent = mois === 1 ? { a: annee - 1, m: 12 } : { a: annee, m: mois - 1 };
  const suivant = mois === 12 ? { a: annee + 1, m: 1 } : { a: annee, m: mois + 1 };

  return (
    <div className="space-y-6">
      <section className="card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div>
            <h2 className="section-title">
              Allegement administratif : {MOIS[mois - 1]} {annee}
            </h2>
            <p className="text-xs text-ink-soft">
              Du {debut} au {fin}
              {enCours ? ', mois en cours' : ''}.
            </p>
          </div>
          <nav className="flex gap-2">
            <Link className="btn-ghost btn-sm" href={`?a=${precedent.a}&m=${precedent.m}`}>
              Mois precedent
            </Link>
            <Link className="btn-ghost btn-sm" href={`?a=${suivant.a}&m=${suivant.m}`}>
              Mois suivant
            </Link>
          </nav>
        </header>

        {vide ? (
          <p className="p-5 text-sm leading-relaxed text-ink-soft">
            Aucun allegement mesure sur la periode. Ce releve se remplit a mesure que les
            fonctions qui l alimentent sont utilisees : production du rapport mensuel, consultation
            d un dossier depuis l espace patient.
          </p>
        ) : (
          <div className="grid gap-px bg-line md:grid-cols-2">
            <div className="bg-surface p-5">
              <h3 className="text-sm font-bold">Constate</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                Le systeme en est temoin direct. Ces nombres se defendent tels quels.
              </p>
              {resume.constate.length === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">Rien sur la periode.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {resume.constate.map((l) => (
                    <li key={l.type}>
                      <p className="text-2xl font-bold tabular-nums">{l.quantite}</p>
                      <p className="text-sm text-ink-soft">{l.libelle}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-surface p-5">
              <h3 className="text-sm font-bold">Deduit</h3>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                Une condition a ete observee, l allegement en est deduit. Le systeme ne peut pas
                savoir ce qui se serait passe sans lui.
              </p>
              {resume.infere.length === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">Rien sur la periode.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {resume.infere.map((l) => (
                    <li key={l.type}>
                      <p className="text-2xl font-bold tabular-nums text-ink-soft">{l.quantite}</p>
                      <p className="text-sm text-ink-soft">{l.libelle}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      {!vide && (
        <section className="card-pad">
          <h2 className="section-title mb-2">A citer tel quel</h2>
          <ul className="space-y-1 text-sm leading-relaxed text-ink-soft">
            {formuler(resume).map((phrase, i) => (
              <li key={i}>{phrase}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card-pad">
        <h2 className="section-title mb-2">Pourquoi aucun total general</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Additionner un fait et une deduction produit un nombre qui n est ni l un ni l autre, et
          c est precisement celui qui serait repris partout ensuite. Les deux colonnes restent
          donc separees, y compris quand on cite ce releve.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Ce releve ne contient <b>aucune donnee nominative</b> : ni patient, ni consultation, ni
          soignant. Une structure, un jour, un type, une quantite.
        </p>
      </section>
    </div>
  );
}
