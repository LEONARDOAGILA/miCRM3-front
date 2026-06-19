import { Injectable } from '@angular/core';
import { Workbook, Worksheet } from 'exceljs';

@Injectable({
  providedIn: 'root'
})
export class AppExportExcelService {

constructor() { }



generarReporteExcel(params: { 
  title: any, 
  titleTable: any, 
  piePagina?: any,
  headers: string[], 
  data: any[], 
  tamanoPapel: any, 
  orientacion: any  
}): void {

  const { title, titleTable, headers, piePagina, data } = params; // Desestructuración

  // Crear un nuevo libro de Excel
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet('Reporte');

  
  // Agregar el título de reporte
  worksheet.addRow([]); // Espacio en blanco
  const titleRow = worksheet.addRow([title]);
  titleRow.font = { name: 'Corbel', family: 4, size: 18, underline: 'double', bold: true  };
  worksheet.mergeCells(`A${titleRow.number}:F${titleRow.number}`);
  titleRow.font = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle'}; // centrar
  titleRow.getCell(1).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }; // Aplicar bordes a la celda
  titleRow.getCell(1).fill = { type: 'pattern',  pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }; // Color de fondo 

// Agregar el fecha de impresion
  const fechaHora = new Date().toLocaleString('es-ES', {day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });  
  const fecha = worksheet.addRow([`Fecha: ${fechaHora}`]);
  worksheet.mergeCells(`A${fecha.number}:F${fecha.number}`);
  fecha.getCell(1).alignment = { horizontal: 'right', vertical: 'middle'}; // centrar

// Agregar usuario de impresion
  const user = worksheet.addRow(['Usuario: Leonardo Agila']);
  worksheet.mergeCells(`A${user.number}:F${user.number}`);
  user.getCell(1).alignment = { horizontal: 'right', vertical: 'middle'}; // centrar

  
  
  

// Agregar los encabezados de la tabla
worksheet.addRow([]); // Espacio en blanco
const headerRow = worksheet.addRow(headers); // Agrega la fila de encabezados
headerRow.font = { bold: true }; // Aplica negrita a los encabezados

// Aplicar el fondo gris solo a las celdas de los encabezados
headerRow.eachCell((cell) => {
cell.fill = {  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }}); // Color de fondo gris claro

// Agregar los datos de la tabla
data.forEach((row) => {
  const dataRow = worksheet.addRow(row);

// Centrar el contenido de la primera columna
  const firstCell = dataRow.getCell(1); // Obtener la primera celda de la fila
  firstCell.alignment = {
    horizontal: 'center', // Centrar horizontalmente
    vertical: 'middle'    // Centrar verticalmente (opcional)
  };
});

// Ajusta el ancho de las columnas según sea necesario
worksheet.columns.forEach((column) => { column.width = 20; }); 






// Agregar el pie de página
worksheet.addRow([]); // Espacio en blanco
const footerRow = worksheet.addRow([piePagina]);
footerRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }; // Color de fondo
footerRow.getCell(1).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }}; // Aplicar bordes a la celda
footerRow.getCell(1).alignment = { horizontal: 'center',  vertical: 'middle'}; // Centrar el texto horizontal y verticalmente
worksheet.mergeCells(`A${footerRow.number}:F${footerRow.number}`); // Combinar celdas para el pie de página




// Generar el archivo Excel
  workbook.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reporte.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }).catch((error) => {
    console.error('Error al generar el archivo Excel:', error);
  });
}




}
