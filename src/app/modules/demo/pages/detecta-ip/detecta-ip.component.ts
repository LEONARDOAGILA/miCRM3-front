import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Http } from '@capacitor-community/http';

@Component({
  selector: 'app-detecta-ip',
  templateUrl: './detecta-ip.component.html',
  styleUrls: ['./detecta-ip.component.css'],
  standalone:false
})
export class DetectaIPComponent implements OnInit {

  ipPublica: string | null = null;
  error: string | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.obtenerIP();
  }

  async obtenerIP() {
    // Servicio público para obtener la IP
    try{
      const response = await Http.get({ url: 'https://api.ipify.org/?format=json' });
      this.ipPublica = response.data.ip
      console.log(response.data.ip); // {ip: "xxx.xxx.xxx.xxx"}
    }catch{
      error: (err) => this.error = 'No se pudo obtener la IP'
    }  

  }
}
