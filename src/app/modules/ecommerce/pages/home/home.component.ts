import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import { AppStateService } from '../../../../service/app-state.service';

/** Una fila de `accesos` en localStorage: lo que el perfil puede abrir. */
interface Acceso {
  user_id: number;
  nombre: string;
  url: string;
  perfil_nombre: string;
  icono: string;
  padre_id: number | null;
  orden: number;
}

interface ModuloCard {
  /** La ruta como está escrita en el menú; null mientras la pantalla no exista. */
  url: string | null;
  label: string;
  icon: string;
  color: string;
  descripcion: string;
  /** Con qué nombre manda el servidor la cuenta de esta área. */
  clave: string;
}

/**
 * Portada del módulo de la Página web: las pantallas que el perfil puede
 * abrir, en tarjetas.
 *
 * Mismo esquema que la portada de Inventarios. Las tarjetas NO son una lista
 * fija: se cruzan con los `accesos` que el login dejó en localStorage, así
 * que quien no tenga una pantalla no la ve aquí tampoco. La URL se compara
 * letra a letra con la del menú, de modo que una mal escrita no da error: la
 * tarjeta simplemente no sale.
 *
 * DOS COSAS QUE LAS DEMÁS PORTADAS NO TIENEN:
 *
 * 1. CADA TARJETA DICE LO QUE HAY DENTRO —«3 columnas con 12 enlaces», «33
 *    categorías, todas visibles»—, que es lo que se viene a mirar aquí: qué
 *    está configurado y qué está vacío, sin entrar en diez pantallas. Las
 *    cuentas llegan TODAS EN UNA LLAMADA; el CRM viejo pedía una por tarjeta
 *    y la portada parpadeaba mientras llegaban.
 *
 * 2. LAS ÁREAS QUE AÚN NO ESTÁN TRASLADADAS SE ENSEÑAN IGUAL, marcadas y sin
 *    enlace. Esconderlas daría la impresión de que la página web son nueve
 *    cosas; enseñarlas dice la verdad —esto es lo que hay y esto es lo que
 *    falta— y además sigue contando lo que tienen dentro, que se lee de las
 *    tablas viejas mientras existan. Como no tienen pantalla, tampoco tienen
 *    acceso que cruzar: salen siempre.
 */
@Component({
  selector: 'app-ecommerceHome',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RouterModule, NgTemplateOutlet],
})
export class EcommerceHomeComponent implements OnInit, OnDestroy {

  public modulosPermitidos: ModuloCard[] = [];
  public cargando = true;
  public error = false;

  private datos: any = {};
  private destroy$ = new Subject<void>();

