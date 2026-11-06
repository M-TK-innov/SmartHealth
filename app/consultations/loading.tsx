import { Attente, CarteListe } from '@/components/Squelette';

export default function Chargement() {
  return (
    <Attente quoi="Chargement des consultations">
      <CarteListe lignes={7} titre="w-44" />
    </Attente>
  );
}
