import Link from 'next/link';
import { organizationFilter, requirePermission } from '@/lib/auth/guard';
import { rapportDuMois } from '@/lib/interop/rapport-store';
import { versDhis2 } from '@/lib/interop/rapport-mensuel';
import { fuseauDe } from '@/lib/localisation-store';
import { jourCivil } from '@/lib/temps';
import { ProduireRapport } from '@/components/ProduireRapport';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Rapport mensuel de surveillance — SmartHealth' };

const MOIS = [
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
];

/**
 * Rapport mensuel de surveillance, produit et non ressaisi.
 *
 * L'ecran montre d'abord le mois ECOULE, parce que c'est celui que l'agent
 * doit transmettre. Le mois en cours est consultable, mais il est incomplet
 * par construction et le dire evite qu'on le transmette par megarde.
 *
 * Il affiche aussi ce qu'il a LAISSE DE COTE, et pourquoi. Un rapport qui ne
 * montre que ses totaux ne peut pas etre verifie : l'agent qui le signe doit
 * pouvoir constater que les diagnostics ecartes par le praticien n'y sont pas
 * entres.
 */
export default async function RapportMensuelPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; a?: string }>;
}) {
  const ctx = await requirePermission('export:read', '/interop/rapport-mensuel');
  const { m, a } = await searchParams;

  const organizationId = organizationFilter(ctx);
  const fuseau = ctx.user.organization_id ? fuseauDe(ctx.user.organization_id) : undefined;
  const aujourdHui = jourCivil(new Date(), fuseau);
  const [anneeCourante, moisCourant] = aujourdHui.split('-').map(Number);

  // Par defaut le mois ecoule : c'est celui qu'on transmet.
  const defautMois = moisCourant === 1 ? 12 : moisCourant - 1;
  const defautAnnee = moisCourant === 1 ? anneeCourante - 1 : anneeCourante;

  const mois = Number(m) >= 1 && Number(m) <= 12 ? Number(m) : defautMois;
  const annee = Number(a) >= 2000 && Number(a) <= 2100 ? Number(a) : defautAnnee;
  const enCours = annee === anneeCourante && mois === moisCourant;

  const rapport = rapportDuMois({ organizationId, annee, mois });
  const charge = versDhis2(rapport);
  const totalEcartes =
    rapport.ecartes.nonSignes +
    rapport.ecartes.differentiels +
    rapport.ecartes.ecartes +
    rapport.ecartes.sansCodeSuivi;

  const precedent = mois === 1 ? { a: annee - 1, m: 12 } : { a: annee, m: mois - 1 };
  const suivant = mois === 12 ? { a: annee + 1, m: 1 } : { a: annee, m: mois + 1 };

  return (
    <div className="space-y-6">
      <section className="card">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div>
            <h1 className="text-lg font-bold">
              Rapport de surveillance : {MOIS[mois - 1]} {annee}
            </h1>
            <p className="text-xs text-ink-soft">
              Produit depuis les consultations deja enregistrees. Periode DHIS2 {rapport.periode}.
            </p>
          </div>
          <nav className="flex gap-2 text-sm">
            <Link className="btn-ghost btn-sm" href={`?a=${precedent.a}&m=${precedent.m}`}>
              Mois precedent
            </Link>
            <Link className="btn-ghost btn-sm" href={`?a=${suivant.a}&m=${suivant.m}`}>
              Mois suivant
            </Link>
          </nav>
        </header>

        {enCours && (
          <p className="border-b border-line bg-warn-soft px-5 py-3 text-sm text-warn">
            <b>Mois en cours.</b> Ce rapport est incomplet par construction : des consultations
            seront encore enregistrees d ici la fin du mois. Ne le transmettez pas comme rapport
            definitif.
          </p>
        )}

        {rapport.lignes.length === 0 ? (
          <p className="p-5 text-sm text-ink-soft">
            Aucun cas a declarer pour ce mois. {rapport.examines > 0
              ? `${rapport.examines} diagnostic${rapport.examines > 1 ? 's' : ''} examine${rapport.examines > 1 ? 's' : ''}, aucun ne relevant de la surveillance ou tous ecartes.`
              : 'Aucun diagnostic enregistre sur la periode.'}
          </p>
        ) : (
          <div className="table-responsive">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="px-5 py-2">Element de donnee</th>
                  <th className="px-5 py-2">Libelle</th>
                  <th className="px-5 py-2 text-right">Confirmes</th>
                  <th className="px-5 py-2 text-right">Suspects</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rapport.lignes.map((l) => (
                  <tr key={l.dataElement}>
                    <td className="px-5 py-2 font-mono text-xs">{l.dataElement}</td>
                    <td className="px-5 py-2">{l.libelle}</td>
                    <td className="px-5 py-2 text-right font-semibold">{l.confirmes || ''}</td>
                    <td className="px-5 py-2 text-right">{l.suspects || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card-pad">
        <h2 className="section-title mb-2">Ce qui n a pas ete compte</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          {rapport.examines} diagnostic{rapport.examines > 1 ? 's' : ''} examine
          {rapport.examines > 1 ? 's' : ''}, {rapport.retenus} retenu
          {rapport.retenus > 1 ? 's' : ''}, {totalEcartes} ecarte
          {totalEcartes > 1 ? 's' : ''}.
        </p>
        <ul className="mt-3 space-y-1 text-sm">
          <li>
            <b>{rapport.ecartes.ecartes}</b> ecarte{rapport.ecartes.ecartes > 1 ? 's' : ''} par le
            praticien. Les compter dirait le contraire de ce qu il a conclu.
          </li>
          <li>
            <b>{rapport.ecartes.differentiels}</b> diagnostic
            {rapport.ecartes.differentiels > 1 ? 's' : ''} differentiel
            {rapport.ecartes.differentiels > 1 ? 's' : ''} : une piste explorée n est pas un cas.
          </li>
          <li>
            <b>{rapport.ecartes.nonSignes}</b> issu{rapport.ecartes.nonSignes > 1 ? 's' : ''} d une
            consultation non signee. Tant qu un praticien n a pas signe, le diagnostic peut etre
            une proposition non relue.
          </li>
          <li>
            <b>{rapport.ecartes.sansCodeSuivi}</b> sans correspondance dans les programmes de
            surveillance.
          </li>
        </ul>
      </section>

      <section className="card-pad">
        <h2 className="section-title mb-2">Confirmes et suspects ne sont pas additionnes</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Ils partent dans deux elements de donnees distincts, suffixes{' '}
          <code className="text-xs">_CONF</code> et <code className="text-xs">_SUSP</code>. Les
          verser dans le meme element perdrait la distinction au moment precis ou elle quitte l
          etablissement, et personne en aval ne pourrait la retrouver.
        </p>
      </section>

      <ProduireRapport
        annee={annee}
        mois={mois}
        enCours={enCours}
        lignes={rapport.lignes.length}
        charge={JSON.stringify(charge, null, 2)}
      />
    </div>
  );
}
