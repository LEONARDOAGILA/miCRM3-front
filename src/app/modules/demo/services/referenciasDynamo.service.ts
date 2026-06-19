import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs'; // 1. Importa la función
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class ReferenciasDynamoService {
  private URL_SERVICIOS: string;

  constructor(
    private _http: HttpClient,
  ) {
    this.URL_SERVICIOS = environment.URL_SERVICIOS + 'config/demo/';
  }


async getLoginCrm(usuario:string, clave:string): Promise<any> {
  try {
    console.log('🔵 [1/4] Iniciando autenticación...');
    
    // 1. LOGIN
    const data = {
      "usu_alias": usuario,
      "password": clave
    };
    
    const loginResponse = await firstValueFrom(
      this._http.post<any>('http://api.almacenesespana.ec/api/login', data)
    );
    
    console.log('✅ [2/4] Login exitoso');
    console.log('🔑 Token recibido:', loginResponse.access_token ? '✅ Sí' : '❌ No');
    console.log('⏰ Expira en:', loginResponse.expires_in, 'segundos');
    
    // 2. CREAR HEADERS (IMPORTANTE: usar exactamente 'access_token')
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${loginResponse.access_token}`,
      // Para GET normalmente no necesitas Content-Type
      'Accept': 'application/json'
    });

    
    
    console.log('📋 Header Authorization:', `Bearer ${loginResponse.access_token.substring(0, 20)}...`);
    
    // 3. SEGUNDA PETICIÓN
    const url = 'http://api.almacenesespana.ec/api/almacenesespana/aav_migracion_referencias_cliente_by_identificacion/0503253106';
    console.log('🌐 [3/4] Realizando petición a:', url);
    
    const secondResponse = await firstValueFrom(
      this._http.get(url, { 
        headers,
        // Agrega esto para ver errores detallados
        observe: 'response'
      })
    );
    
    console.log('✅ [4/4] Petición exitosa!');
    console.log('📊 Status:', secondResponse.status);
    console.log('📦 Datos recibidos:', secondResponse.body);
    
    return secondResponse.body;
    
  } catch (error: any) {
    console.error('❌ ERROR en getLoginCrm');
    
    // Manejo detallado del error
    if (error.status === 401) {
      console.error('🚫 ERROR 401 - Unauthorized');
      console.error('Posibles causas:');
      console.error('1. Token mal formado');
      console.error('2. Endpoint requiere permisos adicionales');
      console.error('3. Token expirado (expires_in: 480s = 8min)');
      
      // Mostrar detalles de la petición fallida
      if (error.url) console.error('URL:', error.url);
      if (error.headers) console.error('Headers enviados:', error.headers);
    }
    
    // Si hay error en la respuesta
    if (error.error) {
      console.error('📄 Error del servidor:', error.error);
    }
    
    throw error;
  }
}
  


}