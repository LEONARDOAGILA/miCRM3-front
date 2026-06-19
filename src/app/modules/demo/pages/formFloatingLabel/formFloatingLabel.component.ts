import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

import { DataService, Person } from '../../services/data.service';


@Component({
  selector: 'app-formFloatingLabel',
  templateUrl: './formFloatingLabel.component.html',
  styleUrls: ['./formFloatingLabel.component.css'],
  standalone: false,
})
export class FormFloatingLabelComponent implements OnInit {
myForm: FormGroup;
  isdisabled: boolean = false;
  people$: Observable<Person[]>;
  selectedPersonId = '5a15b13c36e7a7f00cf0d7cb';
  
  selectedMonth: string = '';
  months = [
    { value: '1', label: 'Enero' },
    { value: '2', label: 'Febrero' },
    { value: '3', label: 'Marzo' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Mayo' },
    { value: '6', label: 'Junio' },
    { value: '7', label: 'Julio' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Septiembre' },
    { value: '10', label: 'Octubre' },
    { value: '11', label: 'Noviembre' },
    { value: '12', label: 'Diciembre' }
  ];

  constructor(
    private dataService: DataService,
    private fb: FormBuilder,
    private _toastr: ToastrService,
  ) {}

  ngOnInit() {
    this.initForm();
    this.people$ = this.dataService.getPeople();
  }


  initForm() {
    this.myForm = this.fb.group({
      personId: [{ value: this.selectedPersonId, disabled: this.isdisabled },Validators.required],
      monthsId: [{ value: this.selectedMonth, disabled: this.isdisabled },Validators.required]
    });
  }


  public async onSubmitForm($ev: any, data: any) {
    $ev.preventDefault();
    (<any>Object).values(this.myForm.controls).forEach((control: any) => { control.markAsTouched(); });
    if (this.myForm.valid) {
        this._toastr.success(`Formulario. correcto`, `listo para Guardar`, {timeOut: 5000,closeButton: true,});
    }else{
        this._toastr.error(`Revise los campos del formulario.`, `No se puede Guardar`, {timeOut: 5000,closeButton: true,});
    }
}



}