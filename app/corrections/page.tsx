import { requirePermission } from '@/lib/auth/guard';
import { ApprentissagePanel } from '@/components/admin/ApprentissagePanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Corrections apprises — ParleDocteur' };

export default async function CorrectionsPage() {
  // Cette page n'est PAS dans la console d'administration, et c'est voulu : un
  // medecin n'y a pas acces, alors que c'est lui qui produit ces corrections et
  // lui seul qui sait si une lecon se generalise. La ranger sous /admin l'aurait
  // mise hors de portee de la personne a qui elle sert.
  const ctx = await requirePermission('transcript:record', '/corrections');

  // L'export, lui, sort des donnees de l'installation entiere en vue d'un
  // re-entrainement : il releve de l'administration du serveur.
  const peutExporter = ctx.can('server:manage');

  return <ApprentissagePanel peutExporter={peutExporter} />;
}
