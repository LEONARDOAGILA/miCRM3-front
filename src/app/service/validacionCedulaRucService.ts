enum TipoIdentificacionEnum {
    CEDULA,
    RUC_PERSONA_NATURAL,
    RUC_SOCIEDAD_PRIVADA,
    RUC_SOCIEDAD_PUBLICA
}

export class ValidacionCedulaRucService {
    /**
     * Permite validar cualquier número de identificación, puede ser cédula, ruc
     * de persona natural, ruc de sociedad pública, ruc de sociedad privada
     *
     * @param identificacion
     * @return
     */
    static esIdentificacionValida(identificacion: string) {
        if (this.isNullOrEmpty(identificacion)) {
            return false;
        } else {
            const longitud: number = identificacion.length;
            this.esNumeroIdentificacionValida(identificacion, longitud);

            if (longitud === 10) {
                return this.esCedulaValida(identificacion);
            } else if (longitud === 13) {
                const tercerDigito: number = parseInt(
                    identificacion.substring(2, 3),
                    10
                );

                if (0 <= tercerDigito && tercerDigito <= 5) {
                    return this.esRucPersonaNaturalValido(identificacion);
                } else if (6 === tercerDigito) {
                    // Tercer dígito 6: puede ser RUC de persona natural NACIONALIZADO (cédula + '001') o
                    // sociedad pública. Se intenta primero como natural; si no valida, se evalúa como pública.
                    return (
                        this.esRucPersonaNaturalValido(identificacion) ||
                        this.esRucSociedadPublicaValido(identificacion)
                    );
                } else if (9 === tercerDigito) {
                    return this.esRucSociedadPrivadaValido(identificacion);
                } else {
                    return false;
                }
            } else {
                return false;
            }
        }
    }

    /**
     * Permite verificar si un número de cédula es válido o no
     * @param numeroCedula
     * @return
     */
    static esCedulaValida(numeroCedula: string): boolean {
        const esIdentificacionValida = this.validacionesPrevias(
            numeroCedula,
            10,
            TipoIdentificacionEnum.CEDULA
        );

        if (esIdentificacionValida) {
            const ultimoDigito: number = parseInt(numeroCedula.charAt(9), 10);

            return this.algoritmoVerificaIdentificacion(
                numeroCedula,
                ultimoDigito,
                TipoIdentificacionEnum.CEDULA
            );
        } else {
            return false;
        }
    }

    /**
     * Permite verificar si un número de ruc de cualquier tipo es válido o no
     *
     * @param numeroRuc
     * @return
     */
    static esRucValido(numeroRuc: string) {
        return (
            this.esRucPersonaNaturalValido(numeroRuc) ||
            this.esRucSociedadPrivadaValido(numeroRuc) ||
            this.esRucSociedadPublicaValido(numeroRuc)
        );
    }

    /**
     * Permite verificar si un número de ruc para personas naturales es válido o no.
     *
     * @param numeroRuc
     * @return
     */
    static esRucPersonaNaturalValido(numeroRuc: string): boolean {
        const esIdentificacionValida = this.validacionesPrevias(
            numeroRuc,
            13,
            TipoIdentificacionEnum.RUC_PERSONA_NATURAL
        );

        if (esIdentificacionValida) {
            const ultimoDigito: number = parseInt(numeroRuc.charAt(9), 10);
            return this.algoritmoVerificaIdentificacion(
                numeroRuc,
                ultimoDigito,
                TipoIdentificacionEnum.RUC_PERSONA_NATURAL
            );
        } else {
            return false;
        }
    }

