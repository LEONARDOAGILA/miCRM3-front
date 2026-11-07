import { Injectable } from '@angular/core';

/**
 * Lo que se puede hacer con un nombre ya partido en apellidos y nombres.
 *
 * QUIÉN PARTE EL NOMBRE. El corte lo decide el SERVIDOR
 * (App\Services\NombrePersona), que es quien conoce las partículas —«de los
 * Santos», «de Jesús»— y quien dice si el corte es fiable. Aquí NO se repite
 * esa lógica a propósito: dos copias de la misma regla en dos lenguajes
 * acaban diciendo cosas distintas.
 *
 * LO QUE SÍ ES DE LA PANTALLA es arreglar un corte dudoso sin tener que
 * volver a teclear los dos campos. El Registro Civil manda un solo texto y
 * con tres palabras —«PEREZ GUAMAN GUILLERMO»— no hay forma de saber si son
 * dos apellidos y un nombre o uno y dos; cuando el servidor avisa de eso, la
 * ficha ofrece mover el corte una palabra a un lado o al otro, que es un clic
 * en vez de dos campos reescritos.
 */
@Injectable({
  providedIn: 'root',
})
export class AppNombrePersonaService {

  /**
   * Las partículas que no van solas: se mueven pegadas a su palabra.
   *
   * Si al mover el corte quedara un «de» suelto al final de los apellidos,
   * lo que se mueve son las dos palabras.
   */
  private static readonly PARTICULAS = [
    'DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y',
    'DA', 'DAS', 'DO', 'DOS', 'DI', 'DELLA',
    'VAN', 'VON', 'DER', 'DEN', 'LE',
    'SAN', 'SANTA', 'MC', 'MAC', 'ST',
  ];

  /** La última palabra de los apellidos pasa a ser la primera de los nombres. */
  aNombres(apellidos: string, nombres: string): { apellidos: string; nombres: string } {
    const izquierda = this.palabras(apellidos);
    if (izquierda.length <= 1) { return { apellidos, nombres }; }   // no se deja sin apellido

    // Se lleva también la partícula que la preceda: «de Jesús», no «Jesús»
    let corte = izquierda.length - 1;
    while (corte > 1 && this.esParticula(izquierda[corte - 1])) { corte--; }

    const mueve = izquierda.slice(corte);
    return {
      apellidos: izquierda.slice(0, corte).join(' '),
      nombres: [...mueve, ...this.palabras(nombres)].join(' '),
    };
  }

  /** La primera palabra de los nombres pasa a ser la última de los apellidos. */
  aApellidos(apellidos: string, nombres: string): { apellidos: string; nombres: string } {
    const derecha = this.palabras(nombres);
    if (derecha.length <= 1) { return { apellidos, nombres }; }     // no se deja sin nombre

    // Una partícula arrastra a la palabra siguiente: «de los Ángeles» entero
    let corte = 1;
    while (corte < derecha.length - 1 && this.esParticula(derecha[corte - 1])) { corte++; }

    const mueve = derecha.slice(0, corte);
    return {
      apellidos: [...this.palabras(apellidos), ...mueve].join(' '),
      nombres: derecha.slice(corte).join(' '),
    };
  }

  /** «CHUEZ CEDEÑO» -> «Chuez Cedeño», con las partículas en minúscula. */
  capitalizar(texto: string | null | undefined): string {
    const palabras = this.palabras(texto);
    if (!palabras.length) { return ''; }

    return palabras
      .map((p, i) => {
        const baja = p.toLocaleLowerCase('es-EC');
        if (i > 0 && this.esParticula(p)) { return baja; }
        return baja.charAt(0).toLocaleUpperCase('es-EC') + baja.slice(1);
      })
      .join(' ');
  }

  /** Apellidos y nombres en un solo texto, como lo guarda la base. */
  unir(apellidos: string | null | undefined, nombres: string | null | undefined): string {
    return [String(apellidos ?? '').trim(), String(nombres ?? '').trim()]
      .filter(Boolean).join(' ').replace(/\s+/g, ' ');
  }

  // ================================================================

  private palabras(texto: string | null | undefined): string[] {
    return String(texto ?? '').trim().split(/\s+/).filter(Boolean);
  }

  private esParticula(palabra: string): boolean {
    const limpia = palabra
      .toLocaleUpperCase('es-EC')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');   // «DÍ» y «DI» son la misma
    return AppNombrePersonaService.PARTICULAS.includes(limpia);
  }
}
