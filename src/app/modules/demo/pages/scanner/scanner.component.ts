import { Component, EventEmitter, Output, OnInit, OnDestroy, HostListener } from '@angular/core';
import { BarcodeFormat } from '@zxing/library';
import * as _ from 'lodash-es';
import { Subject } from 'rxjs';

@Component({
  selector: 'app-scanner',
  templateUrl: './scanner.component.html',
  styleUrls: ['./scanner.component.css'],
  standalone: false,
})
export class ScannerComponent implements OnInit, OnDestroy {
  @Output() scanComplete = new EventEmitter<string>();
  
  private destroy$ = new Subject<void>();
  
  // Variables para el modal de cámara
  public showCameraModal: boolean = false;
  public cameraError: string = '';
  
  // Variables para el escáner dentro del modal
  public isModalScannerActive: boolean = false;
  public modalAllowedFormats: BarcodeFormat[] = [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODABAR,
    BarcodeFormat.CODE_93,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.PDF_417,
    BarcodeFormat.AZTEC
  ];
  public modalPreferredDevice: MediaDeviceInfo | undefined;
  public modalDevicesFound: MediaDeviceInfo[] = [];
  public modalBackCamerasFound: MediaDeviceInfo[] = [];
  public isModalTorchEnabled: boolean = false;
  public isModalTorchCompatible: boolean = false;
  public isModalScannerStarting: boolean = false;
  
  // Variables para el escáner principal
  public allowedBarcodeFormats: BarcodeFormat[] = [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODABAR,
    BarcodeFormat.CODE_93,
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.PDF_417,
    BarcodeFormat.AZTEC
  ];
  public isTorchEnabled: boolean = false;
  public isTorchCompatible: boolean = false;
  public isScannerStarting: boolean = false;
  public devicesFound: MediaDeviceInfo[] = [];
  public backCamerasFound: MediaDeviceInfo[] = [];
  public preferredDevice: MediaDeviceInfo | undefined;
  
  // Propiedades para manejo de escaneos
  lastScannedCode: string | null = null;
  lastScannedFormat: string = '';
  scanHistory: Array<{code: string, format: string, timestamp: Date}> = [];
  isScanning: boolean = true;
  autoClearDelay: number = 2000;
  scanTimeout: any;
  continuousMode: boolean = true;
  lastScanTime: number = 0;
  scanCooldown: number = 1000;
  
  // Estadísticas
  totalScans: number = 0;
  qrScans: number = 0;
  barcodeScans: number = 0;
  
  today: Date = new Date();

  constructor() {
    setInterval(() => {
      this.today = new Date();
    }, 60000);
  }

  ngOnInit(): void {}

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  //   ******   FUNCIONES DEL ESCÁNER PRINCIPAL   ******  //
  
  camerasFound(cameras: MediaDeviceInfo[]): void {
    this.devicesFound = _.filter(
      cameras,
      (device: MediaDeviceInfo): boolean => device.kind === 'videoinput'
    );

    this.backCamerasFound = _.sortBy(
      this.devicesFound.filter((device: MediaDeviceInfo): boolean => {
        return /back|trás|rear|traseira|environment|ambiente/gi.test(
          device.label
        );
      }),
      (device: MediaDeviceInfo): string => {
        const label = device.label;
        const matches = label.match(/\s+(\d+)$/);
        if (!!matches) {
          return matches[1].padStart(3, '0');
        }
        return device.label;
      }
    );
    
    if (this.backCamerasFound.length > 0) {
      this.preferredDevice = this.backCamerasFound[0];
    } else if (this.devicesFound.length > 0) {
      this.preferredDevice = this.devicesFound[0];
    }
  }

  torchCompatible(compatible: boolean): void {
    this.isTorchCompatible = compatible;
  }

  setDevice(device: MediaDeviceInfo): void {
    this.preferredDevice = device;
  }

  scannerStarting(): void {
    this.isScannerStarting = true;
  }

  scannerStarted(): void {
    this.isScannerStarting = false;
  }

  backCameraIndex(device: MediaDeviceInfo): number {
    return _.findIndex(
      this.backCamerasFound,
      (backCamera: MediaDeviceInfo) => backCamera.deviceId === device.deviceId
    );
  }

  toggleTorch(): void {
    this.isTorchEnabled = !this.isTorchEnabled;
  }

  scanSuccess(result: string): void {
    const now = Date.now();
    if (now - this.lastScanTime < this.scanCooldown) {
      return;
    }
    this.lastScanTime = now;
    
    const codeFormat = this.detectCodeFormat(result);
    
    this.totalScans++;
    if (codeFormat === 'QR Code' || codeFormat === 'QR Code (URL)') {
      this.qrScans++;
    } else {
      this.barcodeScans++;
    }
    
    this.lastScannedCode = result;
    this.lastScannedFormat = codeFormat;
    
    this.addToHistory(result, codeFormat);
    this.scanComplete.emit(result);
    this.processScannedCode(result, codeFormat);
    this.showScanFeedback(codeFormat);
    
    if (!this.continuousMode) {
      this.pauseScanner();
    }
    
    if (this.autoClearDelay > 0) {
      if (this.scanTimeout) {
        clearTimeout(this.scanTimeout);
      }
      this.scanTimeout = setTimeout(() => {
        this.clearLastScanned();
      }, this.autoClearDelay);
    }
  }

