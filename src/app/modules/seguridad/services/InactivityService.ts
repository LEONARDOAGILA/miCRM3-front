import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, fromEvent, interval, merge, Subject } from 'rxjs';
import { debounceTime, filter, switchMap, takeUntil,tap } from 'rxjs/operators';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { ToastrService } from 'ngx-toastr';

import { SeguridadService } from './seguridad.service';



@Injectable({
  providedIn: 'root', // Proporciona el servicio en el ámbito raíz
})
export class InactivityService implements OnDestroy {

  private timer: any;
  private inactivityTimeout:number;
  private unsubscribe$ = new Subject<void>();
  private isActive$ = new BehaviorSubject<boolean>(false); // Controla si el servicio está activo
  private inactivityCounter$ = new BehaviorSubject<number>(0); // Contador de inactividad


  constructor(
    private modal: NgbModal,
    private _toastr: ToastrService,    
    private _seguridadService: SeguridadService,   
  ) { }


  public activate(segundos: number): void {
      console.log(`Inicio de sesión correcto -->  Válido por: ${segundos} segundos en inactividad.` ); 
      this.inactivityTimeout = segundos * 1000; // 10 segundos (ajusta según sea necesario)
      this.isActive$.next(true);
      this.setupInactivityListener();
      this.startInactivityCounter();

  }

  
  public deactivate(): void {
      //console.log('Destroy -->  InactivityService')
      this.isActive$.next(false);
      if (this.timer) { clearTimeout(this.timer);}
      this.unsubscribe$.next(); // Desuscribirse de los observables
      this.unsubscribe$.complete(); // Completar el Subject
  }


  ngOnDestroy(): void {
      this.deactivate();
  }



  private setupInactivityListener(): void {
    // Escucha eventos de mousemove, keypress, click y touchstart solo si el servicio está activo
    this.isActive$.pipe(
      filter(isActive => isActive), // Solo procede si el servicio está activo
      switchMap(() => merge(
        fromEvent(window, 'mousemove'),
        fromEvent(window, 'keypress'),
        fromEvent(window, 'click'),
        fromEvent(window, 'touchstart')
      ).pipe(
        debounceTime(500), // Espera 0.5 segundo antes de emitir
        takeUntil(this.unsubscribe$) // Desuscribirse cuando el servicio se destruya o se desactive
      ))
    ).subscribe(() => {
      this.resetTimer();
      this.inactivityCounter$.next(0); // Reinicia el contador de inactividad
    });
  }


  private startInactivityCounter(): void {
    interval(2000).pipe(
      takeUntil(this.unsubscribe$),
      tap(() => {
        if (this.isActive$.value) {
          const currentCounter = this.inactivityCounter$.value + 1;
          this.inactivityCounter$.next(currentCounter);
          console.log(`Tiempo de inactividad: ${currentCounter} segundos`);
        }
      })
    ).subscribe();
  }
  

  private validateAndLogout(): void {
    this.deactivate();
    Swal.close();  // Cerrar SweetAlert2 si está abierto
    this.modal.dismissAll();
    console.log('Fin de Sesión --> Por Inactividad.');
    this._toastr.error(`Tiempo agotado.`, `Fin de Sesión --> Por Inactividad`, {timeOut: 20000, closeButton: true });
    this._seguridadService.logout();

  }


  public resetTimer(): void {
      if (!this.isActive$.value) return; // No hacer nada si el servicio está desactivado
      if (this.timer) { 
        console.log('timer resetado ......');
        clearTimeout(this.timer); 
      }
      this.timer = setTimeout(() => this.validateAndLogout(), this.inactivityTimeout);
  }







}