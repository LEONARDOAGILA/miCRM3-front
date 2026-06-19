import { Component, OnDestroy, OnInit } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { ReferenciasDynamoService } from '../../services/referenciasDynamo.service';


@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  standalone: false,
})
export class HomeComponent implements OnInit, OnDestroy{

  constructor(
    private toastr: ToastrService,
    private _allReferenciasDynamo:ReferenciasDynamoService
  ) {

  }


  ngOnInit(): void {
    this.toastr.success("Exito",'Bienvenido al Home del Demo');
    this.allReferenciasDynamo();
  }

  ngOnDestroy(): void {
  }

async allReferenciasDynamo() {
  try {
    let usuario="NOVASOFT";
    let clave="N'4jP8`W$a£pBsx6NEX2";


    let a = await this._allReferenciasDynamo.getLoginCrm(usuario,clave);
    console.log(a);
  } catch (error) {
    console.error('Error:', error);
    this.toastr.error('Error al obtener datos');
  }
}


}