  //   ******   FUNCIONES DEL MODAL DE CÁMARA   ******  //
  
  openCamera(): void {
    this.showCameraModal = true;
    this.cameraError = '';
    this.isModalScannerActive = true;
    this.modalDevicesFound = [];
    this.modalPreferredDevice = undefined;
  }

  onModalCamerasFound(cameras: MediaDeviceInfo[]): void {
    this.modalDevicesFound = _.filter(
      cameras,
      (device: MediaDeviceInfo): boolean => device.kind === 'videoinput'
    );

    this.modalBackCamerasFound = _.sortBy(
      this.modalDevicesFound.filter((device: MediaDeviceInfo): boolean => {
        return /back|trás|rear|traseira|environment|ambiente/gi.test(
          device.label
        );
      }),
      (device: MediaDeviceInfo): string => {
        const label = device.label;
        const matches = label.match(/\s+(\d+)$/);
        if (!!matches) {
          return matches[1].padStart(3, '0');
        }
        return device.label;
      }
    );
    
    if (this.modalBackCamerasFound.length > 0) {
      this.modalPreferredDevice = this.modalBackCamerasFound[0];
    } else if (this.modalDevicesFound.length > 0) {
      this.modalPreferredDevice = this.modalDevicesFound[0];
    }
  }

  onModalTorchCompatible(compatible: boolean): void {
    this.isModalTorchCompatible = compatible;
  }

  onModalScanSuccess(result: string): void {
    const now = Date.now();
    if (now - this.lastScanTime < this.scanCooldown) {
      return;
    }
    this.lastScanTime = now;
    
    const codeFormat = this.detectCodeFormat(result);
    
    this.totalScans++;
    if (codeFormat === 'QR Code' || codeFormat === 'QR Code (URL)') {
      this.qrScans++;
    } else {
      this.barcodeScans++;
    }
    
    this.lastScannedCode = result;
    this.lastScannedFormat = codeFormat;
    
    this.addToHistory(result, codeFormat);
    this.scanComplete.emit(result);
    this.processScannedCode(result, codeFormat);
    this.showScanFeedback(codeFormat);
    
    // Modo ÚNICO: cerrar la cámara después del escaneo
    if (!this.continuousMode) {
      this.closeCamera();
    }
    // Modo CONTINUO: mantener la cámara abierta
    
    if (this.autoClearDelay > 0) {
      if (this.scanTimeout) {
        clearTimeout(this.scanTimeout);
      }
      this.scanTimeout = setTimeout(() => {
        this.clearLastScanned();
      }, this.autoClearDelay);
    }
  }

  setModalDevice(device: MediaDeviceInfo): void {
    this.modalPreferredDevice = device;
  }

  toggleModalTorch(): void {
    this.isModalTorchEnabled = !this.isModalTorchEnabled;
  }

  modalScannerStarting(): void {
    this.isModalScannerStarting = true;
  }

  modalScannerStarted(): void {
    this.isModalScannerStarting = false;
  }

  modalBackCameraIndex(device: MediaDeviceInfo): number {
    return _.findIndex(
      this.modalBackCamerasFound,
      (backCamera: MediaDeviceInfo) => backCamera.deviceId === device.deviceId
    );
  }

  async switchModalCamera(): Promise<void> {
    try {
      if (this.modalDevicesFound.length < 2) {
        this.showNotification('Solo hay una cámara disponible');
        return;
      }
      
      const currentIndex = this.modalDevicesFound.findIndex(
        device => device.deviceId === this.modalPreferredDevice?.deviceId
      );
      
      const nextIndex = (currentIndex + 1) % this.modalDevicesFound.length;
      const nextDevice = this.modalDevicesFound[nextIndex];
      
      if (nextDevice) {
        this.setModalDevice(nextDevice);
      }
    } catch (error) {
      console.error('Error al cambiar de cámara:', error);
      this.showNotification('No se pudo cambiar la cámara');
    }
  }

  closeCamera(): void {
    this.showCameraModal = false;
    this.isModalScannerActive = false;
    this.isModalTorchEnabled = false;
    this.cameraError = '';
  }

  //   ******   FUNCIONES COMPARTIDAS   ******  //
  
  detectCodeFormat(code: string): string {
    const cleanCode = code.trim();
    
    if (cleanCode.includes('http://') || cleanCode.includes('https://')) {
      return 'QR Code (URL)';
    }
    
    if (cleanCode.match(/^[A-Z0-9\-_=+/\s]{20,}$/)) {
      return 'QR Code';
    }
    
    if (cleanCode.match(/^\d{13}$/)) {
      return 'EAN-13';
    }
    
    if (cleanCode.match(/^\d{8}$/)) {
      return 'EAN-8';
    }
    
    if (cleanCode.match(/^\d{12}$/)) {
      return 'UPC-A';
    }
    
    if (cleanCode.match(/^[A-Z0-9\-_]{8,20}$/)) {
      return 'CODE 128/39';
    }
    
    if (cleanCode.match(/^[A-Z]{2,4}-\d{6,12}$/)) {
      return 'Serial Number';
    }
    
    if (cleanCode.match(/^\d{10,15}$/)) {
      return 'Product Code';
    }
    
    return 'Barcode';
  }
  
