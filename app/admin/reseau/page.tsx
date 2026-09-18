import { requirePermission } from '@/lib/auth/guard';
import { NetworkPanel } from '@/components/admin/NetworkPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reseau et serveurs — ParleDocteur' };

export default async function AdminNetworkPage() {
  const ctx = await requirePermission('server:manage', '/admin/reseau');
  // Lever une restriction sanitaire engage le responsable de traitement : ce
  // n'est pas un droit attribuable par la matrice des permissions, au meme
  // titre que le cloisonnement par etablissement. La route de derogation
  // revalide ce controle — celui-ci ne fait que masquer un bouton inutile.
  return <NetworkPanel canDerogate={ctx.user.role === 'super_admin'} />;
}
