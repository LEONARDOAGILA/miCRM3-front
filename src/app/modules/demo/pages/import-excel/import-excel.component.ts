import { Component, OnInit, ViewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ImportExcelService } from '../../services/import-excel.service';
import { Router } from '@angular/router';
import { LoadingService } from '../../../../service/loading.service';
import { ToastrService } from 'ngx-toastr';
import { FileComponent } from '../../../../components/campos/file/file.component';

@Component({
  selector: 'app-import-excel',
  templateUrl: './import-excel.component.html',
  styleUrls: ['./import-excel.component.css'],
  standalone: false,
})
export class ImportExcelComponent implements OnInit {
  title: string = 'Importar archivo';
  public isLoading$ = this._loadingService.isLoading$;
  isdisabled: boolean = true;
  public response: any;

  excelFile: File | null = null;
  archivoSeleccionado: File | null = null;

  @ViewChild(FileComponent) fileComponent!: FileComponent;

  constructor(
    private route: Router,
    private _loadingService: LoadingService,
    private _toastr: ToastrService,
    public _importExcelService: ImportExcelService) { }

  ngOnInit() {
  }

  //   ******   HOME DE MODULO  ******  //
  fun_home() {
    this.route.navigate(['/demo/home']);
  }

  onExcelSelected(file: File | File[]) {
    if (file instanceof File) {
      this.excelFile = file;
      this.archivoSeleccionado = file;
      this.isdisabled = false;
    }
  }

  onFileError(error: string) {
    this.archivoSeleccionado = null;
    this.excelFile = null;
    this.isdisabled = true;
    // console.error('Error al seleccionar archivo:', error);
    this._toastr.error('', error, { closeButton: true });
  }

  onFileRemoved() {
    this.excelFile = null;
    this.archivoSeleccionado = null;
    this.isdisabled = true;
  }

  //   ******   GRABAR   ******  //
  public async saveRecord() {
    try {
      if (!this.archivoSeleccionado) {
        this._toastr.error('', 'Por favor selecciona un archivo.', { closeButton: true });
        return;
      }

      this._loadingService.setLoading(true);
      this.isdisabled = true;

      const formData = new FormData();
      formData.append('archivo', this.archivoSeleccionado);

      this.response = await firstValueFrom(this._importExcelService.addDatosExcel(formData));

      if (this.response.status === 'success') {
        this._toastr.success(this.response.status, this.response.message, { closeButton: true });
        this.limpiarFormulario();
      } else {
        this._toastr.error(this.response.status, this.response.message, { closeButton: true });
        this.isdisabled = false;
      }

      this._loadingService.setLoading(false);

    } catch (error: any) {
      this._toastr.error('', error, { closeButton: true });
      this.isdisabled = false;
      this._loadingService.setLoading(false);
    }
  }

  //   ******   LIMPIAR FORMULARIO   ******  //
  private limpiarFormulario() {
    this.excelFile = null;
    this.archivoSeleccionado = null;
    this.isdisabled = true;
    if (this.fileComponent) {
      this.fileComponent.clearFile();
    }
  }
}