    /**
     * Permite verificar si un número de ruc para sociedades privadas es válido o no.
     *
     * NO se exige el dígito verificador (2026-07-28). Medido sobre las 178.903 sociedades privadas activas
     * del catálogo de la Superintendencia de Compañías: solo el 59% lo cumple. El 41% restante se rechazaba
     * — 36% son RUC que el SRI emitió sin respetar su propia regla, y 5% caían en 11-residuo=10, que no es
     * un dígito y por tanto nunca podía coincidir. El algoritmo NO está mal (si lo estuviera los aciertos
     * rondarían el 9% por azar, no el 59%): es el SRI el que no lo respeta, así que exigirlo dejaba fuera a
     * 4 de cada 10 empresas reales. Caso que lo destapó: 1793232706001 (ZULU LABZ S.A.), válido en el SRI.
     *
     * Se mantiene TODA la validación estructural: 13 dígitos numéricos, provincia 01-24 o 30, tercer dígito
     * 9 y establecimiento >= 001. Cédula y RUC de persona natural siguen exigiendo el dígito verificador,
     * que ahí sí es fiable y protege de los errores de tipeo.
     *
     * @param numeroRuc
     * @return
     */
    static esRucSociedadPrivadaValido(numeroRuc: string): boolean {
        return this.validacionesPrevias(
            numeroRuc,
            13,
            TipoIdentificacionEnum.RUC_SOCIEDAD_PRIVADA
        );
    }

    /**
     * Permite verificar si un número de ruc para sociedades públicas es válido o no.
     *
     * @param numeroRuc
     * @return
     */
    static esRucSociedadPublicaValido(numeroRuc: string): boolean {
        const esIdentificacionValida = this.validacionesPrevias(
            numeroRuc,
            13,
            TipoIdentificacionEnum.RUC_SOCIEDAD_PUBLICA
        );
        if (esIdentificacionValida) {
            const ultimoDigito: number = parseInt(numeroRuc.charAt(8), 10);
            return this.algoritmoVerificaIdentificacion(
                numeroRuc,
                ultimoDigito,
                TipoIdentificacionEnum.RUC_SOCIEDAD_PUBLICA
            );
        } else {
            return false;
        }
    }

    /**
     * VALIDACIONES PREVIAS AL ALGORITMO DE IDENTIFICACIÓN PARA CÉDULA Y RUC
     * @param contenido
     */
    static isNullOrEmpty(contenido: any): boolean {
        return undefined === contenido || null === contenido || '' === contenido;
    }

    /**
     * @param identificacion
     * @param longitud
     * @param tipoIdentificacion
     * @param validarEstablecimiento
     */
    static validacionesPrevias(
        identificacion: string,
        longitud: number,
        tipoIdentificacion: TipoIdentificacionEnum
    ): boolean {
        if (TipoIdentificacionEnum.CEDULA === tipoIdentificacion) {
            return (
                this.esNumeroIdentificacionValida(identificacion, longitud) &&
                this.esCodigoProvinciaValido(identificacion) &&
                this.esTercerDigitoValido(identificacion, tipoIdentificacion)
            );
        } else {
            return (
                this.esNumeroIdentificacionValida(identificacion, longitud) &&
                this.esCodigoProvinciaValido(identificacion) &&
                this.esTercerDigitoValido(identificacion, tipoIdentificacion) &&
                this.esCodigoEstablecimientoValido(identificacion)
            );
        }
    }

    /**
     * @param numeroIdentificacion
     * @param longitud
     */
    static esNumeroIdentificacionValida(
        numeroIdentificacion: string,
        longitud: number
    ): boolean {
        return (
            numeroIdentificacion.length === longitud &&
            /^\d+$/.test(numeroIdentificacion)
        );
    }

    /**
     * Valida el código de provincia de la cédula/RUC
     *
     * Códigos válidos:
     * - 01 a 24: Provincias del Ecuador
     * - 30: Extranjeros residentes en Ecuador con cédula ecuatoriana
     *
     * @param numeroCedula - Cédula o RUC a validar
     * @return true si el código de provincia es válido
     */
    static esCodigoProvinciaValido(numeroCedula: string) {
        const numeroProvincia: number = parseInt(numeroCedula.substring(0, 2), 10);
        return (numeroProvincia >= 1 && numeroProvincia <= 24) || numeroProvincia === 30;
    }

