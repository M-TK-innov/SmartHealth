/**
 * Sections de la console d'administration et droit requis pour chacune.
 *
 * Dans un fichier a part : Next.js n'autorise pas les exports libres depuis un
 * layout, et cette liste sert aussi bien a la navigation qu'au filtrage.
 */

import type { Permission } from './roles';

export const ADMIN_SECTIONS: { href: string; label: string; permission: Permission }[] = [
  { href: '/admin', label: 'Vue d ensemble', permission: 'user:read' },
  { href: '/admin/comptes', label: 'Comptes', permission: 'user:read' },
  { href: '/admin/organisations', label: 'Organisations', permission: 'org:read' },
  { href: '/admin/droits', label: 'Droits', permission: 'permission:manage' },
  { href: '/admin/acces', label: 'Acces et sessions', permission: 'session:manage' },
  { href: '/admin/systeme', label: 'Etat du systeme', permission: 'database:manage' },
  { href: '/admin/reseau', label: 'Reseau et serveurs', permission: 'server:manage' },
];
