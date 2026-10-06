/**
 * Entregarle al sistema operativo un enlace que no es una página.
 *
 * `tel:`, `whatsapp://send?…`, `zoiper:`… no son direcciones que el navegador
 * pueda mostrar: son órdenes para una aplicación instalada. Y abrirlas tiene
 * trampa, porque las dos formas evidentes fallan de formas distintas:
 *
 *     window.open(url, '_blank')   lanza · DEJA UNA PESTAÑA EN BLANCO con la
 *                                  dirección cruda a la vista, que parece un
 *                                  error aunque la aplicación se haya abierto
 *     location.href = url          lanza · SACA EL CARTEL de «¿salir de esta
 *                                  página?», porque la aplicación tiene un
 *                                  beforeunload puesto a propósito
 *                                  (ver app.component)
 *     clic a un <a href=…>         lanza · SACA EL CARTEL, por lo mismo
 *     iframe oculto                lanza · sin pestaña y sin cartel
 *
 * Dentro de un iframe la navegación no es la del documento principal, así que
 * el protocolo se lanza igual, nadie abandona nada y no aparece ninguna
 * pestaña. Comprobado con las cuatro.
 *
 * Esto vivía dentro de softphone.service.ts, que fue donde se peleó primero;
 * está aquí porque WhatsApp tropezó después con exactamente lo mismo, y el
 * siguiente que abra una aplicación de escritorio va a tropezar igual.
 */
export function lanzarProtocolo(url: string): void {
  if (!url) { return; }

  const marco = document.createElement('iframe');
  marco.style.display = 'none';
  marco.setAttribute('aria-hidden', 'true');
  document.body.appendChild(marco);

  try {
    if (marco.contentWindow) { marco.contentWindow.location.href = url; }
    else { marco.src = url; }
  } catch {
    // Si el navegador no deja, mejor con el cartel que no lanzarlo
    window.location.href = url;
  }

  // El marco se quita después, no en el acto: borrarlo de inmediato cancela
  // el lanzamiento antes de que el sistema lo atienda.
  setTimeout(() => marco.remove(), 2000);
}
