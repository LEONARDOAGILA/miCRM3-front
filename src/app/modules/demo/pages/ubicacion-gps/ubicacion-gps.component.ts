import { AfterViewInit, Component, ElementRef, NgZone, ViewChild } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import * as L from 'leaflet';

// Configurar íconos por defecto de Leaflet
const iconRetinaUrl = '/assets/leaflet/marker-icon-2x.png';
const iconUrl = '/assets/leaflet/marker-icon.png';
const shadowUrl = '/assets/leaflet/marker-shadow.png';
const DefaultIcon = L.icon({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon; 


@Component({
  selector: 'app-ubicacion-gps',
  templateUrl: './ubicacion-gps.component.html',
  styleUrls: ['./ubicacion-gps.component.css'],
  standalone: false,
})
export class UbicacionGpsComponent implements AfterViewInit {

   @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  latitud: number | null = null;
  longitud: number | null = null;
  cargando = false;
  error: string | null = null;
  private mapa: L.Map | null = null;
  private marcador: L.Marker | null = null;
  
  

  constructor(private zone: NgZone) {}

  ngAfterViewInit() {
    // Esperar a que el contenedor tenga tamaño real
    setTimeout(() => this.inicializarMapa(), 700);
  }

  private inicializarMapa() {

navigator.geolocation.getCurrentPosition(
  pos => console.log(pos.coords.latitude, pos.coords.longitude),
  err => console.error(err)
);



    const container = this.mapContainer.nativeElement;

    // Si ya existe un mapa, lo removemos (soluciona render doble)
    if (this.mapa) {
      this.mapa.remove();
    }

    this.mapa = L.map(container, {
      center: [0, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(this.mapa);

    // 🔧 Recalcular tamaño real después de render
    setTimeout(() => this.mapa?.invalidateSize(true), 1000);
  }




async obtenerUbicacion() {
  if (window.navigator && window.navigator.geolocation) {
    // ⚡ navegador
    window.navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.latitud = pos.coords.latitude;
        this.longitud = pos.coords.longitude;
        this.actualizarMapa(this.latitud, this.longitud);
      },
      (err) => {
        this.error = 'No se pudo obtener la ubicación en el navegador.';
        console.error(err);
      },
      { enableHighAccuracy: true }
    );
  } else {

    this.cargando = true;
    this.error = null;

    try {
      await Geolocation.requestPermissions();
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true
      });

      this.latitud = position.coords.latitude;
      this.longitud = position.coords.longitude;

      this.actualizarMapa(this.latitud, this.longitud);

    } catch (err: any) {
      console.error('Error al obtener ubicación', err);
      this.error = 'No se pudo obtener la ubicación. Activa el GPS y permite el acceso.';
    } finally {
      this.cargando = false;
    }


  }
}


  private actualizarMapa(lat: number, lng: number) {
    if (!this.mapa) return;

    this.mapa.setView([lat, lng], 15);

    if (this.marcador) {
      this.marcador.setLatLng([lat, lng]);
    } else {
      this.marcador = L.marker([lat, lng]).addTo(this.mapa)
        .bindPopup(`📍 Lat: ${lat.toFixed(5)}<br>Lng: ${lng.toFixed(5)}`)
        .openPopup();
    }

    // Recalcula el tamaño final del mapa después de reposicionar
    setTimeout(() => this.mapa?.invalidateSize(true), 500);
  }
}