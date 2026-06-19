import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, EMPTY, map, Observable, tap } from 'rxjs';

import { AccesoModel } from '../../../seguridad/interfaces/accesoModel';


@Component({
  selector: 'app-spinner',
  templateUrl: './spinner.component.html',
  styleUrls: ['./spinner.component.css'],
  standalone: false,
})
export class SpinnerComponentimplements implements OnInit, OnDestroy{

  isLoading = false;
  isLoading2 = false;
  users: any[];
  timer: number = 0;
  code3: any;

  @Input() isVisible: boolean = false;
  public errorMessage!: string;
  public PokemonResults$!: Observable<any>;
  public acceso: AccesoModel;

  constructor(
    // private toastr: ToastrService,
    private loadingBar: LoadingBarService,
    private httpClient: HttpClient,
    // private _autService: AuthService,
    // private router: Router,
    private route: ActivatedRoute

  ) {
      this.acceso = this.route.snapshot.data.profile;

  }

  ngOnInit() {
    // if (!this._autService.isLoggin()) {
    //   this.router.navigate(['seguridad/login']);
    // }else{
    //   this.toastr.success("Exito",'Bienvenido al Home');        
    // }
  }

  loadData() {
    this.isLoading = true;
    this.loadingBar.start();

    // this.httpClient.get('http://api.almacenesespana.ec/api/almacenesespana/af_migracion_cartera_historica_apis/2024/9/14').subscribe(
    //   (data) => {
    //     console.log(data);
    //     this.isLoading = false;
    //     //this.loadingBar.complete();
    //   },
    //   (error) => {
    //     console.error(error);
    //     this.isLoading = false;
    //     //this.loadingBar.complete();
    //   }
    // );
    
    this.PokemonResults$ = this.httpClient.get('http://api.almacenesespana.ec/api/almacenesespana/af_migracion_cartera_historica_api/2024/11/2').pipe
    (
      catchError((error:string)=>{
        this.errorMessage = error;
        this.isLoading = false;
        this.loadingBar.complete();    
        return EMPTY;
      }),
      tap(() => {
        this.isLoading = false;
        this.loadingBar.complete();    
      })
    );


  }


  loadData2() {
    this.isLoading2 = true;
    this.loadingBar.start();


    // this.httpClient.get('http://api.almacenesespana.ec/api/almacenesespana/af_migracion_cartera_historica_apis/2024/9/14').subscribe(
    //   (data) => {
    //     console.log(data);
    //     this.isLoading2 = false;
    //     this.loadingBar.complete();
    //   },
    //   (error) => {
    //     console.error(error);
    //     this.isLoading2 = false;
    //     this.loadingBar.complete();
    //   }
    // );

    this.PokemonResults$ = this.httpClient.get('http://api.almacenesespana.ec/api/almacenesespana/af_migracion_cartera_historica_api/2024/11/2').pipe
    (
      catchError((error:string)=>{
        this.errorMessage = error;
        this.isLoading2 = false;
        this.loadingBar.complete();    
        return EMPTY;
      }),
      tap(() => {
        this.isLoading2 = false;
        this.loadingBar.complete();    
      })
    );


  }


  startLoading() {
    this.isLoading2 = true;
    this.loadingBar.start();
  }

  stopLoading() {
    this.isLoading2 = false;
    this.loadingBar.complete();
  }



  ngOnDestroy(): void {
  }



}