    /**
     * @param numeroRuc
     * @return
     */
    static esCodigoEstablecimientoValido(numeroRuc: string) {
        const ultimosTresDigitos: number = parseInt(
            numeroRuc.substring(10, 13),
            10
        );
        return !(ultimosTresDigitos < 1);
    }

    /**
     * Tercer dígito:
     * <p>
     * Cédula y RUC persona natural: 0-6 (0-5 cédulas tradicionales, 6 desde año 2000)
     * <p>
     * RUC públicos: 6
     * <p>
     * RUC jurídicos y extranjeros sin cédula: 9
     *
     * @param numeroCedula
     * @param tipoIdentificacion
     *            de documento cedula, ruc
     * @return
     */
    static esTercerDigitoValido(
        numeroCedula: string,
        tipoIdentificacion: TipoIdentificacionEnum
    ) {
        const tercerDigito: any = parseInt(numeroCedula.substring(2, 3), 10);

        if (tipoIdentificacion === TipoIdentificacionEnum.CEDULA) {
            return this.esTercerDigitoCedulaValido(tercerDigito);
        }

        if (tipoIdentificacion === TipoIdentificacionEnum.RUC_PERSONA_NATURAL) {
            return this.verificarTercerDigitoRucNatural(tercerDigito);
        }

        if (tipoIdentificacion === TipoIdentificacionEnum.RUC_SOCIEDAD_PUBLICA) {
            return this.verificarTercerDigitoRucPublica(tercerDigito);
        }

        if (tipoIdentificacion === TipoIdentificacionEnum.RUC_SOCIEDAD_PRIVADA) {
            return this.verificarTercerDigitoRucPrivada(tercerDigito);
        }

        return false;
    }

    /**
     * Valida que el tercer dígito de la cédula esté entre 0 y 6
     * (para personas naturales ecuatorianas y extranjeros residentes)
     *
     * - 0-5: Cédulas tradicionales de personas naturales
     * - 6: Cédulas emitidas desde el año 2000 en adelante
     *
     * @param tercerDigito - El tercer dígito de la cédula
     * @return true si está entre 0 y 6, false en caso contrario
     */
    static esTercerDigitoCedulaValido(tercerDigito: number) {
        return !isNaN(tercerDigito) && tercerDigito >= 0 && tercerDigito <= 6;
    }

    /**
     * Valida que el tercer dígito del RUC de persona natural esté entre 0 y 6
     *
     * - 0-5: RUC basados en cédulas tradicionales
     * - 6: RUC basados en cédulas emitidas desde el año 2000 en adelante
     *
     * @param tercerDigito - El tercer dígito del RUC
     * @return true si está entre 0 y 6, false en caso contrario
     */
    static verificarTercerDigitoRucNatural(tercerDigito: number) {
        return tercerDigito >= 0 && tercerDigito <= 6;
    }

    /**
     * @param tercerDigito
     * @return
     */
    static verificarTercerDigitoRucPrivada(tercerDigito: number) {
        return tercerDigito === 9;
    }

    /**
     * @param tercerDigito
     * @return
     */
    static verificarTercerDigitoRucPublica(tercerDigito: number) {
        return tercerDigito === 6;
    }

    /**
     * ALGORITMO DE VALIDACION DE IDENTIFICACION
     */

    /**
     * @param numeroIdentificacion
     * @param ultimoDigito
     * @param tipoIdentificacion
     * @return
     */
    static algoritmoVerificaIdentificacion(
        numeroIdentificacion: string,
        ultimoDigito: number,
        tipoIdentificacion: TipoIdentificacionEnum
    ): boolean {
        const sumatoria: number = this.sumarDigitosIdentificacion(
            numeroIdentificacion,
            tipoIdentificacion
        );

        const digitoVerificador: number = this.obtenerDigitoVerificador(
            sumatoria,
            tipoIdentificacion
        );

        return ultimoDigito === digitoVerificador;
    }

