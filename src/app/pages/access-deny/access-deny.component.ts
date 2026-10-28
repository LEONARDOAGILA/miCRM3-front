import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * «No tienes permiso para esta pantalla». Es a donde manda AccessResolver
 * (core/resolvers/access.resolver.ts) cuando el perfil no tiene el acceso.
 *
 * A diferencia del 404 (pages/error), ésta NO pone appEmpty: se queda dentro
 * del armazón, con la cabecera y el menú, porque quien la ve tiene sesión
 * abierta y lo que necesita es irse a otra pantalla, no quedarse aislado.
 *
 * El aspecto sale de pages/pagina-estado.scss, compartido con el 404.
 */
@Component({
  selector: 'app-access-deny',
  templateUrl: './access-deny.component.html',
  styleUrls: ['../pagina-estado.scss'],
  standalone: true,
  // La plantilla no tiene condiciones ni bucles: sólo el enlace al inicio.
  imports: [RouterLink],
})
export class AccessDenyComponent { }
