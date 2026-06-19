import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

import { environment } from "../../environments/environment";
export const URL_SERVICIOS = environment.URL_SERVICIOS;
(window as any).Pusher = Pusher;



export function ECHO_PUSHER(token: any) {
  const wsHost = environment.URL_WEBSOCKETS;
  const wsPort = environment.production ? 443 : 6001;

  return new Echo({
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
        Authorization: `Bearer ${token}`,
      },
    },
  });
}