  processScannedCode(code: string, format: string): void {
    try {
      const url = new URL(code);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        const shouldOpen = confirm(`¿Deseas abrir el enlace?\n${code}`);
        if (shouldOpen) {
          window.open(code, '_blank');
        }
        return;
      }
    } catch (e) {}
    
    if (this.isSerialNumber(code)) {
      this.handleSerialNumber(code);
      return;
    }
    
    if (this.isProductCode(code)) {
      this.handleProductCode(code);
      return;
    }
    
    console.log('Texto escaneado:', code);
    this.showNotification(`Escaneado: ${code.substring(0, 50)}${code.length > 50 ? '...' : ''}`);
  }
  
  isSerialNumber(code: string): boolean {
    const serialPatterns = [
      /^[A-Z]{2,4}-\d{6,12}$/,
      /^SN[A-Z0-9]{8,20}$/i,
      /^[A-Z0-9]{10,20}$/,
      /^[A-Z]{2}\d{8,12}$/
    ];
    return serialPatterns.some(pattern => pattern.test(code));
  }
  
  isProductCode(code: string): boolean {
    const productPatterns = [
      /^\d{13}$/,
      /^\d{12}$/,
      /^\d{8}$/
    ];
    return productPatterns.some(pattern => pattern.test(code));
  }
  
  handleSerialNumber(serial: string): void {
    const serials = this.getStoredSerials();
    serials.unshift({
      serial: serial,
      timestamp: new Date().toISOString(),
      type: 'serial'
    });
    
    if (serials.length > 50) {
      serials.pop();
    }
    
    localStorage.setItem('scanned_serials', JSON.stringify(serials));
    this.showNotification(`Número de serie registrado: ${serial}`);
  }
  
  handleProductCode(code: string): void {
    const products = this.getStoredProducts();
    products.unshift({
      code: code,
      timestamp: new Date().toISOString(),
      type: 'product'
    });
    
    if (products.length > 50) {
      products.pop();
    }
    
    localStorage.setItem('scanned_products', JSON.stringify(products));
    this.showNotification(`Código de producto registrado: ${code}`);
  }
  
  getStoredSerials(): any[] {
    const stored = localStorage.getItem('scanned_serials');
    return stored ? JSON.parse(stored) : [];
  }
  
  getStoredProducts(): any[] {
    const stored = localStorage.getItem('scanned_products');
    return stored ? JSON.parse(stored) : [];
  }
  
  addToHistory(code: string, format: string): void {
    this.scanHistory.unshift({
      code: code,
      format: format,
      timestamp: new Date()
    });
    
    if (this.scanHistory.length > 20) {
      this.scanHistory.pop();
    }
  }
  
  showScanFeedback(format: string): void {
    this.playBeep();
  }
  
  playBeep(): void {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 880;
      gainNode.gain.value = 0.1;
      
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
      oscillator.stop(audioContext.currentTime + 0.3);
      
      setTimeout(() => {
        audioContext.close();
      }, 400);
    } catch (e) {
      console.log('No se pudo reproducir el sonido');
    }
  }
  
  showNotification(message: string): void {
    const notification = document.createElement('div');
    notification.className = 'scan-notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }
  
  clearLastScanned(): void {
    this.lastScannedCode = null;
    this.lastScannedFormat = '';
  }
  
  pauseScanner(): void {
    this.isScanning = false;
  }
  
  resumeScanner(): void {
    this.isScanning = true;
  }
  
  toggleContinuousMode(): void {
    this.continuousMode = !this.continuousMode;
    if (this.continuousMode) {
      this.resumeScanner();
    }
    this.showNotification(`Modo ${this.continuousMode ? 'continuo' : 'único'} activado`);
  }
  
  clearHistory(): void {
    if (confirm('¿Deseas borrar todo el historial de escaneos?')) {
      this.scanHistory = [];
      localStorage.removeItem('scanned_serials');
      localStorage.removeItem('scanned_products');
      this.showNotification('Historial limpiado');
    }
  }
  
  copyLastScanned(): void {
    if (this.lastScannedCode) {
      navigator.clipboard.writeText(this.lastScannedCode).then(() => {
        this.showNotification('Copiado al portapapeles');
      });
    }
  }
  
  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.showNotification('Copiado al portapapeles');
    });
  }
  
  exportHistory(): void {
    const data = {
      exportDate: new Date().toISOString(),
      totalScans: this.totalScans,
      qrScans: this.qrScans,
      barcodeScans: this.barcodeScans,
      history: this.scanHistory
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scanner-history-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.showNotification('Historial exportado');
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: KeyboardEvent) {
    if (this.showCameraModal) {
      this.closeCamera();
    }
  }
}
