import { Injectable } from '@angular/core';

/**
 * Marcar con el softphone del puesto (Zoiper, y cualquiera que registre su
 * protocolo).
 *
 * Estaba metido dentro de la pantalla de gestión; al querer marcar también
 * desde la lista de clientes se sacó aquí, para no tener la misma lógica en
 * dos sitios y que se separen con el tiempo.
 */
@Injectable({ providedIn: 'root' })
export class SoftphoneService {

  /**
   * Protocolo que se le entrega al sistema operativo.
   *
   * Va con DOS PUNTOS y sin barras: `zoiper:0991234567`. Con «://» Windows le
   * añade una barra al final (`zoiper://0991234567/`) y el softphone acaba
   * marcando ese carácter de más; comprobado mirando lo que recibe el
   * manejador. Zoiper entiende además tel:, sip: y callto:.
   *
   * Se deja configurable por navegador para no recompilar si se cambia de
   * softphone (3CX, MicroSIP, X-Lite…):
   *
   *   localStorage.setItem('miCRM3.softphone', 'callto');
   */
  get protocolo(): string {
    try { return localStorage.getItem('miCRM3.softphone') || 'zoiper'; } catch { return 'zoiper'; }
  }

  /**
   * El número tal como hay que marcarlo: sólo lo que sabe marcar una central
   * (dígitos, +, * y #). Se van los espacios, guiones y paréntesis, que es lo
   * que suele traer un número tecleado a mano.
   */
  numeroMarcable(numero?: string | null): string {
    return String(numero ?? '').replace(/[^\d+*#]/g, '');
  }

  /** La URL completa que se le entrega al sistema, o '' si no hay número. */
  enlace(numero?: string | null): string {
    const n = this.numeroMarcable(numero);
    return n ? `${this.protocolo}:${n}` : '';
  }

  /**
   * Marca. Devuelve el número marcado, o '' si no había nada que marcar —así
   * quien llama decide qué avisar.
   *
   * No navega a ningún sitio: el navegador le entrega el enlace al sistema,
   * que abre el softphone. La primera vez Chrome pregunta si se permite;
   * marcando «Permitir siempre» no vuelve a preguntar.
   *
   * Si el softphone ya está abierto y marca pero no se asoma, no es cosa del
   * navegador: una página no puede traer al frente la ventana de otro
   * programa. En Zoiper se arregla con su opción
   * «command line call auto popup».
   */
  marcar(numero?: string | null): string {
    const n = this.numeroMarcable(numero);
    if (!n) { return ''; }

    this.lanzar(this.enlace(n));
    return n;
  }

  /**
   * Entrega el enlace al sistema operativo sin que el navegador crea que se
   * está abandonando la página.
   *
   * Con `window.location.href` Chrome lo trata como salir del documento, y
   * como la aplicación tiene un `beforeunload` registrado a propósito (ver
   * app.component), salía el cartel de «¿desea salir de esta página?» antes de
   * abrir el softphone: había que contestar «abandonar» en cada llamada.
   *
   * Dentro de un iframe la navegación no es la del documento principal, así
   * que el protocolo se lanza igual y el cartel no aparece. Lo comprobé con
   * las tres formas posibles:
   *
   *     location.href      lanza · SACA EL CARTEL
   *     clic a un <a>      lanza · SACA EL CARTEL
   *     iframe oculto      lanza · sin cartel
   *
   * El marco se quita después, no en el acto: borrarlo de inmediato cancela el
   * lanzamiento antes de que el sistema lo atienda.
   */
  private lanzar(url: string): void {
    const marco = document.createElement('iframe');
    marco.style.display = 'none';
    marco.setAttribute('aria-hidden', 'true');
    document.body.appendChild(marco);

    try {
      if (marco.contentWindow) { marco.contentWindow.location.href = url; }
      else { marco.src = url; }
    } catch {
      // Si el navegador no deja, mejor marcar con el cartel que no marcar
      window.location.href = url;
    }

    setTimeout(() => marco.remove(), 2000);
  }
}