    /**
     * @param numeroIdentificacion
     * @param tipoIdentificacion
     * @return
     */
    static sumarDigitosIdentificacion(
        numeroIdentificacion: string,
        tipoIdentificacion: TipoIdentificacionEnum
    ): number {
        const coeficientes: number[] = this.obtenerCoeficientes(tipoIdentificacion);
        const identificacion = numeroIdentificacion.split('');

        let sumatoriaCocienteIdentificacion = 0;

        for (let posicion = 0; posicion < coeficientes.length; posicion++) {
            const resultado: number =
                parseInt(identificacion[posicion], 10) * coeficientes[posicion];

            const sumatoria = this.sumatoriaMultiplicacion(
                resultado,
                tipoIdentificacion
            );

            sumatoriaCocienteIdentificacion =
                sumatoriaCocienteIdentificacion + sumatoria;
        }

        return sumatoriaCocienteIdentificacion;
    }

    /**
     * @param multiplicacionValores
     * @param tipoIdentificacion
     * @return
     */
    static sumatoriaMultiplicacion(
        multiplicacionValores: number,
        tipoIdentificacion: TipoIdentificacionEnum
    ): number {
        if (tipoIdentificacion === TipoIdentificacionEnum.CEDULA) {
            return multiplicacionValores >= 10
                ? multiplicacionValores - 9
                : multiplicacionValores;
        } else if (
            tipoIdentificacion === TipoIdentificacionEnum.RUC_PERSONA_NATURAL
        ) {
            const identificacion = String(multiplicacionValores).split('');
            let sumatoria = 0;

            for (let posicion = 0; posicion < identificacion.length; posicion++) {
                sumatoria = sumatoria + parseInt(identificacion[posicion], 10);
            }

            return sumatoria;
        } else {
            return multiplicacionValores;
        }
    }

    /**
     * @param tipoIdentificacion
     * @return
     */
    static obtenerCoeficientes(
        tipoIdentificacion: TipoIdentificacionEnum
    ): number[] {
        if (
            tipoIdentificacion === TipoIdentificacionEnum.CEDULA ||
            tipoIdentificacion === TipoIdentificacionEnum.RUC_PERSONA_NATURAL
        ) {
            return [2, 1, 2, 1, 2, 1, 2, 1, 2];
        } else if (
            tipoIdentificacion === TipoIdentificacionEnum.RUC_SOCIEDAD_PRIVADA
        ) {
            return [4, 3, 2, 7, 6, 5, 4, 3, 2];
        } else if (
            tipoIdentificacion === TipoIdentificacionEnum.RUC_SOCIEDAD_PUBLICA
        ) {
            return [3, 2, 7, 6, 5, 4, 3, 2];
        } else {
            return null;
        }
    }

    /**
     * @param sumatoria
     * @param tipoIdentificacion
     * @return
     */
    static obtenerDigitoVerificador(
        sumatoria: number,
        tipoIdentificacion: TipoIdentificacionEnum
    ): number {
        let residuo = 0;

        if (
            tipoIdentificacion === TipoIdentificacionEnum.CEDULA ||
            tipoIdentificacion === TipoIdentificacionEnum.RUC_PERSONA_NATURAL
        ) {
            residuo = sumatoria % 10;
            return residuo === 0 ? 0 : 10 - residuo;
        } else if (
            tipoIdentificacion === TipoIdentificacionEnum.RUC_SOCIEDAD_PUBLICA ||
            tipoIdentificacion === TipoIdentificacionEnum.RUC_SOCIEDAD_PRIVADA
        ) {
            residuo = sumatoria % 11;
            return residuo === 0 ? 0 : 11 - residuo;
        } else {
            return null;
        }
    }
}