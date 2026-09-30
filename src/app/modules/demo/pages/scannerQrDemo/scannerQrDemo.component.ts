import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastrService } from 'ngx-toastr';
import { BrowserQRCodeSvgWriter } from '@zxing/library';

import { CodigoLeido, ScannerComponent } from '../../../../components/scanner/scanner.component';
import { svgCodigoDeBarras } from '../../../../components/scanner/generadorCodigos';
import { PanelModule } from '../../../../components/panel/panel.module';

/** Un artículo del catálogo de mentira. */
interface Producto {
  codigo: string;
  nombre: string;
  categoria: string;
  precio: number;
  stock: number;
  icono: string;
  /** En qué código de barras se puede dibujar: depende de lo que sea su código */
  barras: 'EAN_13' | 'CODE_39';
}

/** Una línea de la caja: el producto y cuántos van. */
interface Linea {
  producto: Producto;
  cantidad: number;
}

/**
 * Demostración del lector de códigos: pasar productos por caja.
 *
 * Enseña cómo se usa <app-scanner> incrustado en una pantalla de verdad:
 * se escucha `leido`, se busca el código en un catálogo y se va armando una
 * cuenta. El catálogo es de mentira y vive aquí mismo; no toca la base.
 *
 * Los códigos de prueba se dibujan en la propia pantalla, así que se puede
 * probar de dos maneras: apuntando con el teléfono a la pantalla del
 * ordenador, o pulsando «simular» si no hay cámara a mano.
 */
