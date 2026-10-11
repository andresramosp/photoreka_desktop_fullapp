/**
 * La misma API corre en dos modos:
 * - desktop (por defecto): en el ordenador del usuario, con su base local; lo que necesita
 *   claves o secretos lo pide al servicio de la nube.
 * - gateway: el servicio de la nube del escritorio, contra la base de producción. No aplica
 *   migraciones ni tareas programadas y solo expone las rutas /gateway.
 */
export const isGateway = process.env.PHOTOREKA_MODE === 'gateway'
export const isDesktop = !isGateway
