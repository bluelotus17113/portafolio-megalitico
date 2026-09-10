# Por qué cada cabecera de `vercel.json`

Vercel pone HSTS por su cuenta y nada más. Lo demás hay que pedirlo.

**`Content-Security-Policy`** — la que hace el trabajo. `script-src 'self'`
significa que el navegador sólo ejecuta guiones servidos desde este dominio: si
mañana se cuela una inyección en el contenido, el guion no llega a correr
aunque el marcado se haya escrito. Es la red debajo del saneado de enlaces, no
un sustituto.

`style-src` sí lleva `'unsafe-inline'`, y es una concesión consciente: las
plantillas escriben atributos `style=` para las barras de nivel y para el acento
de cada sección. Un ataque por estilos puede desfigurar la página; no puede leer
la sesión ni llamar a la API.

`connect-src 'self'` limita a dónde puede hablar la página. **Cuando se conecte
Formspree hay que añadir `https://formspree.io` ahí**, o el formulario dejará de
enviar sin decir por qué.

**`frame-ancestors 'none'` y `X-Frame-Options: DENY`** — las dos dicen lo mismo
y se ponen las dos porque no todos los navegadores leen la primera. Impiden que
alguien meta el sitio en un iframe invisible sobre su propia página y te haga
pulsar botones del panel creyendo que pulsas otra cosa. Con un panel que tiene
botones de borrar, eso no es teórico.

**`X-Content-Type-Options: nosniff`** — que el navegador respete el tipo que se
declara en vez de adivinarlo. Sin esto, un fichero subido puede acabar
ejecutándose como algo que no es.

**`Referrer-Policy`** — al salir hacia GitHub o itch.io no se manda la ruta
completa de la que se venía, sólo el dominio.

**`Permissions-Policy`** — cierra cámara, micrófono y ubicación. La web no los
usa, y lo que no se usa se apaga: si alguna dependencia futura los pide, no los
tiene.

**`no-store` en `/api/`** — que ninguna respuesta con estado de sesión se quede
en una caché intermedia.
