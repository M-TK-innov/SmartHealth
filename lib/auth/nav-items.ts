/**
 * Entrees de navigation et droit requis pour chacune.
 *
 * Module neutre (ni serveur ni client) : le layout serveur filtre la liste
 * selon les droits du compte, les composants client la recoivent en props.
 *
 * Ce filtrage releve du confort de navigation, pas de la securite : masquer un
 * lien n'empeche pas d'atteindre l'URL. Chaque page revalide ses droits.
 */

import type { Permission } from './roles';

export interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: string;
  permission?: Permission;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Tableau de bord', short: 'Accueil', icon: '▦' },
  { href: '/patients', label: 'Patients', short: 'Patients', icon: '⚇', permission: 'patient:read' },
  { href: '/consultations', label: 'Consultations', short: 'Consult.', icon: '◑', permission: 'consultation:read' },
  { href: '/hopital', label: 'Lits et files', short: 'Hopital', icon: '▤', permission: 'flux:read' },
  { href: '/interop', label: 'Interoperabilite', short: 'Interop', icon: '⇄', permission: 'export:read' },
  { href: '/corrections', label: 'Corrections apprises', short: 'Appris', icon: '✎', permission: 'transcript:record' },
  { href: '/audit', label: 'Journal', short: 'Journal', icon: '≡', permission: 'audit:read' },
  { href: '/admin', label: 'Administration', short: 'Admin', icon: '⚙', permission: 'user:read' },
];

export function navItemsFor(permissions: string[]): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.permission || permissions.includes(i.permission));
}
