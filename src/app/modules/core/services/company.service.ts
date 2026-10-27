import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { CompanyModel } from '../interfaces/companyModel';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class CompanyService {

  private URL_SERVICIOS: string;  
  private _company?: CompanyModel;
  private _companyEvt$: Subject<CompanyModel>;

  constructor(
      private _http: HttpClient
  ){
    this.URL_SERVICIOS = environment.URL_SERVICIOS + '/api';
    this._companyEvt$ = new Subject();
  }

  public getCompany(id: number) {
    return this._http.get(`${this.URL_SERVICIOS}/company/lista/${id}`);
  }

  public updateCompany(id: number, company: any) {
    let json = JSON.stringify(company);
    let params = 'json=' + json;
    let headers = new HttpHeaders().set(
      'Content-Type',
      'application/x-www-form-urlencoded'
    );
    return this._http
      .put(`${this.URL_SERVICIOS}/company/editar/${id}`, params, {
        headers: headers,
      });
  }

  get company(): CompanyModel | any {
    return this._company;
  }

  set company(value: CompanyModel | any) {
    this._company = value;
    this._companyEvt$.next(value);
  }

  get companyEvt(): Subject<CompanyModel> {
    return this._companyEvt$;
  }

  getCompanyData(): Promise<CompanyModel> {
    return new Promise(async (resolve, reject) => {
      if (this._company) {
        resolve(this._company);
      } else {
        try {
          let company = await this.getCompany(1)
            .pipe(map((res: any) => res.company))
            .toPromise();
          this._company = company;
          resolve(company);
        } catch (error) {
          reject(error);
        }
      }
    });
  }

  // async getLogoUrl() {
  //   try {
  //     await this._http.get(
  //       this._url.replace(
  //         'public/api',
  //         'storage/app/images/' + this._company?.image
  //       )
  //     );

  //     return this._url.replace(
  //       'public/api',
  //       'storage/app/images/' + this._company?.image
  //     );

  //   } catch (error) {
  //     return 'assets/img/logo.png';
  //   }
  // }
}
