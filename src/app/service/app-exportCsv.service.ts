import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AppExportCsvService {

constructor() { }


generarReporteCSV(params: { 
  headers: string[], 
  data: any[]
}): void {

  const { headers, data } = params;

  // Crear el contenido del CSV
  let csvContent = '';


  // Agregar los encabezados
  csvContent += `${headers.join(',')}\n`;

  // Agregar los datos
  data.forEach((row) => {
    csvContent += `${row.join(',')}\n`;
  });


  // Generar el archivo CSV
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'reporte.csv';
  a.click();
  URL.revokeObjectURL(url);
}




}
