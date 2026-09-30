import { Injectable } from '@angular/core';

/**
 * Generador de contraseñas temporales.
 *
 * Extraído de ChangePasswordComponent para poder usarlo también en el alta de
 * usuarios. Es lógica sensible: duplicarla es la forma segura de que las dos
 * pantallas acaben divergiendo y una de las dos se quede con un generador débil.
 */
@Injectable({ providedIn: 'root' })
export class GeneradorClaveService {

  /** Longitud por defecto. Entra en el maxLength de los formularios que la usan. */
  private readonly LONGITUD_POR_DEFECTO = 16;

  /**
   * Alfabetos sin caracteres ambiguos: fuera las mayúsculas I/O, las minúsculas
   * l/o y los dígitos 0/1, que se confunden entre sí al dictar la clave por
   * teléfono o al teclearla desde un papel.
   *
   * Los símbolos salen del conjunto que acepta app-campoClave
   * (/[!@#$%^&*(),.?":{}|<>]/) descartando los que dan problemas al pegarlos en
   * una consola, un CSV o una URL: comillas, coma, paréntesis, llaves, dos
   * puntos, barra vertical y los signos de mayor/menor.
   *
   * 24 + 24 + 8 + 8 = 64 símbolos, es decir 6 bits exactos por carácter.
   */
  private readonly MAYUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  private readonly MINUSCULAS = 'abcdefghijkmnpqrstuvwxyz';
  private readonly DIGITOS = '23456789';
  private readonly SIMBOLOS = '!@#$%&*?';

  /**
   * Entero uniforme en [0, max) con el CSPRNG del navegador.
   * Descarta el rango sobrante para no introducir sesgo de módulo.
   * Math.random() no sirve aquí: no es criptográfico y es predecible.
   */
  private aleatorio(max: number): number {
    const limite = Math.floor(0xFFFFFFFF / max) * max;
    const buffer = new Uint32Array(1);
    let valor: number;
    do {
      crypto.getRandomValues(buffer);
      valor = buffer[0];
    } while (valor >= limite);
    return valor % max;
  }

  /** Un carácter al azar del alfabeto indicado. */
  private elegir(alfabeto: string): string {
    return alfabeto.charAt(this.aleatorio(alfabeto.length));
  }

  /**
   * Fisher-Yates con el mismo CSPRNG. Sin barajar, la posición de cada clase de
   * carácter sería fija y el atacante podría descartar medio espacio de búsqueda.
   */
  private barajar(caracteres: string[]): string[] {
    for (let i = caracteres.length - 1; i > 0; i--) {
      const j = this.aleatorio(i + 1);
      [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
    }
    return caracteres;
  }

  /** ¿Tiene la clave las cuatro clases que exige app-campoClave? */
  private cumpleRequisitos(clave: string): boolean {
    return /[A-Z]/.test(clave)
        && /[a-z]/.test(clave)
        && /\d/.test(clave)
        && /[!@#$%^&*(),.?":{}|<>]/.test(clave);
  }

  /**
   * Reparto alternativo: fuerza un carácter de cada clase y baraja.
   * Siempre produce una clave válida, pero sobrerrepresenta dígitos y símbolos
   * (sus pools son de 8 frente a los 24 de las letras). Solo se usa como red de
   * seguridad si el muestreo por rechazo agotara los intentos.
   */
  private generarConCuotas(longitud: number): string {
    const alfabeto = this.MAYUSCULAS + this.MINUSCULAS + this.DIGITOS + this.SIMBOLOS;
    const caracteres: string[] = [
      this.elegir(this.MAYUSCULAS),
      this.elegir(this.MINUSCULAS),
      this.elegir(this.DIGITOS),
      this.elegir(this.SIMBOLOS),
    ];
    while (caracteres.length < longitud) {
      caracteres.push(this.elegir(alfabeto));
    }
    return this.barajar(caracteres).join('');
  }

  /**
   * Clave temporal sobre un alfabeto de 64 símbolos.
   *
   * Usa muestreo por rechazo: sortea los caracteres uniformemente y repite si
   * falta alguna clase. Así la distribución es *exactamente* uniforme sobre el
   * conjunto de claves válidas, sin el sesgo que introduce reservar posiciones
   * por clase.
   *
   *   Entropía (16 caracteres) = log2(64^16) + log2(P(válida)) = 96 - 0,38 = 95,6 bits
   *   P(válida) ~= 0,77  ->  1,3 intentos de media
   */
  public generar(longitud: number = this.LONGITUD_POR_DEFECTO): string {
    const alfabeto = this.MAYUSCULAS + this.MINUSCULAS + this.DIGITOS + this.SIMBOLOS;
    const MAX_INTENTOS = 50;   // agotarlos tiene probabilidad ~10^-32

    for (let intento = 0; intento < MAX_INTENTOS; intento++) {
      let candidata = '';
      for (let i = 0; i < longitud; i++) {
        candidata += this.elegir(alfabeto);
      }
      if (this.cumpleRequisitos(candidata)) {
        return candidata;
      }
    }

    // Inalcanzable en la práctica; evita devolver una clave inválida
    return this.generarConCuotas(longitud);
  }

  /**
   * Copia la clave al portapapeles. Devuelve false si el navegador lo impide
   * (contexto no seguro o permiso denegado) para que la vista avise.
   */
  public async copiar(clave: string): Promise<boolean> {
    if (!clave) { return false; }
    try {
      await navigator.clipboard.writeText(clave);
      return true;
    } catch {
      return false;
    }
  }
}
