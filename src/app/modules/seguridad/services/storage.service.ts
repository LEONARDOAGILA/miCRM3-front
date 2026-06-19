import { Injectable } from '@angular/core';


@Injectable({
  providedIn: 'root',
})
export class StorageService {
  constructor() {}

  setStorageItem(key: string, value: string) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  getStorageItem(key: string) {
    let value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  }

  removeStorgeItem(key: string) {
    localStorage.removeItem(key);
  }
}
