import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AppStateService implements OnDestroy {
  private accesosActualizadosSource = new Subject<void>();
  accesosActualizados$ = this.accesosActualizadosSource.asObservable();
  
  private destroy$ = new Subject<void>();

  notificarAccesosActualizados(): void {
    this.accesosActualizadosSource.next();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.accesosActualizadosSource.complete();
  }
}