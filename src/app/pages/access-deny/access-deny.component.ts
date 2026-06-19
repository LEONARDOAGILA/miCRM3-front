import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Router } from '@angular/router';

@Component({
  selector: 'app-access-deny',
  templateUrl: './access-deny.component.html',
  styleUrls: ['./access-deny.component.scss']
})
export class AccessDenyComponent implements OnInit {

  constructor(private _router: Router) { }

  ngOnInit(): void {
  }

  goBack(){
    window.history.back();
  }

  goInit(){
    this._router.navigate(['ae/inicio']);
  }

}
