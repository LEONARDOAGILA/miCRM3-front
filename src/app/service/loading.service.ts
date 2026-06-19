import { Injectable } from '@angular/core';
import { LoadingBarService } from '@ngx-loading-bar/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class LoadingService {

  private _isLoading = new BehaviorSubject<boolean>(false);
  public isLoading$ = this._isLoading.asObservable();

  constructor(private loadingBar: LoadingBarService) {}

  setLoading(indicator: boolean): void {
    setTimeout(() => this._isLoading.next(indicator));
    indicator ? this.loadingBar.start() : this.loadingBar.complete();
  }
}