  /**
   * Las pantallas del módulo, en el orden de la tienda de arriba abajo:
   * primero lo que se ve al entrar, luego lo que cuelga del menú y al final
   * el catálogo.
   *
   * EL COLOR VA POR FAMILIAS, no uno distinto por tarjeta: con trece, un
   * color cada una es un arcoíris en el que no se distingue nada. Las que se
   * tocan juntas comparten color, y así se ven los cuatro grupos de un
   * vistazo.
   */
  private readonly MODULOS_CONFIG: ModuloCard[] = [
    // ---------- La portada, y la portada dibujada ----------
    {
      url: 'ecommerce/editInicio',
      clave: 'inicio',
      label: 'CUERPOS DE LA TIENDA',
      icon: 'fa-layer-group',
      color: 'bg-primary',
      descripcion: 'La página de entrada y las de cada categoría o marca: banner, categorías, marcas y tus secciones de productos',
    },
    {
      url: 'ecommerce/modelado',
      clave: 'modelado',
      label: 'MODELADO DE LA PORTADA',
      icon: 'fa-object-group',
      color: 'bg-primary',
      descripcion: 'La página de entrada dibujada a escala: arrastra las secciones y estíralas para ver cómo queda',
    },

    // ---------- El marco que sale en todas las páginas ----------
    {
      url: 'ecommerce/editEncabezado',
      clave: 'encabezado',
      label: 'ENCABEZADO',
      icon: 'fa-window-maximize',
      color: 'bg-indigo',
      descripcion: 'La franja de arriba, el buscador, el menú y el aviso de crédito',
    },
    {
      url: 'ecommerce/editPie',
      clave: 'pie',
      label: 'PIE DE PÁGINA',
      icon: 'fa-table-columns',
      color: 'bg-indigo',
      descripcion: 'Las redes sociales y las columnas de enlaces del pie',
    },

    // ---------- Lo que se lee y dónde estamos ----------
    {
      url: 'ecommerce/allPaginasInformativas',
      clave: 'paginas',
      label: 'PÁGINAS INFORMATIVAS',
      icon: 'fa-file-lines',
      color: 'bg-teal',
      descripcion: 'Términos, políticas y garantías: el texto que se lee en la tienda',
    },
    {
      url: null,
      clave: 'sucursales',
      label: 'NUESTRAS TIENDAS',
      icon: 'fa-store',
      color: 'bg-teal',
      descripcion: 'Ciudades y sucursales con su dirección, horario y ubicación',
    },

    // ---------- El catálogo ----------
    {
      url: 'ecommerce/allCategoriasWeb',
      clave: 'categorias',
      label: 'CATEGORÍAS DE LA TIENDA',
      icon: 'fa-tags',
      color: 'bg-success',
      descripcion: 'Cuáles salen en el menú y en el inicio, con su nombre para la web',
    },
    {
      url: null,
      clave: 'galerias',
      label: 'GALERÍAS',
      icon: 'fa-images',
      color: 'bg-success',
      descripcion: 'Los bloques de imágenes: banners, tarjetas y logos de pago',
    },
    {
      url: 'ecommerce/allMarcasWeb',
      clave: 'marcas_tienda',
      label: 'MARCAS DE LA TIENDA',
      icon: 'fa-award',
      color: 'bg-success',
      descripcion: 'El logo de cada marca y cuáles salen en «Nuestras marcas»',
    },
    {
      url: null,
      clave: 'paginas_marca',
      label: 'PÁGINAS DE MARCA',
      icon: 'fa-copyright',
      color: 'bg-success',
      descripcion: 'Una página por marca: banner, fotos y contacto',
    },
    {
      url: null,
      clave: 'productos',
      label: 'PRODUCTOS DE LA TIENDA',
      icon: 'fa-box-open',
      color: 'bg-success',
      descripcion: 'Ficha técnica, imágenes y franjas del detalle de cada producto',
    },

    // ---------- Escaparates ----------
    {
      url: 'ecommerce/producto-por-seccion',
      clave: 'producto_secciones',
      label: 'PRODUCTOS POR SECCIÓN',
      icon: 'fa-basket-shopping',
      color: 'bg-warning',
      descripcion: 'Escaparates armados a mano: «Los más vendidos», «Ofertas de navidad»',
    },
  ];

  constructor(
    private http: HttpClient,
    private appStateService: AppStateService,
  ) {}

  ngOnInit(): void {
    this.cargarModulosPermitidos();
    this.cargar();

    // Si cambian los accesos sin recargar la página (otro perfil, permisos
    // retocados), las tarjetas se rehacen solas.
    this.appStateService.accesosActualizados$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.cargarModulosPermitidos());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Deja sólo las pantallas que el perfil tiene concedidas.
   *
   * Las que todavía no tienen pantalla (`url` en null) no se cruzan con nada
   * —no hay acceso que conceder a algo que no existe— y salen siempre.
   */
  cargarModulosPermitidos(): void {
    const guardado = localStorage.getItem('accesos');

    if (!guardado) { this.cargarModulosPorDefecto(); return; }

    try {
      const accesos: Acceso[] = JSON.parse(guardado);
      this.modulosPermitidos = this.MODULOS_CONFIG.filter(
        modulo => modulo.url === null || accesos.some(acceso => acceso.url === modulo.url));
    } catch (error) {
      // Si eso no se puede leer, mejor enseñarlo todo que una pantalla vacía:
      // el guardia de cada ruta sigue estando, así que nadie entra donde no debe
      console.error('Error al leer los accesos:', error);
      this.cargarModulosPorDefecto();
    }
  }

