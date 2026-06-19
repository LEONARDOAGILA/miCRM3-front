import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Injectable } from '@angular/core';

import { SeguridadService } from '../../modules/seguridad/services/seguridad.service';
import { UserService } from "../../modules/seguridad/services/user.service";


@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private _seguridadService: SeguridadService, 
    private router: Router,
    private _userService: UserService
  ) {}

  async canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> {
    // 1. Verificar login básico
    if (!this._seguridadService.isLoggin()) {
      this.redirectToLogin(state);
      return false;
    }

    // 2. Obtener usuario una sola vez y cachearlo
    const user = this._seguridadService.getUserLogin();
    if (!user || user.isreset) {
      this.redirectToLogin(state);
      return false;
    }

    // 3. Verificar token expirado
    if (this._seguridadService.isexpired()) {
      this._seguridadService.logout();
      this.redirectToLogin(state);
      return false;
    }

    // 4. Verificar estado del usuario Activo o Inactivo
    // try {
    //   const res = await firstValueFrom(this._userService.findByIdUser(user.id));      
    //   if (res?.status !== 'success' || !res.data?.isactive) {
    //     this._seguridadService.logout();
    //     this.redirectToLogin(state);
    //     return false;
    //   }      
    //   return true;
    // } catch (error) {
    //   console.error('Error verifying user status', error);
    //   this._seguridadService.logout();
    //   this.redirectToLogin(state);
    //   return false;
    // }

    return true;

  }

  private redirectToLogin(state: RouterStateSnapshot): void {
    // Guardar URL solicitada para redirección después del login
    this.router.navigate(['/seguridad/login'], {
      queryParams: { returnUrl: state.url }
    });
  }
}



