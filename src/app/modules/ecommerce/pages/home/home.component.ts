import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import { PanelComponent } from '../../../../components/panel/panel.component';

/** Una tarjeta de la portada: un área de la página web. */
interface TarjetaArea {
  clave: string;
  titulo: string;
  icono: string;
  descripcion: string;
  /** La ruta dentro del módulo; null mientras la pantalla no exista. */
  ruta: string | null;
  /** Lo que se lee debajo: «4 enlaces, 1 oculto». Lo arma `resumir`. */
  resumen?: string;
}

/**
 * LA PORTADA DEL MÓDULO ECOMMERCE.
 *
 * Una rejilla con las once áreas de la página web, cada una con lo que hay
 * dentro —«3 columnas con 12 enlaces», «33 categorías, todas visibles»— y su
 * enlace. Sirve para ver de un vistazo qué está configurado y qué está vacío
 * sin entrar en diez pantallas.
 *
 * LAS QUE AÚN NO ESTÁN TRASLADADAS SE ENSEÑAN IGUAL, marcadas y sin enlace,
 * en vez de esconderlas. Esconderlas daría la impresión de que la página web
 * son seis cosas; enseñarlas dice la verdad —esto es lo que hay y esto es lo
 * que falta— y además sigue contando lo que ya tienen dentro, que se lee de
 * las tablas viejas mientras existan.
 *
 * EL CONTEO VIENE EN UNA SOLA LLAMADA. El CRM viejo pedía uno por tarjeta: la
 * portada parpadeaba mientras llegaban y una sola caída dejaba su tarjeta en
 * «No se pudo cargar» para siempre.
 */
@Component({
  selector: 'app-ecommerceHome',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CommonModule, PanelComponent],
})
export class EcommerceHomeComponent implements OnInit {

  public titulo = 'Página web';
  public cargando = true;
  public error = false;

  private datos: any = {};

  /**
   * El orden es el de la tienda de arriba abajo: primero lo que se ve al
   * entrar, luego lo que cuelga del menú, y al final el catálogo.
   */
  public readonly areas: TarjetaArea[] = [
    { clave: 'inicio', titulo: 'Inicio de la tienda', icono: 'fa-house', ruta: 'editInicio',
      descripcion: 'Banner, categorías destacadas, ofertas, mosaico, bloques y marcas.' },
    { clave: 'modelado', titulo: 'Modelado de la portada', icono: 'fa-object-group', ruta: 'modelado',
      descripcion: 'La portada dibujada a escala: arrastra las secciones y estíralas para ver cómo queda.' },
    { clave: 'encabezado', titulo: 'Encabezado', icono: 'fa-window-maximize', ruta: 'editEncabezado',
      descripcion: 'La franja de arriba, el buscador, el menú y el aviso de crédito.' },
    { clave: 'pie', titulo: 'Pie de página', icono: 'fa-table-columns', ruta: 'editPie',
      descripcion: 'Las redes sociales y las columnas de enlaces del pie.' },
    { clave: 'paginas', titulo: 'Páginas informativas', icono: 'fa-file-lines', ruta: 'allPaginasInformativas',
      descripcion: 'Términos, políticas y garantías: el texto que se lee en la tienda.' },
    { clave: 'sucursales', titulo: 'Nuestras tiendas', icono: 'fa-store', ruta: null,
      descripcion: 'Ciudades y sucursales con su dirección, horario y ubicación.' },
    { clave: 'categorias', titulo: 'Categorías de la tienda', icono: 'fa-tags', ruta: 'allCategoriasWeb',
      descripcion: 'Cuáles salen en el menú y en el inicio, con su nombre para la web.' },
    { clave: 'galerias', titulo: 'Galerías', icono: 'fa-images', ruta: null,
      descripcion: 'Los bloques de imágenes: banners, tarjetas y logos de pago.' },
    { clave: 'marcas_tienda', titulo: 'Marcas de la tienda', icono: 'fa-award', ruta: 'allMarcasWeb',
      descripcion: 'El logo de cada marca y cuáles salen en «Nuestras marcas».' },
    { clave: 'paginas_marca', titulo: 'Páginas de marca', icono: 'fa-copyright', ruta: null,
      descripcion: 'Una página por marca: banner, fotos y contacto.' },
    { clave: 'espana_motos', titulo: 'España Motos', icono: 'fa-motorcycle', ruta: 'editEspanaMotos',
      descripcion: 'Banner, pestañas del catálogo, marcas y tarjetas.' },
    { clave: 'productos', titulo: 'Productos de la tienda', icono: 'fa-box-open', ruta: null,
      descripcion: 'Ficha técnica, imágenes y franjas del detalle de cada producto.' },
  ];

  private http = inject(HttpClient);
  private router = inject(Router);

  ngOnInit(): void { this.cargar(); }

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

  /** ¿Esta área ya tiene su pantalla? */
  lista(area: TarjetaArea): boolean { return area.ruta !== null; }

  abrir(area: TarjetaArea): void {
    if (!area.ruta) { return; }
    this.router.navigate(['/ecommerce', area.ruta]);
  }

  /**
   * Lo que se lee debajo del título.
   *
   * Cada área cuenta cosas distintas, así que no hay una fórmula: se escribe
   * una frase por área. Es más código que un «{{ n }} elementos», pero «3
   * columnas con 12 enlaces» dice algo y «15 elementos» no dice nada.
   */
  resumen(area: TarjetaArea): string {
    // El modelado y el inicio son la misma portada vista de dos maneras, así
    // que cuentan lo mismo y el servidor no manda dos veces la cuenta
    const d = this.datos?.[area.clave === 'modelado' ? 'inicio' : area.clave];
    if (!d) { return this.error ? 'No se pudo cargar' : '—'; }

    const plural = (n: number, uno: string, varios: string) =>
      `${n} ${n === 1 ? uno : varios}`;

    switch (area.clave) {
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
      case 'espana_motos':
        return `${plural(d.marcas, 'marca', 'marcas')}, ${plural(d.pestanas, 'pestaña', 'pestañas')}`;
      case 'productos':
        return plural(d.productos, 'producto', 'productos');
      default:
        return '—';
    }
  }
}