@Component({
  selector: 'app-scanner-qr-demo',
  standalone: true,
  imports: [CommonModule, PanelModule, ScannerComponent],
  templateUrl: './scannerQrDemo.component.html',
  styleUrls: ['./scannerQrDemo.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScannerQrDemoComponent implements OnInit {

  /**
   * Catálogo de mentira: lo justo para ver el flujo completo.
   *
   * Los EAN-13 llevan su cifra de control bien calculada. Con una inventada
   * el símbolo se dibuja igual, pero ningún lector lo acepta: de nada serviría
   * para probar.
   */
  readonly catalogo: Producto[] = [
    { codigo: '7861234567898', nombre: 'Arroz Flor 2 kg',        categoria: 'Abarrotes',  precio: 3.85,  stock: 120, icono: 'fa-wheat-awn',           barras: 'EAN_13' },
    { codigo: '7869876543218', nombre: 'Aceite Girasol 1 L',      categoria: 'Abarrotes',  precio: 2.95,  stock: 64,  icono: 'fa-bottle-droplet',      barras: 'EAN_13' },
    { codigo: '7861112223335', nombre: 'Atún en aceite 170 g',    categoria: 'Enlatados',  precio: 1.45,  stock: 0,   icono: 'fa-fish',                barras: 'EAN_13' },
    { codigo: '7865556667779', nombre: 'Detergente 3 kg',         categoria: 'Limpieza',   precio: 7.20,  stock: 18,  icono: 'fa-soap',                barras: 'EAN_13' },
    // Los números de serie llevan letras, así que van en Code 39
    { codigo: 'SN-AE-000451',  nombre: 'Taladro percutor 750 W',  categoria: 'Ferretería', precio: 89.90, stock: 5,   icono: 'fa-screwdriver-wrench',  barras: 'CODE_39' },
    { codigo: 'SN-AE-000452',  nombre: 'Juego de brocas x13',     categoria: 'Ferretería', precio: 12.50, stock: 31,  icono: 'fa-toolbox',             barras: 'CODE_39' },
  ];

  /** Lo último que se leyó y qué se encontró. */
  ultimo: CodigoLeido | null = null;
  encontrado: Producto | null = null;
  /** Se leyó algo que no está en el catálogo. */
  desconocido = false;

  /** La cuenta que se va armando. */
  lineas: Linea[] = [];

  /** Los códigos de prueba, ya dibujados en los dos formatos. */
  codigosDePrueba: { producto: Producto; qr: SafeHtml; barras: SafeHtml | null }[] = [];
  mostrarCodigos = false;
  /** Cuál de los dos se está enseñando. */
  formatoALaVista: 'QR' | 'BARRAS' = 'QR';

  constructor(
    private _toastr: ToastrService,
    private _sanitizer: DomSanitizer,
    private _cd: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.dibujarCodigos();
  }

  // ================================================================
  // LA LECTURA
  // ================================================================

  /**
   * Lo que llega del lector.
   *
   * Es el único punto de unión con <app-scanner>: todo lo demás —cámara,
   * linterna, historial— lo resuelve él.
   */
  alLeer(lectura: CodigoLeido): void {
    this.ultimo = lectura;

    const codigo = (lectura.texto ?? '').trim().toUpperCase();
    const producto = this.catalogo.find(p => p.codigo.toUpperCase() === codigo) ?? null;

    this.encontrado = producto;
    this.desconocido = !producto;

    if (!producto) {
      this._toastr.warning(`El código ${lectura.texto} no está en el catálogo`, 'Sin coincidencia', { timeOut: 3000 });
      this._cd.markForCheck();
      return;
    }

    if (producto.stock <= 0) {
      this._toastr.error(`${producto.nombre} está sin existencias`, 'Sin stock', { timeOut: 3000 });
      this._cd.markForCheck();
      return;
    }

    this.agregar(producto);
    this._cd.markForCheck();
  }

  /**
   * Si ya estaba en la cuenta, suma uno; si no, entra como línea nueva.
   *
   * Lo que sale bien no saca aviso: pasando productos deprisa se apilaban uno
   * encima de otro y tapaban la pantalla, cuando la propia cuenta ya enseña
   * lo que entró (y el lector pita). Sólo se avisa de lo que impide seguir.
   */
  private agregar(producto: Producto): void {
    const linea = this.lineas.find(l => l.producto.codigo === producto.codigo);

    if (!linea) {
      this.lineas = [{ producto, cantidad: 1 }, ...this.lineas];
      return;
    }

    if (linea.cantidad >= producto.stock) {
      this._toastr.warning(`Sólo quedan ${producto.stock} de ${producto.nombre}`, 'Sin más existencias', { timeOut: 3000 });
      return;
    }

    linea.cantidad++;
    this.lineas = [...this.lineas];
  }

  /** Para probar sin cámara: el mismo camino que sigue una lectura de verdad. */
  simular(producto: Producto): void {
    this.alLeer({ texto: producto.codigo, formato: 'QR_CODE', fecha: new Date() });
  }

  simularDesconocido(): void {
    this.alLeer({ texto: '0000000000000', formato: 'EAN_13', fecha: new Date() });
  }

  // ================================================================
  // LA CUENTA
  // ================================================================

  quitar(linea: Linea): void {
    this.lineas = this.lineas.filter(l => l !== linea);
    this._cd.markForCheck();
  }

  menos(linea: Linea): void {
    linea.cantidad--;
    if (linea.cantidad <= 0) { this.quitar(linea); return; }
    this.lineas = [...this.lineas];
    this._cd.markForCheck();
  }

  mas(linea: Linea): void {
    if (linea.cantidad >= linea.producto.stock) {
      this._toastr.warning(`Sólo quedan ${linea.producto.stock}`, 'Sin más existencias', { timeOut: 2500 });
      return;
    }
    linea.cantidad++;
    this.lineas = [...this.lineas];
    this._cd.markForCheck();
  }

  vaciar(): void {
    this.lineas = [];
    this.ultimo = null;
    this.encontrado = null;
    this.desconocido = false;
    this._cd.markForCheck();
  }

  get unidades(): number {
    return this.lineas.reduce((n, l) => n + l.cantidad, 0);
  }

  get total(): number {
    return this.lineas.reduce((n, l) => n + l.cantidad * l.producto.precio, 0);
  }

  porCodigo = (_: number, l: Linea) => l.producto.codigo;

  // ================================================================
  // CÓDIGOS DE PRUEBA
  // ================================================================

  alternarCodigos(): void {
    this.mostrarCodigos = !this.mostrarCodigos;
    this._cd.markForCheck();
  }

  verFormato(f: 'QR' | 'BARRAS'): void {
    this.formatoALaVista = f;
    this._cd.markForCheck();
  }

  /**
   * Dibuja los códigos de prueba de cada producto, en los dos formatos.
   *
   * El QR lo hace la misma librería que lo lee (@zxing/library); el código de
   * barras, el generador de components/scanner, porque esa librería sólo trae
   * escritores de códigos en dos dimensiones.
   *
   * El SVG se marca como seguro porque lo produce este código, no viene de
   * fuera ni lo escribe nadie.
   */
  private dibujarCodigos(): void {
    try {
      const escritor = new BrowserQRCodeSvgWriter();
      const serializador = new XMLSerializer();

      this.codigosDePrueba = this.catalogo.map(producto => {
        const qr = serializador.serializeToString(escritor.write(producto.codigo, 150, 150));

        // Code 39 gasta 15 módulos por carácter: con el módulo a 2 el símbolo
        // se iría de la tarjeta, el navegador lo encogería y las barras
        // quedarían por debajo del píxel, ilegibles para cualquier lector
        const modulo = producto.barras === 'CODE_39' ? 1 : 2;
        const barras = svgCodigoDeBarras(producto.codigo, producto.barras, { modulo, alto: 62 });

        return {
          producto,
          qr: this._sanitizer.bypassSecurityTrustHtml(qr),
          barras: barras ? this._sanitizer.bypassSecurityTrustHtml(barras) : null,
        };
      });
    } catch (e) {
      console.error('No se pudieron dibujar los códigos de prueba:', e);
      this.codigosDePrueba = [];
    }
  }
}
