import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import 'jspdf-autotable'; // Importar el plugin para tablas


@Injectable({
  providedIn: 'root'
})
export class AppPrintPdfService {

  constructor() { }


  generarReporte(params: { 
    title: any, 
    titleTable: any, 
    piePagina?: any,
    headers: string[], 
    data: any[], 
    tamanoPapel: any, 
    orientacion: any  
  }): void {

  const { title, titleTable, headers, piePagina, data, tamanoPapel, orientacion } = params; // Desestructuración

  const doc = new jsPDF(orientacion, "mm", tamanoPapel);
  const pageWidth = doc.internal.pageSize.getWidth(); // Tamaño de la hoja A4 en mm

  // Altura de la cabecera (en mm)
  const alturaCabecera = 50; // Ajusta este valor según el tamaño de tu cabecera

  // Función para cargar la imagen
  const cargarImagen = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Error al cargar la imagen'));
      img.src = url;
    });
  };

  // Función para agregar la cabecera
  const agregarCabecera = (img?: HTMLImageElement) => {
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
    const text = title;
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
    const fechaHora = new Date().toLocaleString('es-ES', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });  
    const text4 = 'Fecha: ' + fechaHora;
    const x4 = pageWidth - 10; // Margen derecho de 10 puntos
    const y4 = 37;
    doc.text(text4, x4, y4, { align: 'right' });

    // Agregar la imagen si está cargada
    if (img) {
      const cmToPoints = 28.35;
      const imgWidth = 0.8 * cmToPoints; // Ancho de 0.8 cm
      const imgHeight = 0.8 * cmToPoints; // Alto de 0.8 cm
      const marginRight = 10; // Margen derecho de 10 puntos
      const x99 = pageWidth - imgWidth - marginRight; // Posición X alineada a la derecha
      const y99 = 8; // Posición Y (8 puntos desde el borde superior)
      doc.addImage(img, 'PNG', x99, y99, imgWidth, imgHeight); // Agregar la imagen al PDF - alineada a la derecha
    }
  };

  // Función para agregar el pie de página
  const agregarPieDePagina = () => {
    const footerText = piePagina;
    const footerY = doc.internal.pageSize.height - 10; // Posición Y del pie de página (10 mm desde el borde inferior)

    // Agregar una línea horizontal en el pie de página
    doc.setDrawColor(0); // Color de la línea (negro)
    doc.setLineWidth(0.5); // Grosor de la línea
    doc.line(10, footerY - 5, doc.internal.pageSize.width - 10, footerY - 5); // Línea horizontal

    // Agregar texto al pie de página
    doc.setTextColor(0); // Color del texto (negro)
    doc.setFontSize(10); // Tamaño de la fuente
    doc.text(footerText, doc.internal.pageSize.width / 2, footerY, { align: 'center' }); // Texto centrado
  };

  // Cargar la imagen y luego generar el PDF
  cargarImagen('https://r-charts.com/es/miscelanea/procesamiento-imagenes-magick_files/figure-html/importar-imagen-r.png')
    .then((img) => {
      // Agregar la cabecera y el pie de página en la primera página
      agregarCabecera(img);
      agregarPieDePagina();

      // Sección "Listado de Productos"
      doc.setFontSize(22);
      const tituloProductos = titleTable;
      const dtext = doc.getTextDimensions(tituloProductos);
      doc.text(tituloProductos, (pageWidth - dtext.w) / 2, alturaCabecera - 4);


      (doc as any).autoTable({
        head: [headers],
        body: data,
        startY: alturaCabecera,  // Ajustar el startY para que la tabla comience justo después de la cabecera
        didDrawPage: (data: any) => {
          agregarCabecera(img);
          agregarPieDePagina();
        },
        tableWidth: 'auto', // Ancho automático de la tabla
        styles: {
          fontSize: 7, // Tamaño de la fuente de la tabla
          cellPadding: 2, // Espaciado interno de las celdas
          textColor: [0, 0, 0], // Color del texto (negro)
          fillColor: [255, 255, 255], // Color de fondo de las celdas (blanco)
          lineColor: [0, 0, 0], // Color de los bordes (negro)
        },
        headStyles: {
          fillColor: [0, 0, 0], // Color de fondo del encabezado (azul claro)
          textColor: [255, 255, 255], // Color del texto del encabezado (blanco)
          lineColor: [0, 0, 0], // Color de los bordes del encabezado (negro)
        },
        bodyStyles: {
          valign: 'middle',
          //fillColor: [245, 245, 245], // Color de fondo de las celdas del cuerpo (gris claro)
          textColor: [0, 0, 0], // Color del texto del cuerpo (negro)
          lineColor: [0, 0, 0], // Color de los bordes del cuerpo (negro)
        },
        margin: { top: alturaCabecera + 5, bottom: 20 }, // Margen superior e inferior
      });

      // Guardar el PDF
      // doc.save('reporte.pdf');
      // Generar el PDF como un Blob
       const pdfBlob = doc.output('blob');
       const pdfUrl = URL.createObjectURL(pdfBlob);
       window.open(pdfUrl, '_blank');      

      
    })
    .catch((error) => {
      console.error('Error al cargar la imagen:', error);
    });
}

}