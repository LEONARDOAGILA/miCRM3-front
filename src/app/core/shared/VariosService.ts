import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const vempresas = [
  { id: 1, name: "ALMACENES ESPANA" },
  { id: 2, name: "PROYLECMA" },
];
export const vlistaLateralidad = [
  { id: 1, name: "IZQUIERDO" },
  { id: 2, name: "DERECHO" },
  { id: 3, name: "AMBIDIESTRO" },
];
export const vtipoSangre = [
  { id: 1, name: "A+" },
  { id: 2, name: "O+" },
  { id: 3, name: "B+" },
  { id: 4, name: "AB+" },
  { id: 5, name: "A-" },
  { id: 6, name: "0-" },
  { id: 7, name: "B-" },
  { id: 8, name: "AB-" },
];

export const vtiposDiscapacidad = [
  { id: 1, name: "OTRA" },
  { id: 2, name: "COGNITIVO" },
  { id: 3, name: "FISICA" },
];
export const vsexoLista = [
  { id: 1, name: "MASCULINO" },
  { id: 2, name: "FEMENINO" },
];
export const vreligion = [
  { id: 1, name: "CATOLICA" },
  { id: 2, name: "EVANGELICA" },
  { id: 3, name: "TESTIGOS DE JEHOVA" },
  { id: 4, name: "MORMONA" },
  { id: 5, name: "OTRA" },
];

export const vorientacionSexual = [
  { id: 1, name: "LESBIANA" },
  { id: 2, name: "GAY" },
  { id: 3, name: "BISEXUAL" },
  { id: 4, name: "HETEROSEXUAL" },
  { id: 5, name: "NO SABE/NO RESPONDE" },
];
export const videntidadGenero = [
  { id: 1, name: "FEMENINO" },
  { id: 2, name: "MASCULINO" },
  { id: 3, name: "TRANS-FEMENINO" },
  { id: 4, name: "TRANS-MASCULINO" },
  { id: 5, name: "NO SABE/NO RESPONDE" },
];

export const _vaPrioridadesCaso = [
  {
    id: 1,
    nombre: "GENERAL",
    estado: true,
    color: "#D2B4DE",
  },
  {
    id: 2,
    nombre: "BAJA",
    estado: true,
    color: "#58D68D",
  },
  {
    id: 3,
    nombre: "MEDIA",
    estado: true,
    color: "#F7DC6F",
  },
  {
    id: 4,
    nombre: "ALTA",
    estado: true,
    color: "#EC7063",
  },
];


export function var_compararIdentificaciones(
  identificacion1: string,
  identificacion2: string
) {
  if (identificacion1.length == 8 && identificacion2.length == 8) {
    if (identificacion1 == identificacion2) {
      return true;
    }
    return false;
  }
  if (identificacion1.length == 10 && identificacion2.length == 10) {
    if (identificacion1 == identificacion2) {
      return true;
    }
    return false;
  }
  if (identificacion1.length == 13 && identificacion2.length == 13) {
    if (identificacion1.substring(0, 10) && identificacion2.substring(0, 10)) {
      return true;
    }
    return false;
  }
  return false;
}

  export const v_listaPeriodo = [
    { id: 1, name: 2023 },
    { id: 2, name: 2024 },
    { id: 3, name: 2025 },
    { id: 4, name: 2026 },
    { id: 5, name: 2027 },
  ];


export const v_listaMeses = [
  { id: 1, name: "ENERO" },
  { id: 2, name: "FEBRERO" },
  { id: 3, name: "MARZO" },
  { id: 4, name: "ABRIL" },
  { id: 5, name: "MAYO" },
  { id: 6, name: "JUNIO" },
  { id: 7, name: "JULIO" },
  { id: 8, name: "AGOSTO" },
  { id: 9, name: "SEPTIEMBRE" },
  { id: 10, name: "OCTUBRE" },
  { id: 11, name: "NOVIEMBRE" },
  { id: 12, name: "DICIEMBRE" },
];


export const v_lista_aplicaciones = [
  { id: 1, name: "DYNAMO WEB" },
  { id: 2, name: "DYNAMO MOVIL" },
  { id: 3, name: "CRM" },
  { id: 4, name: "ALMAESPANA APP COTIZADOR" },
  { id: 5, name: "NOVASOFT" },
];

export const v_lista_referencia_cargo = [
  { id: 1, name: "JEFE DE AGENCIA" },
  { id: 2, name: "AGENTE VENDEDOR" },
  { id: 3, name: "SECRETARIA COBRANZAS" },
  { id: 4, name: "AGENTE COBRADOR" },
  { id: 5, name: "BODEGA" },
  { id: 6, name: "ADMINISTRATIVO" },
];



