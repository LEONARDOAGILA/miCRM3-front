import { Component, Input, ChangeDetectionStrategy } from '@angular/core';


@Component({
  selector: 'app-error-message',
  templateUrl: './error-message.component.html',
  styleUrls: ['./error-message.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})


export class ErrorMessageComponent {
  @Input() errorMessage!: string;

}