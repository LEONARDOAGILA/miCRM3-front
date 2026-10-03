# miCRM3 — Front (Angular)

Angular 20, TypeScript 5.8, ag-Grid 28, ng-bootstrap 19, Bootstrap 5.
`ng serve` en el 4200; la API es `miCRM3-back` en el 8009.

## Reglas de la casa

- **Los componentes nuevos son `standalone`.** No se declaran en módulos.
- **`src/app/modules/demo` no se toca nunca.** Es la plantilla comprada y sirve
  de catálogo: cuando algo de ahí sirve, se **copia fuera** y se adapta. Editarlo
  rompe la referencia y se pierde al actualizar la plantilla.
- Plantillas con la sintaxis nueva: `@if`, `@for`, `@empty`.
- El `::ng-deep` que haga falta va acotado con `:host`, o se escapa al resto de
  la aplicación.

## Navegadores: iOS 14 es deliberado

`.browserslistrc` baja el suelo a **iOS >= 14** porque el front tiene que
funcionar en un iPhone 7 (su último iOS es el 15). El fichero explica el porqué
completo: con iOS >= 15 babel deja los campos estáticos de clase sin transpilar y
ngx-charts revienta con `Can't find variable: _c11`.

**No subir ese número** para «modernizar». Rompe el teléfono del cliente.

## Rutas nuevas

Una ruta nueva **da 404 aunque el componente esté perfecto** hasta que existe su
programa/menú en la base de datos (los permisos se leen de `accesos`). Eso lo
crea Leonardo desde la pantalla de administración: si una pantalla nueva no
aparece, es lo primero que hay que descartar.

## Dónde está lo reutilizable

- `src/app/components/campos/` — los campos de formulario compartidos
  (`campoTexto`, `campoBusqueda`, …). Antes de hacer un input nuevo, mirar aquí.
- `src/app/components/modal/modal-header/` — la cabecera de todos los modales.
- Patrones que se repiten y conviene copiar de donde ya funcionan:
  - alto de rejillas y modales ajustado a la pantalla → `seguridad/pages/users/allUsers`
  - divisor arrastrable entre columnas → `config/pages/administrador-archivos/file-manager`
  - selector de rango de fechas → `config/pages/boletines/saveBoletin`
    (ngx-daterangepicker-material necesita sus `LOCALE_CONFIG`/`LocaleService`
    en cada componente: en esta aplicación no hay `forRoot()`)

## ag-Grid: cómo se usa aquí

Acciones en columna con `cellRenderer` que pinta botones con `data-accion`, y un
único manejador que lee ese atributo. Menú de clic derecho propio (flotante,
posicionado a mano) porque el de ag-Grid es de la versión Enterprise.

Si la rejilla vive dentro de algo que cambia de tamaño —un panel que se expande,
una columna que se arrastra— hay que **volver a calcular el alto a mano**; no se
ajusta sola.

Ojo con `overflow: hidden`: recorta los desplegables de Bootstrap que salen de la
tarjeta. Para esos menús, elemento flotante propio.
