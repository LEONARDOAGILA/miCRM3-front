import { Component, OnInit } from '@angular/core';
import jsPDF from 'jspdf';
import 'jspdf-autotable'; // Importar el plugin para tablas
import { AppPrintPdfService } from '../../../../service/app-printPdf.service';

// Definir la interfaz para el tipo de producto
interface Producto {
  id: number;
  nombre: string;
  precio: number;
}


@Component({
  selector: 'app-printpdf',
  templateUrl: './printpdf.component.html',
  styleUrls: ['./printpdf.component.css'],
  standalone: false,
})
export class PrintpdfComponent implements OnInit {

  public name = 'Angular ' ;
  data:any;
  private doc = new jsPDF({
    unit: 'px',
    format: 'A5',
  });
  listado: Producto[] = [
    { id: 1, nombre: 'Producto 1', precio: 100 },
    { id: 2, nombre: 'Producto 2', precio: 200 },
    { id: 3, nombre: 'Producto 3', precio: 300 },
    { id: 4, nombre: 'Producto 4', precio: 400 },
    { id: 5, nombre: 'Producto 5', precio: 500 },

  ];




  constructor(
    private _appPrintPdfService: AppPrintPdfService

  ) {}

  ngOnInit() {
  }



  reportePdf(): void {
  
    const doc = new jsPDF("p", "mm", "A4");
    const pageWidth = doc.internal.pageSize.getWidth(); // Tamaño de la hoja A4 en mm
    
    // Línea verde en la parte superior
    doc.setDrawColor(0, 128, 0); // RGB para verde
    doc.setLineWidth(5); // Grosor de la línea
    doc.line(0, 0, pageWidth, 0); // Línea horizontal en la parte superior
    
    // Texto "Mi Empresa en Desarrollo S.A."
    doc.setTextColor(128);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text('Mi Empresa en Desarrollo S.A.', 11, 18);
    doc.setTextColor(0);
    
    // Título "Reporte de Ejemplo"
    doc.setFontSize(22);
    const text = "Reporte de Ejemplo";
    const x = 10;
    const y = 28;
    doc.text(text, x, y);
    
    // Línea debajo del encabezado
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(10, 32, 200, 32);
    
    // Fecha alineada a la derecha
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const text4 = 'Fecha: ' + new Date().toLocaleDateString();
    const x4 = pageWidth - 10; // Margen derecho de 10 puntos
    const y4 = 37;
    doc.text(text4, x4, y4, { align: 'right' });
    
    // Contenido del reporte
    doc.setFontSize(8);
    const reportContent = [
        'Usuario: John Doe',
        'Total de Ventas: $10,000',
        'Productos Vendidos: 150',
    ];    
    let yPosition = 37;
    reportContent.forEach((line) => {
        doc.text(line, 10, yPosition);
        yPosition += 4;
    });


doc.setFontSize(10);
doc.setFillColor(215, 219, 221); // RGB para gris claro
// Dibujar un rectángulo relleno
const rectX = 10; // Posición X del rectángulo
const rectY = 50; // Posición Y del rectángulo
const rectWidth = 100; // Ancho del rectángulo
const rectHeight = 10; // Alto del rectángulo
doc.rect(rectX, rectY, rectWidth, rectHeight, 'F'); // 'F' indica que se rellena el rectángulo
// Agregar texto sobre el rectángulo
doc.setTextColor(0); // Color del texto (negro)
doc.setFontSize(12);
doc.text("Nombre:   Leonardo Agila Astudillo", rectX + 5, rectY + 7); // Ajusta la posición del texto


doc.setFontSize(10);
doc.setFillColor(215, 219, 221); // RGB para gris claro
// Dibujar un rectángulo relleno
const rectX2 = 120; // Posición X del rectángulo
const rectY2 = 50; // Posición Y del rectángulo
const rectWidth2 = 80; // Ancho del rectángulo
const rectHeight2 = 10; // Alto del rectángulo
doc.rect(rectX2, rectY2, rectWidth2, rectHeight2, 'F'); // 'F' indica que se rellena el rectángulo
// Agregar texto sobre el rectángulo
doc.setTextColor(0); // Color del texto (negro)
doc.setFontSize(12);
doc.text("Cargo:", rectX2 + 5, rectY2 + 7); // Ajusta la posición del texto


doc.setFillColor(215, 219, 221); // RGB para gris claro
// Dibujar un rectángulo relleno
const rectX3 = 10; // Posición X del rectángulo
const rectY3 = 62; // Posición Y del rectángulo
const rectWidth3 = 100; // Ancho del rectángulo
const rectHeight3 = 10; // Alto del rectángulo
doc.rect(rectX3, rectY3, rectWidth3, rectHeight3, 'F'); // 'F' indica que se rellena el rectángulo
// Agregar texto sobre el rectángulo
doc.setFontSize(12);
doc.setTextColor(0); // Color del texto (negro)
doc.text("Ubicación:", rectX3 + 5, rectY3 + 7); // Ajusta la posición del texto


doc.setFontSize(10);
doc.setFillColor(215, 219, 221); // RGB para gris claro
// Dibujar un rectángulo relleno
const rectX4 = 120; // Posición X del rectángulo
const rectY4 = 62; // Posición Y del rectángulo
const rectWidth4 = 80; // Ancho del rectángulo
const rectHeight4 = 10; // Alto del rectángulo
doc.rect(rectX4, rectY4, rectWidth4, rectHeight4, 'F'); // 'F' indica que se rellena el rectángulo
// Agregar texto sobre el rectángulo
doc.setTextColor(0); // Color del texto (negro)
doc.setFontSize(12);
doc.text("Cargo:", rectX4 + 5, rectY4 + 7); // Ajusta la posición del texto

    



    
    // Título "Listado de Productos"
    doc.setFontSize(22);
    const text3 = 'Listado de Productos';
    const dtext3 = doc.getTextDimensions(text3); // Obtener las dimensiones del texto
    const x3 = (pageWidth - dtext3.w) / 2; // Calcular la posición x para centrar el texto
    const y3 = 100;
    doc.text(text3, x3, y3);
    
    // Configurar la tabla
    const headers = [['ID', 'Nombre', 'Precio']]; // Encabezados de la tabla
    const data = this.listado.map((item: Producto) => [item.id, item.nombre, `$${item.precio}`]); // Datos de la tabla
    



// Configurar el pie de página
const footerText = "Pie de página - Mi Empresa en Desarrollo S.A.";
const footerY = doc.internal.pageSize.height - 10; // Posición Y del pie de página (10 mm desde el borde inferior)

// Agregar una línea horizontal en el pie de página
doc.setDrawColor(0); // Color de la línea (negro)
doc.setLineWidth(0.5); // Grosor de la línea
doc.line(10, footerY - 5, doc.internal.pageSize.width - 10, footerY - 5); // Línea horizontal

// Agregar texto al pie de página
doc.setTextColor(0); // Color del texto (negro)
doc.setFontSize(10); // Tamaño de la fuente
doc.text(footerText, doc.internal.pageSize.width / 2, footerY, { align: 'center' }); // Texto centrado




    // Cargar y agregar la imagen
    const imgUrl = 'https://r-charts.com/es/miscelanea/procesamiento-imagenes-magick_files/figure-html/importar-imagen-r.png';
    const img = new Image();
    
    img.onload = function () {
        const cmToPoints = 28.35;
        const imgWidth = 0.8 * cmToPoints; // Ancho de 0.8 cm
        const imgHeight = 0.8 * cmToPoints; // Alto de 0.8 cm
    
        // Calcular la posición X para alinear a la derecha
        const marginRight = 10; // Margen derecho de 10 puntos
        const x99 = pageWidth - imgWidth - marginRight; // Posición X alineada a la derecha
    
        // Posición Y (8 puntos desde el borde superior)
        const y99 = 8;
    
        // Agregar la imagen al PDF
        doc.addImage(img, 'PNG', x99, y99, imgWidth, imgHeight); // Imagen alineada a la derecha
    
        // Generar la tabla con el plugin autotable
        (doc as any).autoTable({
            head: headers,
            body: data,
            startY: 110, // Posición inicial de la tabla
        });
    
        // Guardar el PDF (solo una vez, después de que la imagen esté lista)
        doc.save('reporte.pdf');
    };
    
    img.src = imgUrl; // Cargar la imagen
    
    


    
  }

  

  generarPDF2(): void {

    // const title = "Reporte de Ejemplo";
    // const titleTable = "Listado de Productos";
    // const headers = ['ID', 'Nombre', 'Preciopppp'];
    // const data = this.listado.map(item => [item.id, item.nombre, `$${item.precio}`]);
    // this._appPrintPdfService.generarReporte(title,titleTable,headers, data);

    this._appPrintPdfService.generarReporte({
        title: "Reporte de Ejemplo",
        titleTable: "Listado de Productos",
        headers: ['ID', 'Nombre', 'Precio','ddd'],
        data: this.listado.map(item => [  item.id,  item.nombre,  `$${item.precio}`  ]),
        tamanoPapel:"A4",
        orientacion: "p"

    });


  }


}
