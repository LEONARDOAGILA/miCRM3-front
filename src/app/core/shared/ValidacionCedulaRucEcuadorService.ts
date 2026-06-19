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
                    return this.esRucSociedadPublicaValido(identificacion);
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
     * @param numeroRuc
     * @return
     */
    static esRucSociedadPrivadaValido(numeroRuc: string): boolean {
        const esIdentificacionValida = this.validacionesPrevias(
            numeroRuc,
            13,
            TipoIdentificacionEnum.RUC_SOCIEDAD_PRIVADA
        );
        if (esIdentificacionValida) {
            const ultimoDigito: number = parseInt(numeroRuc.charAt(9), 10);
            return this.algoritmoVerificaIdentificacion(
                numeroRuc,
                ultimoDigito,
                TipoIdentificacionEnum.RUC_SOCIEDAD_PRIVADA
            );
        } else {
            return false;
        }
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
     * @param numeroCedula
     */
    static esCodigoProvinciaValido(numeroCedula: string) {
        const numeroProvincia: number = parseInt(numeroCedula.substring(0, 2), 10);
        return numeroProvincia > 0 && numeroProvincia <= 24;
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
     * RUC jurídicos y extranjeros sin cédula: 9
     * <p>
     * RUC públicos: 6
     * <p>
     * RUC natural menor a 6: (0,1,2,3,4,5)
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
     * @param tercerDigito
     * @return
     */
    static esTercerDigitoCedulaValido(tercerDigito: number) {
        return !isNaN(tercerDigito) && !(tercerDigito < 0 && tercerDigito > 5);
    }

    /**
     * @param tercerDigito
     * @return
     */
    static verificarTercerDigitoRucNatural(tercerDigito: number) {
        return tercerDigito >= 0 || tercerDigito <= 5;
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