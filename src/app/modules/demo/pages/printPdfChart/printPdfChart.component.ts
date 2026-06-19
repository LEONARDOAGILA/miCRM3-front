import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import Chart from 'chart.js/auto';
import jsPDF from 'jspdf';
import 'jspdf-autotable'; // Importar el plugin para tablas



@Component({
  selector: 'app-printPdfChart',
  templateUrl: './printPdfChart.component.html',
  styleUrls: ['./printPdfChart.component.css'],
  standalone: false,
})
export class PrintPdfChartComponent implements OnInit {
  public name = 'Angular ' ;
  private doc = new jsPDF({unit: 'px', format: 'A5',});
  @ViewChild('content') content!: ElementRef;

  

  constructor() { }

  ngOnInit() {

    // Make sure to select the canvas as an HTMLCanvasElement
    const canvas = document.getElementById('myChart') as HTMLCanvasElement;
    const ctx: any = canvas.getContext('2d');

    // Create the background color plugin
    const backgroundColorPlugin = {
      id: 'backgroundColorPlugin',
      beforeDraw: (chart: any) => {
        const ctx = chart.canvas.getContext('2d');
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = 'white'; // Set your background color here
        ctx.fillRect(0, 0, chart.width, chart.height);
        ctx.restore();
      },
    };

    // Register the plugin with Chart.js
    Chart.register(backgroundColorPlugin);

    // Now create your chart
    new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Blue', 'Red', 'Orange', 'Yellow', 'Teal', 'Purple'],
        datasets: [
          {
            label: '# of Votes',
            data: [12, 19, 3, 5, 2, 3],
            borderWidth: 1,
          },
        ],
      },
      options: {
        plugins: {
          legend: {
            display: true,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    });

  }


  downloadPDF() {
  
    this.doc.html(this.content.nativeElement, {
      callback: function (doc) {
        doc.save('document-html.pdf');
      },
      margin: [4, 4, 4, 4],
      autoPaging: 'text',
      x: 0,
      y: 0,
      html2canvas: {
        scale: 0.55, // Adjust scale if content is too zoomed in or out
      },
    });
  }




}
