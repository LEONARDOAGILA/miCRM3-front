import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

import { environment } from "../../environments/environment";
export const URL_SERVICIOS = environment.URL_SERVICIOS;
(window as any).Pusher = Pusher;


/**
 * La conexión al servidor de websockets, una sola para toda la aplicación.
 *
 * Antes cada pantalla que llamaba a ECHO_PUSHER() abría su propia conexión y
 * nadie la cerraba: entrar y salir del inicio tres veces dejaba cinco
 * conexiones vivas, con sus escuchas apuntando a componentes ya destruidos
 * (fuga de memoria aquí y una conexión más que mantener allá). Ahora se
 * reutiliza la misma mientras no cambie el token, y cada pantalla sólo se
 * suscribe y se desuscribe de sus canales.
 */
let echoCompartido: any = null;
let tokenDeEcho: string | null = null;


export function ECHO_PUSHER(token: any) {
  const actual = token ?? '';

  // La misma sesión: se reaprovecha lo que ya está conectado
  if (echoCompartido && tokenDeEcho === actual) {
    return echoCompartido;
  }

  // Otro usuario (o token renovado): fuera la anterior antes de abrir otra
  CERRAR_ECHO();

  const wsHost = environment.URL_WEBSOCKETS;
  const wsPort = environment.production ? 443 : 6001;

  tokenDeEcho = actual;
  echoCompartido = new Echo({
    id: "1324656",
    broadcaster: "pusher",
    key: "ASDEFGRG1231",
    cluster: "mt1",
    wsHost: wsHost,
    wsPort: wsPort,
    wssPort: wsPort,
    forceTLS: environment.WEBSOKETS_PRODUCTION,
    disableStats: true,
    enabledTransports: ['ws', 'wss'],
    authEndpoint: `${URL_SERVICIOS}/broadcasting/auth`,
    auth: {
      headers: {
        Authorization: `Bearer ${actual}`,
      },
    },
  });

  return echoCompartido;
}


/** Cierra la conexión: al cerrar sesión, no antes. */
export function CERRAR_ECHO(): void {
  try { echoCompartido?.disconnect?.(); } catch { /* ya estaba caída */ }
  echoCompartido = null;
  tokenDeEcho = null;
}
