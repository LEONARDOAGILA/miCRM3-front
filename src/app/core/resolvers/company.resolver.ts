import { Injectable } from '@angular/core';
import {
  Router,
  Resolve,
  RouterStateSnapshot,
  ActivatedRouteSnapshot,
} from '@angular/router';
import { Observable, of } from 'rxjs';
import { SeguridadService } from '../../modules/seguridad/services/seguridad.service';
import { CompanyModel } from '../../modules/config/interfaces/companyModel';
import { CompanyService } from '../../modules/config/services/company.service';



@Injectable({
  providedIn: 'root',
})
export class CompanyResolver implements Resolve<boolean> {
  constructor(
    private _companyService: CompanyService,
    private _seguridadService: SeguridadService,
    private _router: Router
  ) {}

  resolve(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Promise<any> | Observable<any> {
    return new Promise<any>((resolve, reject) => {
      this._companyService
        .getCompanyData()
        .then((company: CompanyModel) => {
          resolve(company);
        })
        .catch((error) => {
          this._seguridadService.logout();
          this._router.navigate(['/seguridad/login']);
          reject(error);
        });
    });
  }
}