  private cargarModulosPorDefecto(): void {
    this.modulosPermitidos = [...this.MODULOS_CONFIG];
  }

  /** Las cuentas de todas las áreas, en una sola llamada. */
  async cargar(): Promise<void> {
    this.cargando = true;
    this.error = false;
    try {
      const res: any = await firstValueFrom(
        this.http.get(environment.URL_SERVICIOS + 'ecommerce/resumen/getResumen'));
      this.datos = res?.data ?? {};
    } catch {
      // Sin aviso emergente: la portada ya lo dice en su sitio, y un toast
      // sobre una pantalla que se acaba de abrir sólo tapa.
      this.error = true;
      this.datos = {};
    } finally {
      this.cargando = false;
    }
  }

  /** Si de las que quedan hay alguna que se pueda abrir. */
  get hayAlgunaAbrible(): boolean {
    return this.modulosPermitidos.some(modulo => modulo.url !== null);
  }

  /**
   * Lo que se lee debajo de la descripción.
   *
   * Cada área cuenta cosas distintas, así que no hay una fórmula: se escribe
   * una frase por área. Es más código que un «{{ n }} elementos», pero «3
   * columnas con 12 enlaces» dice algo y «15 elementos» no dice nada.
   */
  resumen(modulo: ModuloCard): string {
    // El modelado y el inicio son la misma portada vista de dos maneras, así
    // que cuentan lo mismo y el servidor no manda dos veces la cuenta
    const d = this.datos?.[modulo.clave === 'modelado' ? 'inicio' : modulo.clave];
    if (!d) { return this.error ? 'No se pudo cargar' : '—'; }

    const plural = (n: number, uno: string, varios: string) =>
      `${n} ${n === 1 ? uno : varios}`;

    switch (modulo.clave) {
      case 'inicio':
      case 'modelado':
        return `${plural(d.visibles, 'sección visible', 'secciones visibles')} de ${d.total}`;
      case 'encabezado':
        return plural(d.enlaces, 'enlace', 'enlaces')
             + (d.ocultos ? `, ${d.ocultos} ${d.ocultos === 1 ? 'oculto' : 'ocultos'}` : '');
      case 'pie':
        return `${plural(d.columnas, 'columna', 'columnas')} con ${plural(d.enlaces, 'enlace', 'enlaces')}`;
      case 'paginas':
        return plural(d.total, 'página', 'páginas')
             + (d.ocultas ? `, ${d.ocultas} ${d.ocultas === 1 ? 'oculta' : 'ocultas'}` : '');
      case 'sucursales':
        return `${plural(d.tiendas, 'tienda', 'tiendas')} en ${plural(d.ciudades, 'ciudad', 'ciudades')}`;
      case 'categorias':
        return d.visibles === d.total
          ? `${plural(d.total, 'categoría', 'categorías')}, todas visibles`
          : `${d.visibles} visibles de ${d.total}`;
      case 'galerias':
        return `${plural(d.galerias, 'galería', 'galerías')} con ${plural(d.imagenes, 'imagen', 'imágenes')}`;
      case 'marcas_tienda':
        return plural(d.marcas, 'marca', 'marcas');
      case 'paginas_marca':
        return plural(d.paginas, 'página', 'páginas');
      case 'productos':
        return plural(d.productos, 'producto', 'productos');
      case 'producto_secciones':
        return d.secciones === 0
          ? 'Todavía ninguna'
          : `${plural(d.secciones, 'sección', 'secciones')} con ${plural(d.productos, 'producto', 'productos')}`;
      default:
        return '—';
    }
  }
}
