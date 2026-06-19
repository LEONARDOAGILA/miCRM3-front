import { Component, OnInit } from '@angular/core';
import { startOfDay, endOfDay, subDays, addDays, endOfMonth, isSameDay, isSameMonth, addHours } from 'date-fns';
import { AppVariablesService } from '../../../../service/app-variables.service';
// @ts-ignore
import jsVectorMap from 'jsvectormap';
import 'jsvectormap/dist/maps/world.js';

@Component({
  selector: 'app-dashboard2',
  templateUrl: './dashboard2.component.html',
  styleUrls: ['./dashboard2.component.scss'],
  standalone: false,
})
export class Dashboard2Component implements OnInit {
  appVariables = this.appVariablesService.getAppVariables();
  viewDate: Date = new Date();
  events = [{
    start: subDays(startOfDay(new Date()), 1),
    end: addDays(new Date(), 1),
    title: 'A 3 day event',
    color: this.appVariables.color.success
  }, {
    start: startOfDay(new Date()),
    title: 'An event with no end date',
    color: '#ff5b57'
  }, {
    start: subDays(endOfMonth(new Date()), 3),
    end: addDays(endOfMonth(new Date()), 3),
    title: 'A long event that spans 2 months',
    color: '#348fe2'
  }, {
    start: addHours(startOfDay(new Date()), 2),
    end: new Date(),
    title: 'A draggable and resizable event',
    color: '#727cb6'
  }];
  
  areaChart: any;
  pieChart: any;
  
  
	handleGetDate(minusDate) {
		var d = new Date();
		var a = d.setDate(d.getDate() - minusDate);
		return a;
	}
	
	renderMap() {
		var elm = document.getElementById('visitorMap') as HTMLElement;
		
    if (elm) {
      elm.innerHTML = '<div id="map" class="h-100"></div>';
      
      new jsVectorMap({
        selector: '#map',
        map: 'world',
        zoomButtons: false,
        normalizeFunction: 'polynomial',
        hoverOpacity: 0.5,
        hoverColor: false,
        zoomOnScroll: false,
        series: {
          regions: [{
            normalizeFunction: 'polynomial'
          }]
        },
        focusOn: {
          x: 0.5,
          y: 0.5,
          scale: 1
        },
        labels: {
          markers: {
            render: (marker: any) => marker.name
          }
        },
        markers: [
          { name: "Egypt", coords: [26.8206, 30.8025] },
          { name: "Russia", coords: [61.524, 105.3188] },
          { name: "Canada", coords: [56.1304, -106.3468] },
          { name: "Greenland", coords: [71.7069, -42.6043] },
          { name: "Brazil", coords: [-14.235, -51.9253] }
        ],
        markerStyle: {
          initial: {
            fill: this.appVariables.color.teal,
            stroke: 'none',
            r: 5,
          },
          hover: {
            fill: this.appVariables.color.teal
          }
        },
        markerLabelStyle: {
          initial: {
            fontFamily: this.appVariables.font.bodyFontFamily,
            fontSize: '12px',
            fill: this.appVariables.color.white
          },
        },
        regionStyle: {
          initial: {
						fill: this.appVariables.color.gray600,
						fillOpacity: 0.5,
						stroke: 'none',
						strokeWidth: 0.4,
						strokeOpacity: 1
					},
					hover: {
						fillOpacity: 0.75
					}
        },
        backgroundColor: 'transparent',
      });
    }
	}
  
  constructor(private appVariablesService: AppVariablesService) {
		this.appVariablesService.variablesReload.subscribe(() => {
			this.appVariables = this.appVariablesService.getAppVariables();
		});
	}

