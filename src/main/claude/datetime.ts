/**
 * Recalculée à chaque appel — ne jamais mettre dans un bloc system marqué
 * cache_control, sinon la date se fige au moment de la création du cache.
 */
export function getCurrentDateTimeLine(): string {
  const now = new Date()
  const date = now.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  const time = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `Nous sommes le ${date} à ${time}.`
}
