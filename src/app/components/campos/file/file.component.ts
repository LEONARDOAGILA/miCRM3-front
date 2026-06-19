import { Component, OnInit, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-file',
  templateUrl: './file.component.html',
  styleUrls: ['./file.component.css'],
  standalone: false,
})
export class FileComponent implements OnInit {
  @Input() accept: string = '*'; // Si no envia el tipo de archivo acepta todos los tipos de archivos (ej: '.pdf', '.xlsx', etc)
  @Input() maxSize: number = 5242880; // Tamaño default máximo en bytes (5MB por defecto si no se envia un tamaño desde donde se ocupe el componente)
  @Input() label: string = 'Seleccionar archivo'; // Si no envian un valor, toma este texto
  @Input() disabled: boolean = false;

  @Output() fileSelected = new EventEmitter<File>();
  @Output() fileError = new EventEmitter<string>();
  @Output() fileRemoved = new EventEmitter<void>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  selectedFile: File | null = null;

  constructor() { }

  ngOnInit() {
  }

  onFileChange(event: any) {
    const files: FileList = event.target.files;

    if (!files || files.length === 0) {
      return;
    }

    this.selectedFile = files[0];

    // Validar tamaño
    if (this.selectedFile.size > this.maxSize) {
      this.fileError.emit(`El archivo excede el tamaño máximo permitido de ${this.formatBytes(this.maxSize)}`);
      this.selectedFile = null;
      return;
    }

    this.fileSelected.emit(this.selectedFile);
  }

  removeFile() {
    this.selectedFile = null;
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
    this.fileRemoved.emit();
  }

  clearFile() {
    this.selectedFile = null;
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  getFileName(): string {
    return this.selectedFile ? this.selectedFile.name : '';
  }
}
