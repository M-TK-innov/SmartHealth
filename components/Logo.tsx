/**
 * La marque de SmartHealth.
 *
 * Un carre arrondi portant une croix de sante, dont le coin bas-gauche reste
 * droit : c'est la pointe d'une bulle de parole. Au centre, le microphone du
 * Recorder, en rouge — la couleur que prend le bouton quand l'application
 * enregistre. La marque dit donc les deux metiers en une forme : on soigne,
 * et pendant ce temps la parole est prise.
 *
 * Le micro est le trace de `components/Recorder.tsx`, repris sans retouche et
 * seulement remis a l'echelle : `translate(10 10) scale(.5)` amene son centre
 * (12, 12) sur celui de la marque (16, 16) et le fait tenir dans la barre
 * verticale de la croix, qui est blanche. Le rouge ne touche jamais le vert —
 * un rouge sur fond vert vire au brun et cesse d'alerter.
 *
 * La tuile prend `currentColor` et la croix reste blanche : une seule classe
 * de couleur au point d'appel suffit a decliner la marque. Le rouge, lui, est
 * fixe : c'est un signal, pas une teinte de theme.
 *
 * Le trace est repris a l'identique dans `scripts/gen-icons.mjs`, qui produit
 * les PNG de l'application installee. Une modification ici doit y etre portee,
 * sans quoi l'icone du bureau cesse de ressembler a celle de l'ecran.
 */
const ROUGE = '#b42318'; // --color-danger, le rouge de l'enregistrement

export default function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <path d="M7 0h18a7 7 0 0 1 7 7v18a7 7 0 0 1-7 7H0V7a7 7 0 0 1 7-7Z" fill="currentColor" />
      <path d="M11.5 6.5h9v19h-9zM6.5 11.5h19v9h-19z" fill="#fff" />
      <g
        transform="translate(10 10) scale(.5)"
        fill="none"
        stroke={ROUGE}
        strokeWidth={1.6}
        strokeLinecap="round"
      >
        <rect x="9" y="2" width="6" height="12" rx="3" fill={ROUGE} stroke="none" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v4M8.5 22h7" />
      </g>
    </svg>
  );
}
