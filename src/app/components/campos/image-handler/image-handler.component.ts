// image-handler.component.ts
import { Component, EventEmitter, HostListener, Input, Output, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ComprimirImagen } from '../../../service/comprimirImagen';
import { CommonModule } from '@angular/common';



@Component({
  selector: 'app-image-handler',
  templateUrl: './image-handler.component.html',
  styleUrls: ['./image-handler.component.css'],
  standalone: true,
  imports: [CommonModule], // <-- aquí está la solución
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ImageHandlerComponent),
      multi: true
    }
  ]
})
export class ImageHandlerComponent implements ControlValueAccessor {
  @Input() viewMode: boolean = false;
  @Input() maxHeight: string = '300px';
  @Input() placeholderText: string = 'Seleccionar Imagen';
  @Input() userId: number | null = null;
  
  @Output() imageChanged = new EventEmitter<{file: File | null, preview: string | null}>();
  @Output() fullscreenRequested = new EventEmitter<string>();

  public imagen_file: File | null = null;
  public imagen_paste: string | null = null;
  public imagen_previzualiza: string | null = null;
  public isDragOver = false;
  public comprimirImagen: ComprimirImagen = new ComprimirImagen();
  public formDataImg = new FormData();

  private onChange: any = () => {};
  private onTouched: any = () => {};

  constructor(private _toastr: ToastrService) {}

  // ControlValueAccessor methods
  writeValue(value: any): void {
    if (value) {
      this.imagen_previzualiza = value;
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  // Image handling methods
  processFile($event: any) {
    if ($event.target.files[0].type.indexOf("image") < 0) {
      const inputElement: HTMLInputElement = $event.target;
      inputElement.value = '';
      this._toastr.error('El archivo debe ser una imagen', 'Error');
      return;
    }
    
    this.imagen_file = $event.target.files[0];
    const reader = new FileReader();
    reader.readAsDataURL(this.imagen_file);
    reader.onloadend = () => {
      this.imagen_previzualiza = reader.result as string;
      this.onChange(this.imagen_previzualiza);
      this.imageChanged.emit({file: this.imagen_file, preview: this.imagen_previzualiza});
      this.prepareImageForUpload();
    };

    this.imagen_paste = null;
  }

  @HostListener('paste', ['$event']) 
  onPaste(event: ClipboardEvent): void {
    if (this.viewMode) return;
    
    event.preventDefault();
    
    const items = Array.from(event.clipboardData?.items || []);
    const hasImage = items.some(item => item.type.indexOf('image') !== -1);
    
    if (hasImage) {
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            this.handleImagePaste(blob);
            break;
          }
        }
      }
    } else {
      const pastedText = event.clipboardData?.getData('text');
      if (pastedText) {
        const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
        if (activeElement && ['INPUT', 'TEXTAREA'].includes(activeElement.tagName)) {
          const startPos = activeElement.selectionStart || 0;
          const endPos = activeElement.selectionEnd || 0;
          const currentValue = activeElement.value;
          
          activeElement.value = currentValue.substring(0, startPos) + 
                                pastedText + 
                                currentValue.substring(endPos);
          
          const newCursorPos = startPos + pastedText.length;
          activeElement.setSelectionRange(newCursorPos, newCursorPos);
          activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
  }

  handleImagePaste(imageBlob: Blob): void {
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.imagen_paste = e.target.result;
      this.imagen_previzualiza = this.imagen_paste;
      this.imagen_file = new File([imageBlob], 'pasted-image.png', { type: imageBlob.type });
      this.onChange(this.imagen_previzualiza);
      this.imageChanged.emit({file: this.imagen_file, preview: this.imagen_previzualiza});
      this.prepareImageForUpload();
    };
    reader.readAsDataURL(imageBlob);
  }

  clearImage() {    
    this.imagen_previzualiza = null;
    this.imagen_paste = null;
    this.imagen_file = null;
    this.onChange(null);
    this.imageChanged.emit({file: null, preview: null});
    
    const input = document.getElementById('image-input') as HTMLInputElement;
    if (input) {
      input.value = '';
    }
  }

  // Drag and drop methods
  @HostListener('document:dragover', ['$event'])
  onDocumentDragOver(event: DragEvent) {
    if (!this.imagen_previzualiza && !this.viewMode) {
      event.preventDefault();
    }
  }

  onDragOver(event: DragEvent): void {
    if (!this.viewMode) {
      event.preventDefault();
      event.stopPropagation();
      this.isDragOver = true;
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onDrop(event: DragEvent): void {
    if (!this.viewMode) {
      event.preventDefault();
      event.stopPropagation();
      this.isDragOver = false;

      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        this.handleDroppedFile(files[0]);
      }
    }
  }

  private handleDroppedFile(file: File): void {
    if (!file.type.match('image.*')) {
      this._toastr.error('El archivo debe ser una imagen', 'Error');
      return;
    }

    this.imagen_file = file;
    const reader = new FileReader();
    reader.readAsDataURL(this.imagen_file);
    reader.onloadend = () => {
      this.imagen_previzualiza = reader.result as string;
      this.onChange(this.imagen_previzualiza);
      this.imageChanged.emit({file: this.imagen_file, preview: this.imagen_previzualiza});
      this.prepareImageForUpload();
    };
    this.imagen_paste = null;
  }

  // Fullscreen methods
  openFullscreen(): void {
    if (!this.viewMode && this.imagen_previzualiza) {
      this.fullscreenRequested.emit(this.imagen_previzualiza);
    }
  }

  // Utility methods
  async triggerPaste(): Promise<void> {
    try {
      const clipboardItems = await navigator.clipboard.read();
      
      for (const clipboardItem of clipboardItems) {
        for (const type of clipboardItem.types) {
          if (type.startsWith('image/')) {
            const blob = await clipboardItem.getType(type);
            this.handleImagePaste(blob);
            return;
          }
        }
      }
      this._toastr.info('No se encontró una imagen en el portapapeles', 'Información', { timeOut: 3000 });
    } catch (error) {
      console.error('Error al acceder al portapapeles:', error);
      this._toastr.error('No se pudo acceder al portapapeles. Intenta pegar la imagen manualmente con Ctrl+V', 'Error', { timeOut: 4000 });
      
      const pasteInput = document.querySelector('input.d-none') as HTMLInputElement;
      if (pasteInput) {
        pasteInput.focus();
      }
    }
  }

  prepareImageForUpload() {
    if (this.imagen_file) {
      this.comprimirImagen.comprimirImagen(this.imagen_file)
        .then((compressedFile) => {
          this.formDataImg = new FormData();
          if (this.userId) {
            this.formDataImg.append("UserId", this.userId.toString());
          }
          this.formDataImg.append("imagen_file", compressedFile);
        })
        .catch((error) => {
          console.error('Error al comprimir la imagen', error);
        });
    }
  }

  handleImageError(event: any) {
    event.target.style.display = 'none';
    this._toastr.error('No se pudo cargar la imagen', 'Error');
    this.clearImage();
  }
}