  ngOnInit() {
		this.areaChart = {
			series: [
				{ 
					name: 'Unique Visitors', 
					data: [
						[this.handleGetDate(77), 13], [this.handleGetDate(76), 13], [this.handleGetDate(75), 6 ], 
						[this.handleGetDate(73), 6 ], [this.handleGetDate(72), 6 ], [this.handleGetDate(71), 5 ], [this.handleGetDate(70), 5 ], 
						[this.handleGetDate(69), 5 ], [this.handleGetDate(68), 6 ], [this.handleGetDate(67), 7 ], [this.handleGetDate(66), 6 ], 
						[this.handleGetDate(65), 9 ], [this.handleGetDate(64), 9 ], [this.handleGetDate(63), 8 ], [this.handleGetDate(62), 10], 
						[this.handleGetDate(61), 10], [this.handleGetDate(60), 10], [this.handleGetDate(59), 10], [this.handleGetDate(58), 9 ], 
						[this.handleGetDate(57), 9 ], [this.handleGetDate(56), 10], [this.handleGetDate(55), 9 ], [this.handleGetDate(54), 9 ], 
						[this.handleGetDate(53), 8 ], [this.handleGetDate(52), 8 ], [this.handleGetDate(51), 8 ], [this.handleGetDate(50), 8 ], 
						[this.handleGetDate(49), 8 ], [this.handleGetDate(48), 7 ], [this.handleGetDate(47), 7 ], [this.handleGetDate(46), 6 ], 
						[this.handleGetDate(45), 6 ], [this.handleGetDate(44), 6 ], [this.handleGetDate(43), 6 ], [this.handleGetDate(42), 5 ], 
						[this.handleGetDate(41), 5 ], [this.handleGetDate(40), 4 ], [this.handleGetDate(39), 4 ], [this.handleGetDate(38), 5 ], 
						[this.handleGetDate(37), 5 ], [this.handleGetDate(36), 5 ], [this.handleGetDate(35), 7 ], [this.handleGetDate(34), 7 ], 
						[this.handleGetDate(33), 7 ], [this.handleGetDate(32), 10], [this.handleGetDate(31), 9 ], [this.handleGetDate(30), 9 ], 
						[this.handleGetDate(29), 10], [this.handleGetDate(28), 11], [this.handleGetDate(27), 11], [this.handleGetDate(26), 8 ], 
						[this.handleGetDate(25), 8 ], [this.handleGetDate(24), 7 ], [this.handleGetDate(23), 8 ], [this.handleGetDate(22), 9 ], 
						[this.handleGetDate(21), 8 ], [this.handleGetDate(20), 9 ], [this.handleGetDate(19), 10], [this.handleGetDate(18), 9 ], 
						[this.handleGetDate(17), 10], [this.handleGetDate(16), 16], [this.handleGetDate(15), 17], [this.handleGetDate(14), 16], 
						[this.handleGetDate(13), 17], [this.handleGetDate(12), 16], [this.handleGetDate(11), 15], [this.handleGetDate(10), 14], 
						[this.handleGetDate(9) , 24], [this.handleGetDate(8) , 18], [this.handleGetDate(7) , 15], [this.handleGetDate(6) , 14], 
						[this.handleGetDate(5) , 16], [this.handleGetDate(4) , 16], [this.handleGetDate(3) , 17], [this.handleGetDate(2) , 7 ], 
						[this.handleGetDate(1) , 7 ], [this.handleGetDate(0) , 7 ]
					]
				},
				{ 
					name: 'Page Views', 
					data: [
						[this.handleGetDate(77), 14], [this.handleGetDate(76), 13], [this.handleGetDate(75), 15], 
						[this.handleGetDate(73), 14], [this.handleGetDate(72), 13], [this.handleGetDate(71), 15], [this.handleGetDate(70), 16], 
						[this.handleGetDate(69), 16], [this.handleGetDate(68), 14], [this.handleGetDate(67), 14], [this.handleGetDate(66), 13], 
						[this.handleGetDate(65), 12], [this.handleGetDate(64), 13], [this.handleGetDate(63), 13], [this.handleGetDate(62), 15], 
						[this.handleGetDate(61), 16], [this.handleGetDate(60), 16], [this.handleGetDate(59), 17], [this.handleGetDate(58), 17], 
						[this.handleGetDate(57), 18], [this.handleGetDate(56), 15], [this.handleGetDate(55), 15], [this.handleGetDate(54), 15], 
						[this.handleGetDate(53), 19], [this.handleGetDate(52), 19], [this.handleGetDate(51), 18], [this.handleGetDate(50), 18], 
						[this.handleGetDate(49), 17], [this.handleGetDate(48), 16], [this.handleGetDate(47), 18], [this.handleGetDate(46), 18], 
						[this.handleGetDate(45), 18], [this.handleGetDate(44), 16], [this.handleGetDate(43), 14], [this.handleGetDate(42), 14], 
						[this.handleGetDate(41), 13], [this.handleGetDate(40), 14], [this.handleGetDate(39), 13], [this.handleGetDate(38), 10], 
						[this.handleGetDate(37), 9 ], [this.handleGetDate(36), 10], [this.handleGetDate(35), 11], [this.handleGetDate(34), 11], 
						[this.handleGetDate(33), 11], [this.handleGetDate(32), 10], [this.handleGetDate(31), 9 ], [this.handleGetDate(30), 10], 
						[this.handleGetDate(29), 13], [this.handleGetDate(28), 14], [this.handleGetDate(27), 14], [this.handleGetDate(26), 13], 
						[this.handleGetDate(25), 12], [this.handleGetDate(24), 11], [this.handleGetDate(23), 13], [this.handleGetDate(22), 13], 
						[this.handleGetDate(21), 13], [this.handleGetDate(20), 13], [this.handleGetDate(19), 14], [this.handleGetDate(18), 13], 
						[this.handleGetDate(17), 13], [this.handleGetDate(16), 19], [this.handleGetDate(15), 21], [this.handleGetDate(14), 22],
						[this.handleGetDate(13), 25], [this.handleGetDate(12), 24], [this.handleGetDate(11), 24], [this.handleGetDate(10), 22], 
						[this.handleGetDate(9) , 16], [this.handleGetDate(8) , 15], [this.handleGetDate(7) , 12], [this.handleGetDate(6) , 12], 
						[this.handleGetDate(5) , 15], [this.handleGetDate(4) , 15], [this.handleGetDate(3) , 15], [this.handleGetDate(2) , 18], 
						[this.handleGetDate(2) , 18], [this.handleGetDate(0) , 17]
					] 
				}
			],
			colors: [this.appVariables.color.teal, this.appVariables.color.primary],
			fill: {
				opacity: .75,
				type: 'solid'
			},
			legend: {
				position: 'top',
				horizontalAlign: 'right',
				offsetY: 15,
				offsetX: 500,
				labels: {
					colors: this.appVariables.color.white
				}
			},
			xaxis: {
				type: 'datetime',
				tickAmount: 6,
				labels: {
					style: {
						colors: this.appVariables.color.white
					}
				}
			},
			yaxis: {
				tickAmount: 4,
				labels: {
					style: {
						colors: this.appVariables.color.white
					}
				}
			},
			tooltip: { y: { formatter: function (val) { return "$ " + val + " thousands" } } },
			chart: { height: '268', width: '100%', type: 'area', toolbar: { show: false }, stacked: true },
			plotOptions: { bar: { horizontal: false, columnWidth: '55%', endingShape: 'rounded' } },
			dataLabels: { enabled: false },
			grid: { 
				show: true, borderColor: 'rgba('+ this.appVariables.color.whiteRgb +', .15)',
				xaxis: {
					lines: {
						show: true
					}
				},   
				yaxis: {
					lines: {
						show: true
					}
				},
				padding: {
						top: -40,
						right: 3,
						bottom: 0,
						left: 10
				},
			},
			stroke: { 
				show: false,
				curve: 'straight'
			}
		};
		this.pieChart = {
			series: [416747,784466],
			labels: ['New Visitors', 'Return Visitors'],
			chart: { height: '180', type: 'donut' },
			dataLabels: { dropShadow: { enabled: false }, style: { colors: ['#fff'] } },
			stroke: { show: false },
			colors: [ this.appVariables.color.primary, this.appVariables.color.teal ],
			legend: { show: false }
		};
		setTimeout(() => {
  		this.renderMap();
		}, 0);
	}
}
