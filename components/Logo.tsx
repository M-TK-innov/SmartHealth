/**
 * La marque de SmartHealth.
 *
 * Un carre arrondi portant une croix de sante, dont le coin bas-gauche reste
 * droit : c'est la pointe d'une bulle de parole. L'outil ecoute la consultation
 * et en fait un dossier ; la bulle et la croix le disent en une seule forme.
 * A seize pixels, la croix reste lisible quand le reste ne l'est plus — c'est
 * elle qui porte la reconnaissance, la pointe ne fait que signer.
 *
 * La tuile prend `currentColor` et la croix reste blanche : une seule classe
 * de couleur au point d'appel suffit a decliner la marque, sans variante a
 * maintenir.
 *
 * Le trace est repris a l'identique dans `scripts/gen-icons.mjs`, qui produit
 * les PNG de l'application installee. Une modification ici doit y etre portee,
 * sans quoi l'icone du bureau cesse de ressembler a celle de l'ecran.
 */
export default function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <path d="M7 0h18a7 7 0 0 1 7 7v18a7 7 0 0 1-7 7H0V7a7 7 0 0 1 7-7Z" fill="currentColor" />
      <path d="M12.5 6.5h7v19h-7zM6.5 12.5h19v7h-19z" fill="#fff" />
    </svg>
  );
}
