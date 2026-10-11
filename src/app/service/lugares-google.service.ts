import { Injectable } from '@angular/core';

/** Una sugerencia del buscador de lugares. */
export interface SugerenciaLugar {
  placeId: string;
  /** La línea gorda: «Cuenca». */
  principal: string;
  /** La de debajo: «Azuay». Sin el «, Ecuador» del final, que sobra aquí. */
  secundario: string;
  /** El objeto Place de la API, para pedirle sus campos al elegirlo. */
  place: any;
}

/**
 * El buscador de lugares de Google (Places API New), compartido.
 *
 * POR QUÉ ES UN SERVICIO. Dos pantallas buscan lugares —el selector de
 * dirección de la ficha del cliente y el mapa de zonas— y lo que hacen con
 * el resultado es distinto: una pone un marcador y se trae la dirección
 * desmenuzada, la otra sólo mueve el mapa. Lo que SÍ es idéntico es pedir las
 * sugerencias: el token de sesión, el sesgo a lo que se está viendo, el
 * recorte a Ecuador y el idioma. Eso es lo que vive aquí.
 *
 * EL TOKEN DE SESIÓN ABARATA LA FACTURA. Google cobra el autocompletado por
 * sesión y no por pulsación: todas las consultas que llevan el mismo token
 * cuentan como una, y la sesión se cierra al pedir los campos del lugar
 * elegido. Por eso hay que llamar a `nuevaSesion()` después de elegir; si no,
 * la siguiente búsqueda sigue colgando de una sesión ya cerrada.
 */
@Injectable({ providedIn: 'root' })
export class LugaresGoogleService {

  private places: any = null;
  private tokenSesion: any = null;

  /**
   * Hay que dárselo una vez, cuando la pantalla ya cargó la librería.
   *
   * No lo carga el servicio por su cuenta a propósito: quien pinta el mapa ya
   * está esperando a `importLibrary`, y hacerlo dos veces sería encadenar dos
   * esperas para lo mismo.
   */
  usar(places: any): void {
    this.places = places;
    this.nuevaSesion();
  }

  get listo(): boolean { return !!this.places; }

  /** Sesión nueva. Se llama al terminar de elegir un lugar. */
  nuevaSesion(): void {
    if (this.places?.AutocompleteSessionToken) {
      this.tokenSesion = new this.places.AutocompleteSessionToken();
    }
  }

  /**
   * Las sugerencias para lo que se ha escrito.
   *
   * @param texto Lo tecleado. Con menos de tres letras no se pregunta:
   *              Places devuelve cualquier cosa y se paga igual.
   * @param mapa  El mapa, si lo hay: se prefiere lo cercano a lo que se ve.
   * @param tipos Para acotar qué se busca. El mapa de zonas pide
   *              `['(cities)']` porque lo que quiere ubicar son ciudades y
   *              cantones, no portales.
   */
  async sugerencias(texto: string, mapa?: any, tipos?: string[]): Promise<SugerenciaLugar[]> {
    const q = (texto ?? '').trim();
    if (!this.places || q.length < 3) { return []; }

    const peticion: any = {
      input: q,
      sessionToken: this.tokenSesion,
      includedRegionCodes: ['ec'],       // sólo Ecuador
      language: 'es',
      region: 'ec',
    };

    // Preferir lo cercano a lo que se está viendo. Al abrir el mapa todavía
    // no hay límites (llegan con el primer `idle`), y entonces no se sesga.
    const b = mapa?.getBounds?.();
    if (b) { peticion.locationBias = b; }

    // EL FILTRO POR TIPO VA A PRUEBA DE FALLOS. «(cities)» es una colección
    // de la Places API ANTIGUA y no está claro que la nueva la acepte; no se
    // pudo comprobar porque la clave sólo responde desde los dominios de la
    // aplicación. Si la petición con tipos falla se repite sin ellos: más
    // vale buscar de más que no buscar. Cuando el filtro sí vale, lo único
    // que cambia es que salen menos cosas y más limpias.
    if (tipos?.length) {
      try {
        return this.traducir(await this.pedir({ ...peticion, includedPrimaryTypes: tipos }));
      } catch (e) {
        console.warn('Places no aceptó el filtro por tipo; se busca sin él.', e);
      }
    }

    return this.traducir(await this.pedir(peticion));
  }

  private async pedir(peticion: any): Promise<any[]> {
    const { suggestions } = await this.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(peticion);
    return suggestions ?? [];
  }

  private traducir(suggestions: any[]): SugerenciaLugar[] {
    return suggestions
      .filter((s: any) => s.placePrediction)
      .map((s: any) => ({
        placeId: s.placePrediction.placeId,
        principal: s.placePrediction.mainText?.text ?? s.placePrediction.text?.text ?? '',
        secundario: (s.placePrediction.secondaryText?.text ?? '').replace(/,\s*Ecuador\s*$/i, ''),
        place: s.placePrediction.toPlace(),
      }));
  }
}
