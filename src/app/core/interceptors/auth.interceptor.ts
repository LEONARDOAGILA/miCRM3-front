import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { SeguridadService } from '../../modules/seguridad/services/seguridad.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(
    public _seguridadServices: SeguridadService,
    private _toastr: ToastrService,            
  ) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {   
    request = this.addHeaders(request);
    return next.handle(request).pipe(      
      catchError((error: HttpErrorResponse) => {
        const errorInfo = this.extractErrorInfo(error);
        
        // Limpiar todos los toasts anteriores
        this._toastr.clear();
        
        // Mostrar el nuevo error
        this._toastr.error(errorInfo.message, errorInfo.title, {
          timeOut: 5000,
          closeButton: true,
          enableHtml: true
        });

        if (errorInfo.shouldLogout) {
          this._seguridadServices.logout();
        }

        return throwError(() => new Error(errorInfo.message));
      })
    ); 
  }

  private extractErrorInfo(error: HttpErrorResponse): {
    title: string;
    message: string;
    shouldLogout: boolean;
  } {
    // Valores por defecto
    let title = 'Error';
    let message = 'Ocurrió un error inesperado';
    let shouldLogout = false;

    if (error.error instanceof ErrorEvent) {
      // Error del lado del cliente
      title = 'Error en la aplicación';
      message = `Error: ${error.error.message}`;
    } else {
      // Error del servidor
      const serverError = error.error;
      const status = error.status;

      switch (status) {
        case 400: // Bad Request
          title = 'Solicitud incorrecta';
          message = this.parseBadRequest(serverError);
          break;
        
        case 401: // Unauthorized
          //console.log('xxxxxxxx', error)
          title = 'No autorizado';
          message = error.error.message;
          shouldLogout = true;
          break;
        
        case 403: // Forbidden
          title = 'Acceso prohibido';
          message = 'No tiene permiso para realizar esta acción';
          shouldLogout = true;
          break;
        
        case 404: // Not Found
          title = 'Recurso no encontrado';
          message = 'El recurso solicitado no existe o fue eliminado';
          break;
        
        case 422: // Unprocessable Entity
          title = 'Error de validación';
          message = this.parseValidationErrors(serverError);
          break;
        
        case 500: // Internal Server Error
          title = 'Error del servidor';
          message = this.parseServerError(serverError);
          break;
        
        case 503: // Service Unavailable
          title = 'Servicio no disponible';
          message = 'El servicio no está disponible temporalmente. Por favor intente más tarde';
          break;
        
        default:
          title = `Error (${status})`;
          message = this.parseServerError(serverError);
      }
    }

    return { title, message, shouldLogout };
  }

  private parseBadRequest(error: any): string {
    if (!error) return 'Solicitud mal formada';

    // Manejo específico para errores de validación
    if (error.status === 'error' && typeof error.message === 'object') {
      return this.parseValidationErrors(error);
    }

    return this.parseServerError(error);
  }

  private parseValidationErrors(error: any): string {
    const messages: string[] = [];
    
    if (error.message && typeof error.message === 'object') {
      for (const field in error.message) {
        if (Array.isArray(error.message[field])) {
          messages.push(...error.message[field].map(msg => this.translateValidationMessage(field, msg)));
        } else if (typeof error.message[field] === 'string') {
          messages.push(this.translateValidationMessage(field, error.message[field]));
        }
      }
    }

    return messages.length > 0 
      ? messages.join('<br>') // Usamos <br> para saltos de línea en el toast
      : 'Por favor verifique los datos ingresados';
  }

  private translateValidationMessage(field: string, message: string): string {
    const fieldName = this.translateFieldName(field);
    
    // Traducción de mensajes comunes de validación
    if (message.includes('must be a valid email')) {
      return `El ${fieldName} no es válido`;
    }
    if (message.includes('must be at least')) {
      const minLength = message.match(/must be at least (\d+) characters/)?.[1] || '8';
      return `El ${fieldName} debe tener al menos ${minLength} caracteres`;
    }
    if (message.includes('field is required')) {
      return `El campo ${fieldName} es obligatorio`;
    }
    if (message.includes('has already been taken')) {
      return `El ${fieldName} ya está en uso`;
    }
    
    return message;
  }

  private translateFieldName(field: string): string {
    const fieldNames: {[key: string]: string} = {
      'email': 'correo electrónico',
      'password': 'contraseña',
      'name': 'nombre',
      'username': 'nombre de usuario',
      'phone': 'teléfono',
      // Agrega más traducciones según necesites
    };
    
    return fieldNames[field] || field;
  }

  private parseServerError(error: any): string {
    if (!error) return 'Error desconocido del servidor';

    // 1. Detección de errores de violación única (registros duplicados)
    if (typeof error === 'object') {
      // PostgreSQL
      if (error.code === '23505' || error.detail?.includes('already exists')) {
        const matches = error.detail?.match(/Key \((.*?)\)=\((.*?)\) already exists/);
        if (matches) {
          const fields = matches[1].split(',').map(f => this.translateFieldName(f.trim())).join(', ');
          return `El valor '${matches[2]}' ya existe para el campo(s) ${fields}`;
        }
        return 'El registro ya existe en el sistema (violación de unicidad)';
      }

      // MySQL
      if (error.code === 'ER_DUP_ENTRY') {
        return 'El registro ya existe en el sistema';
      }

      // SQL Server
      if (error.number === 2627 || error.number === 2601) {
        return 'El registro ya existe en el sistema';
      }

      // MongoDB
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        const fieldName = this.translateFieldName(field);
        return `El valor '${error.keyValue[field]}' ya existe para el campo ${fieldName}`;
      }

      // APIs REST comunes
      if (error.status === 'error') {
        if (error.message?.includes('Unique violation') || 
            error.message?.includes('already exists') ||
            error.message?.includes('duplicate key')) {
          return 'El registro ya existe en el sistema';
        }
      }
    }

    // 2. Manejo de otros tipos de errores
    if (typeof error === 'string') return error;
    
    if (error.message) {
      if (typeof error.message === 'string') {
        // Traducción de mensajes comunes
        if (error.message.includes('No query results')) {
          return 'No se encontraron resultados';
        }
        if (error.message.includes('tiene hijos')) {
          return 'No se puede eliminar porque tiene registros relacionados';
        }
        return error.message;
      }
      if (typeof error.message === 'object') {
        return 'Error en los datos recibidos del servidor';
      }
    }

    return 'Error en el servidor';
  }

  private addHeaders(request: HttpRequest<any>): HttpRequest<any> {

  // EXCLUIR API externa - NO añadir headers de auth
  if (request.url.includes('api.almacenesespana.ec')) {
    console.log('🌐 Petición a API externa, sin headers de auth local');
    return request.clone({
      setHeaders: {
        Accept: 'application/json'
        // NO incluir Authorization aquí
      }
    });
  }
    // Para peticiones locales, aplicar lógica normal      
    const authorizationKey = request.headers.get('Authorization-Key');
    const token_acces = this._seguridadServices.token;
    
    if (authorizationKey) {
      const headers = new HttpHeaders({
        Accept: 'application/json',
        Authorization: authorizationKey ? authorizationKey : '',
      });

      return request.clone({ headers });
    }

    return request.clone({
      setHeaders: {
        Accept: 'application/json',
        Authorization: token_acces ? 'bearer ' + token_acces : '',
      },
    });
  }
}
