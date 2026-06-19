import { Injectable } from '@angular/core';
import {
  Router,
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { catchError, map, Observable, of } from 'rxjs';
import { ProfileService } from '../../modules/seguridad/services/profile.service';
import { StorageService } from '../../modules/seguridad/services/storage.service';

@Injectable({
  providedIn: 'root',
})
export class AccessResolver implements Resolve<boolean>
{
  constructor(
    private _router: Router,
    private _profileService: ProfileService,
    private _userService: StorageService,
  ) {
  }




  resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {

    if (!route.routeConfig) {
      this._router.navigate(['/access-deny']);
      return of(false);
    }
    //console.log ('route.routeConfig: ',route.routeConfig)


        let mi_url = "";
    if (route.url.length== 0) {
      mi_url = 'home'
    }else{
      mi_url = route.url[0].path
    }
    //console.log ('lpaa ruta:  ',mi_url)



    

    const userLogin = this._userService.getStorageItem('user');
    //console.log ('lpaa userLogin:  ',userLogin)
    
    return this._profileService.findByProgramProfile(userLogin.perfil.id, mi_url)
      .pipe(
          map(
                (res: any) => {

                    if (res.status != "success") {
                        this._router.navigate(["/access-deny"]);
                        return false;
                    }else{
                        if (!Boolean(res.data[0].ejecutar)){
                          this._router.navigate(['/access-deny']);
                          return false;
                        }
                    }
                //console.log('lpaa perfil accesos', res.data[0]);
                return res.data[0];
                }
          ),catchError((err) => {
              //console.log('lpaa perfil acceso', err);
              this._router.navigate(["/access-deny"]);
              return of(false);
          })
      );
  }



}
