import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { ICellEditorAngularComp } from 'ag-grid-angular';
import { ICellEditorParams } from 'ag-grid-community';

/**
 * Editor de celda de ag-Grid para fechas (AAAA-MM-DD) con calendario.
 *
 * Usa el <input type="date"> nativo: abre el calendario del navegador
 * (Chrome/Edge/Firefox de escritorio y la rueda de iOS), sin dependencias y
 * sin problemas de posicionamiento dentro de la grilla. Al entrar en edición
 * llama a showPicker() cuando el navegador lo soporta, así el calendario se
 * despliega con un solo clic sobre la celda.
 *
 * Uso en columnDefs:
 *   { field: 'fecha', editable: true, cellEditor: FechaCellEditorComponent,
 *     cellEditorParams: { min: '2024-01-01' } }
 *
 * Devuelve la cadena AAAA-MM-DD o null si se borra; Escape cancela.
 */
@Component({
  selector: 'app-fecha-cell-editor',
  standalone: true,
  template: `
    <input #campo type="date" class="fecha-cell-editor"
           [value]="valor"
           [min]="min" [max]="max"
           (input)="valor = campo.value"
           (change)="valor = campo.value; cerrar()"
           (keydown.enter)="cerrar()"
           (keydown.escape)="cancelar()" />
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .fecha-cell-editor {
      width: 100%;
      height: 100%;
      padding: 0 .35rem;
      border: 1px solid var(--bs-primary, #348fe2);
      border-radius: .25rem;
      background-color: var(--bs-component-bg, #fff);
      color: var(--bs-body-color, #212529);
      font-size: 12px;
      outline: none;
    }
  `],
})
export class FechaCellEditorComponent implements ICellEditorAngularComp, AfterViewInit {
  @ViewChild('campo') campo!: ElementRef<HTMLInputElement>;

  public valor = '';
  public min = '';
  public max = '';

  private params!: ICellEditorParams;
  private cancelado = false;

  agInit(params: ICellEditorParams): void {
    this.params = params;
    this.valor = (params.value ?? '') as string;
    this.min = (params as any).min ?? '';
    this.max = (params as any).max ?? '';
  }

  ngAfterViewInit(): void {
    // Foco y calendario abierto sin esperar otro clic
    setTimeout(() => {
      const el = this.campo?.nativeElement;
      if (!el) { return; }
      el.focus();
      try { (el as any).showPicker?.(); } catch { /* algunos navegadores exigen gesto del usuario */ }
    });
  }

  getValue(): string | null {
    if (this.cancelado) { return this.params.value ?? null; }
    return this.valor ? this.valor : null;
  }

  isCancelAfterEnd(): boolean { return this.cancelado; }

  cerrar(): void { this.params.api?.stopEditing(); }

  cancelar(): void {
    this.cancelado = true;
    this.params.api?.stopEditing(true);
  }
}
