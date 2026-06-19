import { ElementRef, Injectable, ViewChild } from '@angular/core';
import { Workbook } from 'exceljs';
import * as fs from 'file-saver';

@Injectable({
  providedIn: 'root'
})
export class ExcelService {
  
  constructor() {

  }

  async generateExcel() {


    // Excel Title, Header, Data
    const title = 'Yearly Social Sharing Education For Betterment';
    const company = 'ALM';
    const header = ['Year', 'Month', 'Facebook', 'Reddit', 'LinkedIn', 'Instagram'];
    const data = [
    [2019, 1, '50', '20', '25', '20'],
    [2019, 2, '80', '20', '25', '20'],
    [2019, 3, '120', '20', '25', '20'],  
    [2019, 4, '75', '20', '25', '20'],  
    [2019, 5, '60', '20', '25', '20'],  
    [2019, 6, '80', '20', '25', '20'],  
    [2019, 7, '95', '20', '25', '20'],  
    [2019, 8, '55', '20', '25', '20'],  
    [2019, 9, '45', '20', '25', '20'],  
    [2019, 10, '80', '20', '25', '20'],  
    [2019, 11, '90', '20', '25', '20'],  
    [2019, 12, '110', '20', '25', '20'],      
  ];

    // Create workbook and worksheet
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Sharing Data');


// Add Row and formatting
    const titleRow = worksheet.addRow([title]);
    titleRow.font = { name: 'Corbel', family: 4, size: 16, underline: 'double', bold: true };
    worksheet.addRow([]);
    const companyrOW = worksheet.addRow([company]);

    const subTitleRow = worksheet.addRow(['Date : 06-09-2020']);
    const subTitleRow2 = worksheet.addRow(['Leonardo Agila']);

    worksheet.mergeCells('A1:F2');


// Blank Row
    worksheet.addRow([]);

// Add Header Row
    const headerRow = worksheet.addRow(header);

// Cell Style : Fill and Border
    headerRow.eachCell((cell, number) => {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFF00' },
    bgColor: { argb: 'FF0000FF' }
  };
  cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
});

// Add Data and Conditional Formatting
    data.forEach(d => {
  const row = worksheet.addRow(d);
  const qty = row.getCell(5);
  let color = 'FF99FF99';
   if (qty && qty.value !== null && qty.value !== undefined) {
    color = 'FF9999';
  }

  qty.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: color }
  };
}

);

    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 30;
    worksheet.addRow([]);


// Footer Row
    const footerRow = worksheet.addRow(['This is system generated excel sheet.']);
    footerRow.getCell(1).fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFCCFFE5' }
};
    footerRow.getCell(1).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

// Merge Cells
    worksheet.mergeCells(`A${footerRow.number}:F${footerRow.number}`);

// Generate Excel File with given name
    workbook.xlsx.writeBuffer().then((data: any) => {
  const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  fs.saveAs(blob, 'SocialShare.xlsx');
});

  }
}