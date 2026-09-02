# Promontorio de Piedra

Portafolio interactivo en 3D. Un promontorio megalítico sobre el Atlántico donde
cada sección de la hoja de vida es un monumento que se puede visitar.

No hay un solo archivo de imagen ni de modelo en el proyecto: el terreno, las
piedras, las texturas, los carteles y los efectos se generan por código en el
arranque. Cambiar `SEED` en `src/config.js` genera otro promontorio.

---

## Empezar

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # genera dist/
npm run preview    # sirve dist/ en http://127.0.0.1:4173
```

Requiere Node 18+ y un navegador con WebGL 2. Sin WebGL se muestra
automáticamente el portafolio en texto plano.

---

## Poner tus datos

**Edita `src/content.js` y nada más.** Es el único fichero con texto. La escena
se reconstruye sola a partir de él:

| Qué cambias                | Qué pasa en la escena                                  |
| -------------------------- | ------------------------------------------------------ |
| `PROJECTS[]`               | Un monolito con su lámina por proyecto (6–12 va bien)  |
| `SKILLS[]`                 | Una runa flotante por habilidad, agrupadas por familia |
| `EXPERIENCE[]`             | Un mojón por etapa a lo largo del sendero              |
| `CONTACT.links[]`          | Una piedra con su runa por canal                       |
| `IDENTITY.oghamMotto`      | Lo que queda grabado en ogham en la estela             |
| `CONTACT.endpoint`         | Con una URL, el formulario envía de verdad             |

Los enlaces con `href: null` se dibujan apagados y no se pueden pulsar: es
deliberado, para que no haya botones que no llevan a ninguna parte.

Si quieres usar capturas reales en vez de los carteles generativos, añade la
imagen al proyecto y sustituye `posterTexture(...)` por una carga de textura en
`src/sections/Projects.js`.

---

## Dos versiones del mismo portafolio

El promontorio no es la única forma de leerlo. Hay una **versión ligera** —una
página normal, sin 3D— que se dibuja desde los mismos datos de `content.js`:
se escribe el contenido una vez y se llenan las dos.

### La puerta: PANEL o ISLA

Lo primero que se ve son **dos cuadrados**. Cuadrados de verdad
(`aspect-ratio: 1`) y del mismo tamaño, uno al lado del otro: así se leen como
una elección entre iguales, sin que la forma insinúe cuál es la buena.
Ninguna de las dos versiones es el premio de consolación de la otra.

Antes de existir, el portafolio decidía solo —detectaba el equipo y servía una
de las dos—, y era una decisión que no le tocaba tomar: quien llega a un
portafolio no viene a que le administren el ancho de banda. Preguntar cuesta
un segundo y además cuenta que hay dos cosas que ver, que es información que
antes se perdía entera.

Los motivos de los cuadrados no son iconos genéricos: PANEL enseña un mosaico
de doce runas del futhark antiguo —las mismas que la escena convierte en tubos
de piedra— que se encienden en cascada al señalarlo; ISLA, un trilito y dos
menhires bajo la luna, con el amanecer subiendo por el horizonte.

La puerta vive en el **bundle de entrada**, no en un trozo aparte: es lo
primero que se pinta y no puede esperar a un viaje de red. Elegir PANEL no
descarga ni un byte del motor, que es toda la gracia.

| Cómo se llega                      | A dónde                                     |
| ---------------------------------- | ------------------------------------------- |
| Sin parámetro                      | La puerta. Elige el visitante               |
| `?modo=ligero` / `?modo=3d`        | Derecho, sin preguntar                      |
| `?instant`, `?editor`              | La isla — sólo existen para la escena       |
| Botón del menú, o el de la carga   | Cambia y lo recuerda                        |
| Si la escena revienta al cargar    | Ligera, en vez de una pantalla negra        |

Al elegir **no se recarga**: la versión se monta en la misma página y la
dirección se corrige con `history.replaceState`, de modo que el enlace que
alguien copie de la barra lleva a lo que estaba viendo.

Lo que se eligió la última vez —o, en la primera visita, lo que el equipo
aguante— llega marcado como **«Sugerido»**, no aplicado y no enfocado.
Enfocarlo por programa dispara `:focus-visible`, y con él el cuadrado se
enciende entero: pintado igual que si el ratón estuviera encima, deja de
parecer una sugerencia y parece la opción ya elegida.

Esa sugerencia automática es **deliberadamente estrecha**: `saveData`, 2 GB de
memoria o 2 núcleos. Un móvil corriente aguanta el promontorio de sobra y es
donde más se comparte un enlace; sugerir PANEL por el mero hecho de ser táctil
sería empujar hacia lo que no distingue a este portafolio de otro cualquiera.

Y lo que decide si sirve de algo no es que se oculte el lienzo, sino que **no
se descargue el motor**: `src/main.js` no importa `three` ni nada que lo
importe, y llega a `Experience` por `import()` dinámico. Ocultar el canvas
después de tragarse 635 kB no habría ayudado a nadie.

```
      versión plena   233 kB + 635 kB de three     (≈255 kB gzip)
      versión ligera   27 kB, sin three            (≈ 11 kB gzip)
```

Por eso `posterCanvas` vive en `utils/posters.js` sin tocar three y las cuatro
líneas que lo envuelven en textura están en `sections/Projects.js`: el mismo
cartel generativo ilustra las fichas de la versión ligera, y un solo `import`
mal puesto ahí dentro tira abajo todo el reparto. `tools/ligero-check.mjs`
mira la lista de peticiones justamente por eso — a ojo, las dos versiones se
ven idénticas.

Cambiar de versión **recarga**. Es a propósito: ir a la ligera obligaría a
desmontar renderizador, mundo, colisionadores y bucle; volver, a montarlo todo
con la barra de carga que ya existe. La recarga hace las dos cosas bien por
definición y deja en la barra de direcciones una URL que se puede compartir.

### Un panel grabado

La versión ligera lleva las mismas inscripciones que la piedra de la escena, y
no unas parecidas: `utils/glifos.js` pasa a SVG los trazos de `runes.js` y
`ogham.js`, que son los que el promontorio convierte en tubos de piedra y en
muescas de cincel. Redibujarlas a mano habría dado dos alfabetos que van
separándose con cada retoque, y la gracia de que el panel parezca grabado es
que lo grabado sea lo mismo.

- **El nombre de cada sección, en ogham, sobre la línea vertical.** El *druim*
  —la arista sobre la que se escribe el ogham— es literalmente el canto de la
  piedra, así que la línea que ya estructuraba la página pasa a ser una arista
  labrada. No es adorno con forma de escritura: son las letras del título.
- **Una runa por sección, al pie de su filete**, elegida por lo que significa:
  *mannaz* (la persona) para Sobre mí, *ingwaz* (la semilla, la obra acabada)
  para Proyectos, *kaunan* (la antorcha) para Habilidades, *raidho* (el viaje)
  para Trayectoria y *ansuz* (la palabra) para Contacto.

Las runas se eligieron a mano después de que un hash del identificador le
asignara *isaz* a Proyectos — que es una raya vertical, y a veinte píxeles no
se lee como runa sino como una marca suelta que alguien se dejó ahí. Un sorteo
no puede acertar con algo que se mira de cerca.

Y `oghamSVG` fuerza una **caja simétrica** alrededor de la arista. Ceñida a
las muescas, cuántas caen a cada lado depende de las letras, así que la arista
quedaba descentrada por una cantidad distinta en cada palabra: al colocar el
SVG sobre la línea de la página aparecían dos rayas paralelas casi juntas, que
se lee peor que una sola.

### El sendero de Trayectoria

La sección se llama *El Camino del Viajero* y en la escena es literalmente un
sendero de mojones que asciende. En la versión ligera es lo mismo en dos
dimensiones: **una vereda que serpentea hacia arriba con un mojón por etapa**,
al fondo de su sección, que se traza sola cuando el visitante llega.

Asciende porque la cronología se lee del presente hacia atrás: arriba está
*hoy*, que es adonde lleva el camino.

Va en la **banda derecha**, la única parte de la sección que está vacía — el
detalle de cada hito tiene la medida topada en 62 caracteres y deja un palmo
libre. Cruzando por detrás del texto, una línea a media opacidad no se lee como
marca de agua sino como un fallo de pintado.

Son **tres trazos y no uno**: una sola raya serpenteando es un garabato, y con
las dos orillas a los lados pasa a leerse como una vereda pisada. El del medio
es el que se traza —el viaje—; las orillas ya están cuando uno llega.

Y todo son **líneas, ninguna forma cerrada**. El SVG se estira para llenar el
alto de la sección, que depende de cuántas etapas haya, y ese estirado no es
igual en los dos ejes: un círculo saldría elipse y un cuadrado, rombo. Una
línea sólo cambia de largo. Por lo mismo, `vector-effect="non-scaling-stroke"`
va en **cada línea y no en el grupo** —no se hereda—, o el grosor del trazo se
estiraría con la caja y los travesaños saldrían más gordos o más finos según
cuántas etapas hubiera.

#### Lo que cuesta, medido

El trazado usa `stroke-dashoffset`, que en Blink cuesta **un layout por
fotograma**: unos 200 ms de hilo principal mientras dura. Eso es un pago único
al llegar a la sección, del orden de lo que cuesta dibujar una sola lámina. Lo
que no sería admisible es que siguiera después, y no sigue:

```
  ya trazado, en reposo    con sendero   sin sendero
  layouts en 4 s                     0             0
  hilo principal                  8 ms          6 ms
```

Ese número costó cuatro mediciones equivocadas. Al pausar las animaciones para
aislar la causa, `getAnimations().pause()` **pausa también las transiciones en
curso** — y como el trazado dura 2,2 s y los mojones escalonados llegan a 1,9 s,
lo que se estaba midiendo seguía siendo el trazado. Parecía un coste
permanente de 120 layouts cada cuatro segundos. Basta con dejar terminar la
entrada antes de empezar a contar; `ligero-check.mjs` espera cinco segundos por
eso.

### La retícula, que es de donde sale todo lo demás

La versión ligera se maqueta en **dos columnas asimétricas**: a la izquierda,
estrecha y **fija**, los datos de la sección —número, título, subtítulo, la
línea de ambientación—; a la derecha, el contenido. Y una sola línea vertical
que baja por toda la página, de la que cuelgan las cinco secciones.

No es adorno. Con todo centrado en una columna, el rótulo de «Proyectos» pasa
de largo en la segunda pantalla y las siete fichas restantes se leen ya sin
saber dónde se está. Fijando el raíl, el título deja de ser algo que ocurrió y
pasa a ser el encabezado de lo que se está mirando. Es también la pieza que más
fácil se rompe sin hacer ruido —basta un `overflow` distinto de `visible` en
cualquier antepasado— así que `ligero-check.mjs` la mide en vez de mirarla.

### El fondo: cuatro capas, tres de ellas quietas

De abajo arriba: un **degradado vertical** con el resplandor arcano asomando
por el borde superior; dos **resplandores a la deriva** —arcano y brasa— que
respiran y se cruzan; una capa de **motas** que asciende; y encima de todo,
**grano**. Un mosaico de ruido de 160 px que genera el propio navegador, sin
pedir ni un fichero, al 4 % de opacidad.

El grano va *encima* de lo que se mueve, y ahí está el truco: un degradado a la
deriva, solo, se lee como plástico. Pasando por debajo de una trama fija de
ruido se lee como luz cambiando sobre una superficie. Y un negro plano de
pantalla se lee como «sin terminar», porque en papel nunca hay un plano
perfecto y el ojo lo echa de menos aunque no sepa nombrarlo.

**Sólo se anima `transform` y `opacity`**, que son las dos únicas propiedades
que el navegador resuelve componiendo capas ya dibujadas. No es una preferencia
estética: animar `background-position`, un `filter` o un color obligaría a
repintar la ventana entera sesenta veces por segundo, y eso en la versión que
existe para el equipo flojo es contradecir el motivo de que exista. Medido con
`Performance.getMetrics`, seis segundos de animación con la página quieta:

```
  LayoutCount            0
  RecalcStyleCount       0
  ScriptDuration       0.0 ms
```

Los períodos son **71, 97 y 53 segundos**, primos entre sí a propósito: con
duraciones parecidas las tres capas vuelven a coincidir cada poco y el bucle se
ve. Así el conjunto tarda casi una hora en repetirse.

#### Dos cosas que sólo se supieron midiendo

**La primera versión no se veía.** Las tres capas se movían, `getAnimations()`
las listaba, y dos capturas separadas cuarenta y ocho segundos eran
prácticamente el mismo píxel: 0,010 de diferencia media sobre 765. Un
resplandor de mil píxeles de caída suave que se corre doscientos no cambia la
luz de ningún punto lo bastante para que un ojo lo registre. El ojo detecta
mucho antes que algo **se enciende y se apaga** que un deslizamiento lento, así
que ahora el trabajo lo lleva la opacidad y la deriva sólo pone la variación.
`tools/fondo-check.mjs` mide justo eso, y el recorrido completo está en 9,1.

**Y antes de eso, no se dibujaban en absoluto.** Las capas de fondo llevaban
invisibles desde el rediseño, y no lo detectó nadie porque la página se veía
entera, sólo que lisa. `ui.css` pone `background` en `html` **y** en `body`, y
dentro del contexto de apilamiento raíz el fondo de los elementos de bloque en
flujo —`body` es uno— se pinta **después** que los descendientes con `z-index`
negativo. El fondo de `body` sepultaba sus propios `::before` y `::after`. El
arreglo es poner el color en `html.ligero-activo` y dejar `body` sin fondo. Se
descubrió leyendo el color de un píxel y viendo salir el negro plano en vez del
tono que tocaba: mirar la captura no bastaba, porque un fondo que falta se
parece muchísimo a un fondo sobrio.

Tres detalles que costaron una corrección cada uno:

- **Las fichas de proyecto llevan el filete en `box-shadow`, no en el fondo de
  la lista.** Con el fondo en la lista, la última fila —nueve fichas en dos
  columnas— dejaba la celda sobrante pintada de gris macizo, que parece un
  error de carga.
- **La medida se le pone al párrafo, no al bloque.** Un `max-width: 30ch` en el
  bloque de la portada partía el nombre en dos líneas y apilaba los botones.
- **Los canales de contacto pierden su relleno aquí.** En el panel ese fondo
  los despega del vidrio oscuro; sobre la página se lee como una losa gris en
  medio de una composición que en todo lo demás se sostiene con filetes.

La cronología es el único componente que **no** se reutiliza del panel. El del
panel apila periodo, puesto y detalle en vertical porque vive en 380 px; aquí
hay el doble de ancho, y apilar algo que se lee como una tabla desaprovecha el
sitio y obliga al ojo a bajar buscando la fecha de cada entrada. Reutilizar por
reutilizar habría salido peor que escribir doce líneas.

La barra de avance de lectura, en el filo de la cabecera, no lleva ni una línea
de JavaScript: se anima contra el desplazamiento del documento con
`animation-timeline: scroll()`. Donde el navegador no la conozca, no se dibuja
— que es la degradación que se quiere para un adorno.

### Un clic, no dos

Pulsar *Ver en 3D* entra en la escena directamente: no se pasa por la portada
con el botón *Explorar*. Quien pulsó ya decidió, y volver a preguntárselo es
cobrarle dos clics por lo mismo.

Pero abrir un enlace `?modo=3d` que te han pasado **sí** enseña la portada. No
es una incoherencia: lo que hay que distinguir no es a qué dirección se llega,
sino de dónde se viene. Al que recibe el enlace la portada le sirve de
presentación y de aviso de que aquí se carga un mundo. Por eso la intención va
en `sessionStorage` y no en la URL —en la URL los dos casos serían el mismo— y
se **consume al leerla**, para que un F5 vuelva a la portada.

El precio de entrar solo es que no hay gesto del que colgar el bloqueo del
puntero: la recarga se comió la activación, y pedirlo ahí no falla en silencio
sino que el navegador escribe el rechazo en la consola. Así que `enter()`
recibe `{ gesto }` y, sin él, no lo pide y cambia el mensaje a *«Pulsa para
mirar alrededor»*. El primer clic en la escena lo recupera, que es la red que
`CameraRig` ya tenía puesta para cuando el bloqueo se pierde solo.

---

## Cómo se recorre

| Acción                | Resultado                                      |
| --------------------- | ---------------------------------------------- |
| Arrastrar             | Girar alrededor del punto de interés           |
| Rueda / pellizco      | Acercar y alejar                               |
| Mayús + arrastrar     | Desplazar el punto de interés                  |
| Clic en un monumento  | Abrir su ficha                                 |
| `1` … `5`             | Volar a una sección                            |
| `C`                   | Caminar (`W A S D`, `Mayús` para correr)       |
| `F`                   | Vuelo libre (`W A S D`, `Espacio`, `Ctrl`)     |
| `H` o `?`             | Ayuda                                          |
| `Esc`                 | Cerrar / volver al mirador                     |

Con `prefers-reduced-motion` activado, los vuelos de cámara se sustituyen por
saltos instantáneos. `?instant` en la URL hace lo mismo y desactiva el ajuste
automático de calidad; lo usa la herramienta de capturas.

### A pie

Al pulsar *Explorar*, el vuelo de presentación no acaba en el mirador: desciende
y **deja al visitante de pie en el centro del corro de trilitos**, mirando tierra
adentro. Ese encuadre está elegido: desde ahí se está dentro del círculo y a la
vez se ve el escarpe, Trayectoria y la escalinata al fondo.

`walk` no es el vuelo libre con la altura bloqueada. Tiene altura de ojos, cuerpo
que choca contra la piedra, vaivén de cabeza y —lo que de verdad cambia el
sitio— **límite de pendiente**: por una ladera de más del 62 % no se sube. El
escarpe entre la plaza y Habilidades ronda el 90 %, así que **la escalinata deja
de ser bonita y pasa a ser necesaria**. La isla tiene rutas.

#### Cuatro cosas que estaban mal y no lo decía nada

Todo lo anterior funcionaba —se llegaba a Habilidades por la escalinata y no
por el talud— mientras andar se sentía raro. Las pruebas comprobaban **que se
puede ir**, no **cómo se va**, así que ninguna se enteraba. Medido:

|                            | antes            | ahora            |
| -------------------------- | ---------------- | ---------------- |
| Andando                    | 5,18 m/s         | 3,26 m/s         |
| Corriendo                  | 10,35 m/s        | 5,70 m/s         |
| Retraso de la cámara al suelo | hasta 2,15 m  | 0,26 m           |
| Caer un metro              | 0,52 s posándose | 0,30 s cayendo   |
| Vaivén de cabeza           | 1,51 Hz          | 3,09 Hz          |

- **La velocidad.** 5,18 m/s son 18,7 km/h: andar era ya correr, y correr
  —37 km/h— era más rápido que un plusmarquista. Con la isla midiendo 336 m de
  lado a lado se cruzaba en medio minuto, y de ahí venía la sensación de
  patinar.
- **Subir y bajar eran la misma amortiguación exponencial**, y eso da dos
  defectos a la vez. Subiendo, la cámara se quedaba **hasta 2,15 m por debajo
  del suelo** cuando el terreno pegaba un salto —al pisar la escalinata, al
  entrar en un enlosado— y se veía nadar. Bajando, una exponencial no cae: se
  posa, cada vez más despacio, como un ascensor. Ahora subir se suaviza deprisa
  con tope al retraso, y bajar es gravedad (22 m/s², más viva que la real: con
  9,8 los saltitos de la cantería se sienten lunares).
- **El vaivén iba por tiempo y no por metros andados**, así que a 5,18 m/s daba
  una zancada de tres metros y medio. Contando por distancia —un ciclo cada
  1,1 m— es un paso de persona vaya uno rápido o despacio.
- **El balanceo lateral es alabeo de la vista, no desplazamiento.** El vertical
  solo bota; es el lateral, uno por zancada y no uno por pie, el que se lee
  como andar. Pero desplazando la cámara de lado la posición se arrastra al
  fotograma siguiente y cada bandazo se suma al anterior: se andaba en espiral
  sin tocar `A` ni `D`. Un alabeo se ve igual y no toca dónde se está.

Y el vaivén se **descuenta antes de mirar el suelo** y se vuelve a poner
después. Si no, se realimenta: la altura se amortigua hacia el suelo partiendo
de una posición que ya lleva el vaivén dentro, y ni el seguimiento del terreno
ni el vaivén miden lo que dicen medir. Es también lo que permite que
`walk-check.mjs` mida el retraso real de la cámara.

Tres cosas que costaron encontrar porque **ninguna falla de forma visible**:

1. **El límite de pendiente no llegaba a ejecutarse.** La primera regla era «si
   lo que sube cabe en un escalón, se pasa; si no, que decida la pendiente», con
   una tolerancia de 55 cm. Andando a 5,4 m/s con pasos de 50 ms se avanzan
   27 cm por fotograma, así que por una ladera del 90 % **se suben 24 cm por
   paso** — siempre por debajo de la tolerancia. El permiso se concedía siempre y
   el escarpe se escalaba sin despeinarse. Un límite que no se alcanza no es un
   límite. La regla buena es *donde hay obra manda la obra, donde solo hay tierra
   manda la pendiente*, y la obra se pregunta por su **declaración**
   (`field.enFabrica`), no comparando `walkHeight` con `height` — al pie de la
   escalinata no hay nada que excavar y las dos alturas coinciden.
2. **`walkHeight` cogía el tramo más alto en vez del más cercano.** Una pasarela
   es una cadena de tramos de un metro dentro de un corredor de 2,3 m a cada
   lado, así que un punto cae dentro de cinco tramos a la vez; con `max` ganaba
   el que empezaba dos metros más adelante. El suelo de la escalinata iba un
   metro por encima de donde tocaba y daba saltos de 64 cm, que el modo a pie
   leía —correctamente— como un muro.
3. **Las cajas de colisión salían en coordenadas locales.** `Box3.setFromObject`
   usa la matriz de mundo y esa solo se recalcula al dibujar; construyendo los
   colisionadores antes del primer fotograma, una piedra de la plaza daba
   y ∈ [0, 3] en vez de [44,9, 47,9]. No revienta nada: simplemente se atraviesa
   la isla entera.

Y una consecuencia bonita: **la pasarela de colisión es el perfil liso, no la
altura del peldaño**. Es la rampa que va debajo de una escalera dibujada, como en
cualquier juego — los escalones son lo que se ve, la rampa es por donde se anda.
Usando la cota del peldaño, el suelo daba saltos de tres contrahuellas de golpe.

Herramienta: `node tools/walk-check.mjs` recorre la isla a pie de verdad
—avanzando el rig a mano para no depender de los fps— y comprueba lo único que
importa de todo esto: que a Habilidades se suba por la escalinata (+21,0 m) y no
por el talud (se queda a 45 m).

---

## Colocar cosas a mano: el editor

```bash
npm run dev
# y abrir http://127.0.0.1:5173/?editor
```

Sale un panel a la derecha con las **228 piezas** editables y las **11 familias
de material**. Se pulsa una piedra en la escena —o se busca por nombre—, se
mueve con el gizmo o con las casillas numéricas, se pulsa **Guardar** y el
cambio queda escrito en `src/editor/escena.json`. Al recargar sigue ahí, y viaja
a la web publicada como cualquier otro fichero del proyecto.

| Tecla                | Acción                                    |
| -------------------- | ----------------------------------------- |
| `G` / `R` / `E`      | Mover / rotar / tamaño                    |
| `X`                  | Alternar espacio local y de mundo          |
| `P`                  | Posar la pieza sobre el terreno            |
| `Ctrl`+`Z`           | Deshacer                                  |
| `Ctrl`+`S`           | Guardar                                   |
| `Esc`                | Soltar la selección                        |

**Solo existe en desarrollo.** Guardar necesita el servidor de Vite escuchando,
así que el editor se carga con un `import()` dinámico envuelto en
`import.meta.env.DEV`: en la build la condición se pliega a falso y el editor
entero —panel, hoja de estilos y `TransformControls`— desaparece del bundle. Lo
que sí viaja a producción es el JSON con las anulaciones y las imágenes de
`public/texturas/`, que son ficheros normales.

### Qué es «una pieza» y por qué esa regla

Este mundo no está colocado, está **calculado**: son 1262 nodos, de los cuales
1113 son mallas y 48 son instanciados. No hay una lista de piezas con su
transformación esperando a que alguien la edite, así que lo primero no es el
gizmo sino decidir qué se puede tocar.

La regla es una sola: **una pieza es un nodo con `.name`**, fuera de las
familias excluidas y que no sea un `InstancedMesh`. Funciona porque el proyecto
ya nombra lo que tiene identidad —`trilithon`, `mojon-2`,
`escalinata-jamba-0-mar`— y deja sin nombre el relleno generado. En el Camino
del Viajero eso separa los cinco mojones de las 490 losas del sendero, que son
una cinta y no cinco mojones más.

Y deja una palanca clara: **si quieres que algo sea editable, ponle nombre.**

Lo excluido no lo está por poco importante sino porque la pieza individual no
significa nada: la hierba son 110.000 briznas en un atributo, el pedregal y el
arbolado son instanciados, y el terreno y las líneas ley se recalculan del campo
de alturas. Mover una brizna no es una edición, es un error.

### Identificadores que sobreviven

`contenedor/nombre#n`, y el `#n` solo aparece cuando hay hermanos homónimos. La
plaza tiene siete `trilithon` y quince `stone`, así que el índice hace falta;
pero contar **solo entre los del mismo nombre** significa que añadir un canto
nuevo no renumera los trilitos.

Aun así un identificador puede derivar si se reordena la construcción, y por eso
cada anulación guarda también la posición con la que la pieza **nació**. Al
cargar se comparan: si no coinciden, se avisa por consola en vez de mover la
pieza equivocada en silencio.

### Materiales: se editan por familia

Tocar «roca» cambia las doscientas piedras de la isla a la vez, y eso es lo que
se quiere — son la misma piedra. Cada entrada del registro es una **lista**, no
un material suelto, y tiene que serlo: `rockMaterial` devuelve siempre el mismo
objeto, pero el estrado fabrica uno por peldaño y por santuario, así que
«estrado-peldano» son veinticuatro objetos distintos que se dibujan igual.
Guardando solo el último, cambiar el color afectaría a un peldaño de un estrado
y parecería que el editor no funciona.

Una textura de fichero sustituye el mapa procedural pero **no el resto del
material**: el sombreado cel, la rugosidad y la proyección triplanar de la roca
siguen siendo los mismos, así que una foto de granito entra en el estilo en vez
de pelearse con él. El mapa original se guarda, y «volver a la textura generada»
lo restaura.

> Con esto el proyecto deja de ser estrictamente «cero ficheros de asset», y la
> escena ya no se reproduce solo con la semilla: hace falta semilla **más**
> `escena.json` más lo que haya en `public/texturas/`. Es una decisión
> consciente, no un descuido.

---

## Cómo está montado

```
src/
├── config.js            Paleta, escala del mundo y posición de los santuarios
├── content.js           ← el fichero que editas
├── core/
│   ├── Experience.js    Bucle principal, arranque por etapas, calidad adaptativa
│   └── PostFX.js        Bloom → tonemap → revelado → SMAA
├── world/
│   ├── Terrain.js       Campo de alturas (la fuente de verdad) + malla
│   ├── Ocean.js         Olas, bajío turquesa y red de cáusticas de Worley
│   ├── Sky.js           Cúpula con degradado, sol y dos capas de nubes
│   ├── Grass.js         110.000 briznas instanciadas con viento, flores y LOD
│   ├── Forest.js        Dónde crece cada planta y montaje instanciado
│   └── World.js         Montaje: explanadas → terreno → santuarios → luces
├── models/
│   ├── Carving.js       Relieve tallado: marco, medallón y ogham en hueco
│   └── …                Piedra procedural y vegetación (6 especies)
├── sections/            Un módulo por santuario, todos sobre `Shrine`
├── vfx/
│   ├── toon.js          Sombreado cel: rampas medidas, sombras de nube
│   └── …                Glifos, faros, líneas ley, láminas, fuego, partículas
├── nav/                 Cámara (órbita + viaje + vuelo libre) e interacción
├── ui/                  Capa HTML: carga, navegación, panel, ayuda
└── utils/               Ruido, texturas de canvas, ogham, futhark, carteles
```

Tres decisiones que explican el resto:

1. **El campo de alturas manda.** `TerrainField` es la única fuente de verdad de
   la altura del mundo. La usan la malla, la colocación de piedras y hierba, y
   la cámara para no atravesar el suelo. Las explanadas bajo los santuarios se
   reservan *antes* de teselar; si se hiciera al revés, los estrados flotarían.

2. **Todo es procedural y determinista.** La misma semilla produce el mismo
   promontorio, las mismas piedras y las mismas texturas. Nada de assets que
   descargar ni de resultados que cambien entre recargas.

3. **La escena y la interfaz no se mezclan.** La escena es piedra y luz; la
   interfaz es vidrio oscuro y línea fina. `Overlay.js` no importa nada de
   three.js: se comunica con la experiencia solo por devoluciones de llamada.

4. **La luz no se integra: se mide y se pinta.** Todo lo que se ve en el paisaje
   pasa por `vfx/toon.js`. Está explicado abajo.

---

## El estilo: fondo pintado, no render

El sombreado no es PBR. Las superficies del paisaje — terreno, roca, enlosado,
corteza, follaje, hierba — usan **cel shading**, y las rampas de color no están
elegidas a ojo: salen de medir dos ficheros `.blend` de referencia de estilo
anime, cuyos materiales comparten siempre el mismo esqueleto:

```
Diffuse BSDF  →  Shader to RGB  →  ColorRamp  →  color
```

Es decir, la luz se usa como *índice* de una rampa de colores pintados a mano.
De ahí salen las tres reglas del estilo, y las tres están en `vfx/toon.js`:

1. **El corte es duro.** En el material del suelo de la referencia las dos
   paradas de la rampa están en la misma posición (0.455): un escalón perfecto.
2. **La sombra cambia de tono, no solo de brillo.** Medido en el follaje, la
   banda oscura es `#17303d` contra un verde iluminado `#539e43`. Ese salto al
   azul verdoso es lo que hace que se lea como pintura y no como render.
3. **Entre los cortes hay mesetas planas.** La rampa del follaje repite el mismo
   color entre 0.045 y 0.426, y otra vez entre 0.498 y 0.894.

Colores medidos, ya convertidos a sRGB:

| Superficie | Sombra | Medio | Luz |
| --- | --- | --- | --- |
| Follaje | `#17303d` | `#357d44` / `#539e43` | `#9fcb68` |
| Hierba | `#00344b` | base `#007059` | punta `#8ac200` |
| Corteza | `#312e2b` | `#4d463a` | `#6b604a` |

Tres consecuencias prácticas:

- **`applyToonShading` no sustituye `MeshStandardMaterial`, lo secuestra.** Se
  conservan mapa de normales y sombras proyectadas; se reemplaza la ecuación de
  luz entera en `lights_fragment_end`. La máscara de sombra hay que inyectarla a
  mano (`shadowmask_pars_fragment`), porque el material físico no la incluye:
  solo aplica la sombra dentro del bucle de luces, donde ya no se puede tocar.
- **El mapeado de tonos es lineal, no ACES.** ACES es una curva en S que
  comprime las luces y desatura al subir de nivel — o sea, deshace las bandas
  planas. El fichero de referencia trabaja con la vista «Standard» de Blender
  por el mismo motivo.
- **La punta de la hierba se apartó del valor medido.** En la referencia brizna
  y terreno son el mismo material, así que `#8ac200` casa con lo que hay debajo.
  Aquí el suelo es una textura de prado que iluminada da `#4da63d`: contra ese
  fondo, el amarillo medido tiene casi el doble de rojo y cada brizna se leía
  como una espiga de paja. Medir da el punto de partida, no la última palabra.

Encima de eso van las **sombras de nube**: manchas grandes que cruzan el
paisaje, muestreadas del mismo mapa que dibuja la cúpula del cielo, de modo que
lo que pasa por el suelo se corresponde con lo que hay arriba. Terreno y hierba
lo leen con los mismos uniforms compartidos — si solo lo llevara uno de los dos,
el prado se partiría en dos capas en cuanto pasara una nube.

### Piedra labrada

Un monolito celta no es un bloque con un dibujo encima: es un bloque
**trabajado**. Tiene una cara desbastada plana, un marco en resalte, un
medallón con el motivo en hueco y la inscripción debajo; el canto y la
coronación se quedan en bruto. Ese contraste entre lo labrado y lo encontrado
es lo que hace que parezca tallado por alguien.

`createStone` acepta `dressedFace` para aplanar el frente a cincel, y
`models/Carving.js` pone encima un paño cuyo mapa de alturas, pintado en
canvas, hace cuatro trabajos: desplaza la malla (el marco recorta de verdad
contra el cielo), da el mapa de normales, da el recorte alfa en arco, y hornea
la cavidad en el albedo. Lo último no es opcional: **con sombreado cel un surco
de tres milímetros no genera sombra propia ninguna**, así que el grabado
desaparecía en cuanto la piedra recibía luz de frente. Oscureciendo el fondo del
surco en el color, el dibujo se lee siempre.

El panel publica en `userData.anchors` dónde ha caído cada grabado, y el glifo
luminoso se coloca desde ahí. Con dos sitios calculando la misma posición, basta
tocar un margen para que el resplandor se despegue del hueco y se lea como una
calcomanía flotando delante de la piedra.

### Por qué hay dos primitivas de piedra

`createStone` parte de una **caja subdividida** y `createBoulder` de un
**icosaedro**, y no es un accidente histórico: son dos clases de piedra
distintas. Un ortostato es piedra de cantera, arrancada y partida a cuña, y lo
que hay que preservar son sus caras planas y sus cantos. Un canto rodado es
piedra transportada, sin caras que preservar, y la esfera subdividida da la
malla más barata para una silueta redonda.

Antes las dos salían del icosaedro, y ahí estaba el fallo. **El icosaedro
reparte sus vértices uniformes por ángulo sólido, y la proyección a caja los
reparte por superficie** — que no es lo mismo en cuanto la pieza deja de ser
cúbica. En un dintel de 10,8 × 1,25 × 1,84 las dos caras de los extremos ocupan
menos del 1 % del ángulo sólido, así que de 642 vértices les caían tres: sin
vértices no hay cara, y el dintel remataba en pico por los dos lados. En un
menhir de 3,2 × 10,2 le pasaba lo mismo a la coronación. Parecían dos defectos
—«dinteles con forma de lenteja» y «menhires con forma de colmillo»— y eran el
mismo fallo visto en los dos ejes.

Dos cosas que conviene no volver a tocar sin mirarse:

1. **La celda de la malla se mide en metros, igual para toda la isla.** Es la
   mitad de por qué las piezas pegan entre sí: un dintel de once metros y el pie
   de tres que lo sostiene reciben el mismo grano y el mismo tamaño de paño.
   Referirla al eje largo de cada pieza parece lo mismo y no lo es — con eso una
   pata de dolmen de 3,4 m salía con celda de 11 cm y 3.800 triángulos, más malla
   que el menhir de diez metros de al lado.

2. **La rampa del escalón se calcula, no se pide** (`minRamp`). Los paños de
   fractura salen de escalonar el ruido, y un escalón cuya transición cabe dentro
   de un solo cuadrilátero no sale como arista: sale como una esquirla brillante,
   porque de los cuatro vértices del cuadro solo se mueve uno y el triángulo que
   lo toca queda casi de canto. Subir la dureza buscando definición llena la cara
   de astillas. Los dos números que lo provocan viven lejos —la dureza se toca en
   el material y la resolución sale del tamaño de la piedra—, así que la rampa se
   deriva del tamaño de celda y se ablanda sola cuando la malla es basta.

De ahí sale también el reparto de trabajo: **la geometría solo sostiene los
planos grandes**, los que cambian la silueta y parten la luz; el grano fino de
cincel no cabe en la malla y lo pone la textura. Subir la frecuencia del relieve
buscando detalle no da detalle, da esquirlas.

### El pasadizo bajo el cerro

`models/Souterrain.js` abre una galería excavada que se puede recorrer en vuelo
libre. Tiene tres piezas que conviene entender antes de tocarla:

1. **Un campo de alturas no admite agujeros.** Para cada (x, z) hay una sola
   altura, así que una puerta abierta en una ladera es imposible tal cual: el
   terreno pasaría por delante del vano. Por eso cada boca vive al fondo de un
   desmonte de paredes casi verticales (`field.addCut`), y la portada se planta
   donde el corte se apaga — la cola del desvanecimiento es justo la pared de
   roca en la que se abre la puerta.
2. **La cámara topa contra la superficie.** El rig se apoya en `field.height`
   para no colarse bajo tierra, lo que deja cualquier galería inaccesible por
   construcción. Lo resuelve `field.walkHeight`, que devuelve el suelo del
   pasadizo cuando el punto cae dentro de su volumen y el del cerro cuando se
   pasa por encima.
3. **El cerro se pone a mano** (`field.addMound`). El ruido de este promontorio
   hace lomas anchas y tendidas: barriendo la isla entera, con la condición de
   que hubiera roca de sobra sobre el techo y que las dos bocas salieran a
   terreno continuo, aparecieron cuatro sitios y el mejor daba 3,3 m de
   cobertura.

Los cerros se aplican **antes** que las explanadas, no después: las explanadas
existen para que los santuarios se asienten a nivel, así que tienen que ser lo
último que manda sobre su huella.

Lo que costó tiempo fue el emplazamiento, y merece quedar escrito: **un cerro
postizo no arregla una ladera, solo suma su bulto al desnivel que ya había.** El
primer sitio se eligió por ser «la campa más llana cerca de Habilidades», medida
como desnivel máximo en un disco de 26 m — que allí daba 13,5 m. Con esa
tolerancia el cerro cayó en plena pendiente: el terreno subía por un lado y
bajaba ocho metros por el otro, el tramo con cobertura se alargó 41 m cuesta
arriba y la boca de ese lado acabó asomando a un cortado. El criterio que sí
funciona es exigir que el terreno **natural** a veinte metros del centro sea el
mismo a un lado y al otro; en toda la meseta solo hay tres sitios que lo cumplan.

Por lo mismo, ni las portadas ni las bocas se fijan a mano: `souterrainPlan`
recorre el eje sobre el terreno ya con el cerro puesto y decide dónde hay
cobertura y dónde se sale al prado sin escalón.

### La escalinata a Habilidades

Entre la plaza y Habilidades hay **20,8 m de desnivel en 23 m de terreno**: el
90 %, o sea 42°. Eso no es una escalera, es una escala de mano. La pendiente no
se negocia con el terreno —el escarpe es lo que es— así que lo único que queda es
alargar el RECORRIDO, y por eso la escalinata no va derecha: sale de la plaza
abriéndose hacia el mar, cruza el talud en diagonal, hace rellano en el banco de
media ladera y vuelve a cerrar sobre el eje para entrar de frente. **39,5 m de
recorrido para los mismos 20,7 de subida: 52 %, 28°.** La panza del trazado es lo
único puesto a mano, y es exactamente lo que se está comprando.

Cuatro decisiones que no son de gusto:

1. **El perfil sale del terreno, y se construye FACTIBLE de una pasada.** Una
   rampa de pendiente constante se entierra tres metros en unos sitios y vuela
   tres en otros. Lo que se busca es el perfil monótono más pegado al suelo que
   respete un tope de pendiente, y se construye acotándolo entre dos rectas: la
   más alta a la que se puede haber llegado subiendo desde el pie, y la más baja
   desde la que todavía se alcanza la cima. El primer intento alternaba una
   pasada hacia delante y otra hacia atrás esperando que convergieran: **no lo
   hacen** —son filtros secuenciales, no proyecciones sobre convexos— y el fallo
   no sale como un perfil torcido sino como **diez escalones amontonados en el
   mismo punto**, porque la última muestra está clavada en la cota de la cima y
   todo lo que le falte al perfil se paga de golpe ahí.
2. **Contrahuella constante, huella variable.** Es al revés de como se dibuja un
   tramo de escalera en un plano, y es lo correcto para una escalinata que sigue
   el suelo: lo que cansa es que cambie la altura del escalón. Los escalones caen
   donde el perfil cruza cada múltiplo de la contrahuella, así que en lo empinado
   salen juntos y en lo tendido se separan **hasta convertirse en rellano solos**.
   El rellano de media ladera no está puesto a mano: aparece porque ahí el
   terreno se aplana.
3. **La contrahuella decide también la huella.** Con la pendiente fijada por el
   trazado, las dos son proporcionales: a 30 cm salían 69 escalones de 45 cm de
   fondo y de cerca se leía como un muro de bloques. A 36 cm son 57 peldaños de
   69 cm — zancada larga, la de una obra ceremonial.
4. **Solo se excava donde hay ladera por encima**, y se comprueba en el eje y en
   los DOS bordes. Rebajando por sistema, los tramos sobre terraplén salían con
   una cubeta de medio metro alrededor: una calva de tierra pelada justo en el
   pie, contra la losa de la plaza. Y midiendo solo el eje se escapa el caso que
   importa, porque una escalinata que cruza el talud en diagonal tiene el borde
   de arriba metro y medio por encima del centro.

Dos trampas de las que cuesta salir porque **no fallan como lo que son**:

- **Las UV de la contrahuella van por la SUPERFICIE, no por el trazado.** Una
  contrahuella avanza cuatro centímetros y medio en planta y sube treinta y seis:
  mapeada con la coordenada del trazado le toca el 2 % de una losa estirado sobre
  el canto entero. De cerca son vetas verticales —el mismo defecto que tenían los
  peldaños del estrado— pero con 57 seguidas, de lejos se lee como **un galón
  negro dentado sobre cada peldaño**. Parece un problema de sombras propias o de
  normales, y se pierden varias iteraciones ahí.
- **El sentido de giro de los muretes se deduce, no se escribe.** El muro va en
  dos sentidos, y con el giro a mano el del lado del mar salía con las normales
  del revés: invisible, porque el material no dibuja caras traseras, mientras el
  otro se veía perfectamente. Ahora se cose una cara, se mide su normal y se
  invierte si no apunta a donde debe.

**La entrega en los estrados es una escalinata en miniatura.** Un estrado de este
mundo es una plataforma REHUNDIDA: sus peldaños concéntricos bajan hacia fuera,
así que la losa acaba metro y pico por DEBAJO del prado y el muro de contención
cierra ese salto. Sin tramo de entrega, la escalinata llega al borde del círculo
pero no al círculo. `createSteps` —escrito en `Dais.js` desde el principio,
documentado como «peldaños de aproximación» y sin usar en ninguna parte— hace
losas SUELTAS: las cotas salen exactas y aun así son cuatro piedras flotando
sobre la hierba. Lo que funciona es sintetizar un **plan** recto de cuatro
peldaños y pasárselo a las mismas funciones que construyen el cuerpo: mismos
escalones, mismos muretes, misma piedra.

`stairwayWalkways` es la contraria de `addTunnel`: una galería dice «aquí el
suelo está más BAJO de lo que parece» y una pasarela dice «más ALTO». Hace falta
porque la escalinata es fábrica, no terreno, y en los tramos sobre terraplén la
cámara subiría por dentro del muro.

Herramientas: `node tools/stairway-check.mjs` mide recorrido, contrahuella,
reparto de huellas, desmonte, terraplén, si el terreno atraviesa algún peldaño y
si se anda por encima de ellos. `node tools/stairway-sweep.mjs` barre tope de
pendiente × panza — sirve para ver que las dos cosas **no son independientes**:
el rellano se come recorrido a pendiente cero y lo que queda tiene que subir más
que la media, así que un tope demasiado bajo es sencillamente infactible.

### Nada de madera: el mapeado de los peldaños

Los peldaños del estrado eran cilindros CERRADOS, y una tapa de
`CylinderGeometry` viene con las UV **en abanico**: la textura sale del centro y
se abre como los radios de una rueda, así que la losa se estira en cuñas cada vez
más anchas. Sobre un estrado de veinticinco metros eso se lee exactamente como un
entarimado de duelas — y no hay retoque de la textura que lo arregle, porque el
problema es el mapeado.

Las contrahuellas tenían la otra mitad del mismo defecto: `repeat.set(n, 1.2)`
pintaba **una losa entera estirada a lo alto** de los 55 cm del canto, o sea una
banda de vetas horizontales. Ahora las repeticiones salen del tamaño real en las
dos direcciones, a 2,4 m por baldosa.

La huella la construye `daisTreadGeometry` con las mismas UV radiales que el
disco superior, así que la hilada del peldaño continúa el trazado del enlosado en
vez de inventarse otro.

El canto del peldaño más bajo va **mellado**, que es lo que dice «ruina»: no la
suciedad, sino que al monumento le falten piezas. Con una salvedad que costó un
intento: el bocado se come un VUELO que sobra, nunca la huella misma. Mordiendo
hacia dentro desde el radio de la contrahuella, la huella se separaba de ella y
por el hueco se veía el interior del cilindro y el prado — medias lunas de hierba
entre anillo y anillo.

### Todo lo que se apoya en el suelo pregunta por `meshHeight`

`height()` es la altura analítica; `meshHeight()` es la de la superficie que se
DIBUJA. En una loma la interpolación de la rejilla queda por debajo de la
analítica, y con cuadros de 1,35 m la diferencia llega a varios decímetros.

Esto ya estaba escrito para las cintas de camino, y estaba aplicado solo a ellas.
El pedregal, el bordillo y el arbolado seguían apoyándose en la analítica, así
que en cuanto el suelo se curvaba se quedaban flotando — y al lado de un camino,
que además va levantado nueve centímetros, se ve a la legua.

La comprobación es barata y conviene repetirla: recorrer las instancias, restar
`meshHeight` de la base de cada matriz y quedarse con el máximo. Tiene que dar 0.
Al hacerla, **excluir lo que está sobre el enlosado**: una pieza en pie sobre el
estrado queda legítimamente por encima del terreno, y contarla llena el informe
de falsos positivos. Lo mismo con las piedras apiladas de un túmulo y con la
cubierta del pasadizo, que por definición van por encima de lo que hay debajo.

Dentro de un santuario hay una trampa añadida: **la Y local es la del ANCLA**.
Mientras la pieza esté sobre el estrado eso es correcto —el estrado es plano—,
pero en cuanto algo sale al prado el terreno se separa de ese plano y una Y fija
deja la pieza flotando tanto más cuanto más lejos esté. Pasó al sacar los cantos
sueltos fuera del enlosado: hasta un metro de aire. Por eso existe
`Shrine.settle(objeto, lx, lz, { sink, align })`, que posa sobre el terreno y de
paso tumba la pieza con la ladera. Todo lo que vaya al prado tiene que usarlo.

**Y por eso no hay motor de físicas.** Es la solución que parece obvia —«que
caigan solas»— y no lo es: lo que falla no es la colocación sino a qué función de
altura se le pregunta. Un motor añadiría cientos de kilobytes a una escena cuyo
argumento es que no descarga ni un asset, una simulación de arranque, y
resultados que dejan de ser deterministas desde la semilla. Una caída vertical
sobre un campo de alturas ES una consulta a ese campo; el ángulo de reposo lo da
`field.normal`. Las dos cosas juntas son `settle`, salen exactas y cuestan cero
en tiempo de ejecución.

### Los estrados en ladera: el muro de contención

Un estrado es una plataforma RÍGIDA y el prado no lo es. Mientras el terreno de
alrededor esté a nivel da igual, pero Trayectoria y Habilidades están al borde
del escarpe y sus peldaños exteriores colgaban hasta **2,4 m en el aire** por el
lado de abajo.

Lo primero que se intenta es aplanar más terreno, y **no se puede**. Trayectoria
está a 48 m de la plaza y **17 m por encima**: para que las dos plataformas
queden llanas harían falta 51 m de radio llano sumados. No caben. Y con
degradados anchos se pisaban además entre ellas — la explanada de Trayectoria
levantaba **siete metros** el centro de la plaza, y la de la plaza hundía dos y
medio la de Habilidades.

Merece la pena entender por qué ninguna aritmética lo salva:

- **Encadenar `lerp` uno detrás de otro hace ganar al último** que se procesa, no
  al que manda. Es un orden arbitrario decidiendo la altura del suelo.
- **Promediar con pesos tampoco**: una vecina con peso 0,47 basta para levantar
  siete metros el centro de una plataforma que debería estar plana.
- **Subir el exponente** hasta que el disco llano aguante hace que la influencia
  se desvanezca en un metro, y entonces aparece un cortado alrededor de cada
  santuario.
- **Elegir la explanada dominante** (argmax) da un salto vertical de dieciséis
  metros donde se cruzan los pesos.

La respuesta no es de mezcla, es de construcción, y lleva usándose desde que se
edifica en ladera: un **muro de contención** (`daisSkirtGeometry`) que baja del
canto de la plataforma hasta encontrar el suelo, alto por el lado de abajo y
enterrado por el de arriba. El borde inferior se muestrea ángulo a ángulo, así
que cierra exactamente contra el terreno. Y ya que el muro resuelve el desnivel,
las explanadas pueden ser **justas y de degradado corto** (`PAD_BLEND`), que es
lo que impide que se pisen: el terreno entre la plaza y Trayectoria vuelve a ser
lo que es, un escarpe.

`Shrine` le pasa al estrado su `groundAt`, que es lo único que sabe el santuario
y no sabe el estrado.

### Caminos que no trepan

Las rutas se dibujan **en planta** —una Bézier o un arco en polares— y la altura
del terreno se les pega después. En una meseta llana da igual; aquí no, porque
hay un escarpe de unos veinte metros entre la meseta baja (la plaza, a 44) y la
alta (Trayectoria a 61, Habilidades a 66). Tres ramales lo subían de frente, uno
al 192 % — sesenta grados de cuesta con adoquín encima.

`routeClimb` los mide y `World._traceRoutes` descarta el que pase de ocho metros
por encima del 25 %.

También descarta los que dejan menos de **diez metros a la vista**, y la medida
correcta es esa y no el largo total. Los radios salen cortos porque los estrados
están pegados al círculo central, así que buena parte de un ramal va por debajo
de las plataformas. Con dos afinados que costaron un intento cada uno:

- **El empedrado tiene que meterse bajo la piedra** (`TUCK`). Antes moría 1,5 m
  antes del radio nominal, y como la piedra del estrado acaba 1,6 m antes de ese
  radio, el camino no llegaba a tocar nada por ninguno de sus dos extremos:
  quedaba un retal flotando en el prado con un palmo de hierba a cada lado.
- **Lo que tapa es el radio de la PIEDRA, no el nominal.** Midiendo la parte
  visible contra el radio nominal, los dos metros que van bajo la losa contaban
  como visibles y un arco de once metros pasaba el corte — y seguía leyéndose
  como un gancho suelto, porque el estrado sobresale del prado y el adoquín
  desaparece detrás de su canto en vez de verse llegar.

Con el corte bien puesto quedan dos ramales: el arco largo Sobre mí→Proyectos y
el enlace plaza→Proyectos. La isla se recorre por ellos, por la escalinata del
Camino del Viajero, por el pasadizo y por la escalinata a Habilidades — que es
justamente el caso que ningún camino podía resolver: el 90 % de cuesta que hay
entre la plaza y Habilidades no se empiedra, se escalona.

Se intentó antes salvar el ramal descartado moviendo la panza del arco, que es
el único grado de libertad de la ruta, y **no sirve**: barriendo la panza de
−0,30 a +0,55 el mejor caso seguía dando 22 m de cuesta al 100 %. El escarpe es
un murallón continuo entre las dos mesetas, no un bulto que se pueda rodear.

Herramienta: `node tools/terrain-map.mjs` saca el perfil de cada ramal —largo,
subida, pendiente máxima y metros en cuesta— y un mapa con sombreado de relieve
donde los tramos empinados salen en rojo sobre el trazado.

### Nada de corros alrededor del estrado

Había DOS sistemas distintos plantando piedra alrededor de cada monumento, y los
dos están retirados. Merece la pena contarlo junto porque es el mismo error
cometido dos veces, y la primera vez se «arregló» sin tocarlo.

**El cerco de cantos** (uno por sección: `About` 9, `Skills` 10, `Contact` 11,
`Projects` 14). La primera versión los dejaba DENTRO del enlosado —a cinco metros
del centro en el altar, con la piedra llegando a los dieciocho—, o sea tirados en
mitad de una plaza barrida: eso no dice ruina, dice descuido. Se sacaron al
prado, por fuera del canto de la plataforma.

**La guardia de estelas** (`createDais`, hasta ~48 piezas por estrado). Empezó
siendo cantos rodados y se cambió a estelas hincadas por un error de lenguaje: un
canto rodado es piedra que ha traído el agua, lo que menos pinta alrededor de un
monumento levantado a propósito.

Las dos correcciones son ciertas y ninguna toca el defecto de fondo, que no es el
sitio ni el material sino la DISPOSICIÓN: **repartir N piezas por ángulo a radio
casi constante no es dispersión, es un anillo** — se hagan de lo que se hagan y
se pongan donde se pongan. Desde arriba cada zona quedaba con un segundo borde
concéntrico dibujado en piedra; desde el prado, la guardia se leía como una valla
siguiendo la curva del estrado. En Proyectos el cerco doblaba además al propio
círculo de menhires, que es el monumento.

Lo que queda:

- **El canto del estrado se remata solo.** El muro de contención (`daisSkirt`) le
  da grosor contra el terreno y el peldaño más bajo va mellado. No necesita corro.
- **El suelo lo ensucia el pedregal de la isla** (`World._scatterRocks`), que
  siembra al azar sobre el disco entero y esquiva enlosados, caminos y
  explanadas. Irregular, que es justo lo que el cerco no era.
- **Las runas no dependían de esto.** Viven en las piedras rúnicas sueltas de
  `World._buildRuneStones()`. Se perdieron las ~48 de la guardia y siguen las
  siete colocadas a mano, que son las que se ven de cerca.

Si algún día se quiere volver a poblar el borde de un estrado, la condición es
que el radio y el paso angular NO sean constantes: grupos de dos o tres piezas
con huecos largos entre ellos, o nada.

### Por dónde se anda

Tres sistemas distintos deciden dónde NO plantar, y no son intercambiables:

| lista | quién la mira | para qué |
|---|---|---|
| `paveKeepOut()` | hierba, matorral, pedregal | no brotar entre las losas |
| `forestKeepOut({ corridors })` | arbolado | no dejar caer la copa encima |
| `field.pads` | el propio terreno | asentar los santuarios a nivel |

Dos fallos vinieron de confundirlos. **El arbolado no consulta `paveKeepOut`** —
solo el matorral lo hace—, así que un carballo podía plantarse literalmente entre
los peldaños de la escalinata de Trayectoria; por eso `forestKeepOut` acepta
ahora `corridors`. Y aunque lo consultara no bastaría: el radio que le sirve a la
hierba deja el tronco a cinco metros del eje y la copa encima del camino
igualmente. **Lo que hay que apartar de un sendero es la copa, no el tronco.**

El pedregal tampoco miraba nada más que la plaza y las explanadas, así que
sembraba cantos sobre los caminos y en mitad de la escalinata — que además ya
lleva su propio bordillo de piedras, de modo que la suma se leía como un
desprendimiento sobre los peldaños.

La escalinata la define `travellerCurve()` en `sections/Experience.js`, y la usan
tanto el santuario como el mundo: el prado se siembra cuatro etapas antes de que
el santuario exista, así que si cada uno tuviera su copia se separarían al primer
retoque.

### El agua

Tres capas, de fuera adentro:

1. **La repisa.** El acantilado ya no cae a plomo: el fondo se queda a poca
   profundidad durante noventa metros antes de hundirse. Sin esa repisa TODO el
   mar visible era agua profunda y no había bajío donde el sol llegara al fondo,
   así que ni el turquesa ni las cáusticas tenían dónde ocurrir.
2. **El color, en franjas.** El agua pintada se resuelve en bandas planas
   paralelas a la costa. El color va por su propia curva, aparte de la
   profundidad física: con la profundidad cruda la primera banda cubría solo los
   siete metros más someros de una repisa de noventa.
3. **La marejada.** Mar adentro una ola mide menos de un píxel y el Atlántico se
   queda en una plancha lisa. Un fondo pintado no resuelve el mar abierto con
   olas sino con PINCELADAS: trazos alargados de azul más claro tendidos en la
   dirección del oleaje, que aquí salen de estirar el ruido casi diez a uno
   sobre el eje de la ola dominante.
4. **El camino de luz.** Las chispas del sol van moduladas por el lóbulo ancho
   del especular, no por el fresnel. Con el fresnel caían por igual sobre todo
   el mar y a distancia se leían como nieve de televisión; concentradas donde el
   agua ya devuelve el sol, dibujan el reguero que lleva al horizonte y el resto
   del mar se queda liso.
5. **Las cáusticas.** Una red de Worley devolviendo `F2 - F1`, no `F1`: la
   diferencia entre las dos distancias más cercanas da la MALLA de hilos que
   separa celdas, que es la forma del agua cristalina. `F1` a secas da manchas
   redondas. Los núcleos orbitan con el tiempo, y eso es lo que hace que la red
   se retuerza en vez de limitarse a desplazarse.

Y una pieza de geología que resuelve un problema de malla: la **rasa mareal**,
el rellano al pie del acantilado. Sin ella, la curva de la costa levanta veinte
metros en menos de cuatro unidades horizontales, y el terreno —1,35 m por
cuadro— dibuja esa pared como una escalera de peldaños de seis metros recortada
contra el agua. La rasa hace que el terreno cruce el nivel del mar en
horizontal, y ahí se acaba el dentado.

### El ciclo del día

Cuatro momentos —amanecer, mediodía, atardecer y noche— en la barra de abajo.
No mueven solo el sol: cambian la paleta entera, porque el sombreado cel **no
integra la luz, la usa como índice de una rampa fija**. Bajar la intensidad de
la direccional no haría nada; lo que hace la hora es teñir las bandas. Cada fase
lleva dos multiplicadores independientes, uno para la banda iluminada y otro
para la de sombra, y lo que da el momento del día es el divorcio entre los dos:
al atardecer la luz se va al ámbar mientras la sombra se vuelve MÁS fría, no
menos.

**Estos multiplicadores operan sobre radiancia lineal**, y el fotograma se
codifica a sRGB después. La caída que se ve en pantalla es la raíz 2,2 de la que
se escribe: la primera noche llevaba `0,40` dando por hecho que dejaría la isla
al 40 %, y `0,40^(1/2,2) = 0,66`. El resultado era un prado de mediodía bajo un
cielo estrellado. Para una caída de X en pantalla hay que escribir X^2,2.

Y una trampa que costó un diagnóstico entero: `tools/daylight.mjs` **tiene que
congelar la cámara** antes de disparar. `CameraRig` arranca un giro lento a los
seis segundos sin tocar nada, y la espera de la herramienta era justo de seis
segundos, así que cada foto salía desde un sitio distinto. Comparando esas
capturas, la noche parecía quedarse al 75 % de un mediodía cuando en realidad
estaba al 34 % — lo que se estaba midiendo era el giro de la cámara, no la
paleta.

### Caminos y estrados

Los cinco santuarios están cosidos al círculo central por una red de caminos
empedrados. Cada ramal es **una cinta de quads que muestrea el terreno en cada
vértice de borde**, no una hilera de losas sueltas: con losas independientes, en
cuanto el suelo ondula unas flotan y otras se hunden. La cinta se apoya siempre,
y los cinco ramales son un único draw call.

La red no es radial. Los estrados están tan cerca del círculo central que se
tocan —`daisOuterRadius('plaza')` es 33,4 y el borde del estrado de «Sobre mí»
cae a 29 del centro—, así que tres de los cinco ramales medían menos de tres
metros. Lo que hay es radios más arcos en polares entre santuarios vecinos, que
rodean la plaza en vez de cruzarla.

Durante mucho tiempo el enlosado de los estrados **no se estaba viendo**, y
conviene dejarlo escrito porque los dos fallos se tapaban el uno al otro. El
disco tenía las caras cosidas en sentido horario visto desde arriba, así que su
cara frontal miraba hacia abajo y el descarte de caras traseras se lo comía
entero. No se notaba porque justo encima quedaba la **tapa del cilindro del
peldaño superior**, un disco plano a media altura del relieve del enlosado, con
la textura de losa repetida trece veces sobre un mapeado circular — que da un
abanico de duelas. Lo que se veía de la plaza era esa tapa, y por eso parecía un
entarimado de madera. Moraleja: cuando un cambio en una superficie no altera ni
un píxel, antes de tocar el material hay que comprobar **qué se está dibujando
ahí de verdad**; aquí bastó ocultar los cilindros para que apareciera el
problema, porque debajo no había enlosado sino hierba.

El estrado es cantería, y lo que la hace legible es que **cada losa se asienta a
su propia altura**. Con relieve solo entre hiladas —un surco concéntrico por
cada anillo— el disco se leía como una pana de anillos, un vinilo: el único
relieve que había corría en una sola dirección. Un desnivel de tres centímetros
por pieza basta, porque el sombreado cel salta de banda con la orientación y
pinta distinto dos losas contiguas. Por lo mismo, la junta entre hiladas va fina
y la que separa losas vecinas va ancha: con las dos al mismo ancho mandaba la
circunferencial, que es continua y da la vuelta entera.

---

## Rendimiento

La calidad se decide al arrancar por el dispositivo y se corrige midiendo los
fotogramas reales: por debajo de 34 fps baja resolución, bloom y sombras.

### El CSS se reparte entre las tres pantallas

`ui/base.css` lleva los cimientos —colores, tipografía, reajuste, la pantalla
de carga y los componentes que la versión ligera reutiliza del panel
(medidores, canales, formulario, etiquetas)—. `ui/escena.css` lleva el resto de
la interfaz tridimensional y lo importa `core/Experience.js`, así que viaja con
el motor y no lo descarga quien elige PANEL.

Iba todo en un fichero, y **la puerta se traía 28,4 kB de reglas para el menú,
el raíl, el panel lateral y la ayuda con tal de enseñar dos cuadrados**. Ahora
son 13,7. Y como es CSS de la ruta crítica —bloquea el pintado—, la mejora se
nota más allá de los bytes: `document.fonts.ready` bajó de 1112 a **943 ms**.

La pantalla de carga se queda en `base.css` aunque sólo la use la escena. Tiene
que poder aparecer **mientras** se descargan los 850 kB del motor, y si sus
estilos viajaran con ellos habría una ventana de pantalla en blanco justo en la
conexión lenta donde más se nota. Son 4,5 kB bien gastados.

### Las láminas se dibujan al tamaño al que se ven

`posterCanvas` acepta una `escala`. No cambia el dibujo: escala el lienzo y le
dice al contexto que trabaje en las mismas coordenadas, así que las 200 líneas
de composición siguen pensando en 768×512.

Existe porque los dos sitios que la usan piden cosas distintas. Sobre un
monolito la lámina se proyecta grande y quiere los 768 enteros; en una ficha de
la versión ligera se enseña a unos 270 px, y dibujarla a 768 eran **ocho veces
los píxeles que se iban a ver**, pagados en el equipo que menos puede pagarlos.
La escala sale de medir la ficha por la densidad de pantalla, topada en 2.

Y el lienzo se cuelga tal cual, sin pasar por `toDataURL`. Convertirlo costaba
dos trabajos inútiles: codificar nueve WebP y quedarse en el DOM con **447 kB
de texto en base64** que el navegador tiene luego que descodificar otra vez a
mapa de bits. El lienzo ya es el mapa de bits.

```
                        antes        ahora
  píxeles dibujados     3,54 Mpx     0,44 Mpx
  base64 en el DOM       447 kB          0
```

### Las tipografías se sirven desde aquí

Venían de Google Fonts, y eso costaba tres cosas a la vez: **dos servidores
más** que resolver y saludar, una **cadena de tres viajes** —el HTML pide un
CSS a `googleapis`, que nombra unos ficheros en `gstatic`— antes de que una
sola letra se dibuje con su letra, y la **dirección IP de cada visitante**
entregada a un tercero sin que nadie se lo pregunte.

Medido con `tools/fuentes-check.mjs`, cinco pasadas sin caché, mediana:

```
                        antes (Google)   ahora (aquí)
  hosts contactados            3              1
  peticiones externas          3              0
  bytes de tipografía       72,4 kB        72,4 kB
  document.fonts.ready      1364 ms        1112 ms
```

**Los bytes son los mismos** y conviene decirlo: lo que se gana no es peso,
son viajes. Y los 250 ms medidos aquí son el suelo del ahorro, no el techo —
esta medición sale de una máquina con el DNS de Google caliente y fibra
detrás. En una primera visita desde el móvil, esas dos resoluciones de nombre
y dos saludos TLS cuestan bastante más que la descarga.

Las dos caras de la primera pantalla van **precargadas desde `index.html`**, y
ahí está medio truco: sin la precarga, el navegador no sabe que existe un
fichero de fuente hasta que ha descargado y leído el CSS. Con ella, las dos
descargas arrancan con la primera lectura del documento. El `crossorigin` del
`<link>` no es decorativo aunque el fichero sea del mismo origen: las fuentes
se piden siempre en modo CORS, y sin el atributo la precarga no encaja con la
petición real y el fichero se descarga **dos veces**.

Se alojan las **variables** —un fichero por familia en vez de uno por peso— y
sólo los subconjuntos **latin y latin-ext**. La página usa Inter en 300, 400,
500 y 600 y Cinzel en 400, 500 y 600: siete ficheros estáticos contra dos
variables. De paso se cayó el peso 700 de Cinzel, que el enlace de Google
pedía y no usaba nadie.

Y hay una trampa que conviene conocer si algún día se cambian: **`ctx.font` no
descarga nada**. Los rótulos de la escena se dibujan en canvas con
`'600 96px "Cinzel"'`, y el canvas no dispara la carga de una fuente: se
apoya en que el DOM ya la haya pedido. Funciona porque la pantalla de carga
usa Cinzel y porque `Experience.boot()` espera a `document.fonts.ready` antes
de dibujar. Si un día se quita Cinzel del HTML, los rótulos del promontorio
saldrán en Georgia y **no se rehacen** — quedan grabados en la textura.

El antialiasing lo hace **SMAA al final de la cadena de post-proceso**, no
MSAA. Un objetivo de render half-float con multimuestreo se dibuja bien pero
Firefox no lo resuelve a textura: cada pase leía negro del anterior y la
escena salía completamente en negro. Chromium sí lo resuelve, así que el
fallo no aparecía en las capturas de verificación — de ahí que `tools/shoot.mjs`
no baste por sí solo para dar por bueno un cambio en `PostFX.js`.

La hierba tiene LOD por distancia — la brizna se encoge hasta desaparecer a
partir de unos 95 metros, donde ya mide menos de un píxel y solo aportaría
centelleo.

---

## Herramientas

```bash
node tools/shoot.mjs                  # capturas de las 6 vistas en captures/
node tools/shoot.mjs <url> <carpeta>  # contra otro servidor
```

Abre la build en un Chromium headless con WebGL por software, recorre las cinco
secciones, guarda una imagen de cada una y avisa de cualquier error de consola.
Es la forma de revisar cambios visuales sin abrir el navegador a mano.

Para la cantería hay otro banco, que pone en fila las piezas que se juzgan
juntas —ortostato, trilito, dolmen y canto— sobre suelo neutro:

```bash
node tools/shoot-stones.mjs                                          # las cinco en fila
node tools/shoot-stones.mjs '…/stone-preview.html?cerca' salida.png  # primer plano
```

Los dos encuadres hacen falta y no son intercambiables: **la silueta se juzga de
lejos y el relieve de cerca**, y con uno solo siempre se corrige a ciegas la otra
mitad. El primer plano mira desde −Z porque el sol de la escena viene de ahí;
desde el otro lado se está juzgando la cara en sombra, donde no hay contraste que
revele si los paños existen o no.

Para mirar un sitio concreto del terreno —una ladera, por dónde pasa un camino,
si cabe una boca de túnel— las seis vistas guionizadas no sirven, hay que poder
ponerse encima:

```bash
node tools/fly.mjs <x,y,z> <mirar-x,y,z> [salida.png]
node tools/terrain-map.mjs            # perfil de cada ramal + mapa de relieve
node tools/stairway-check.mjs         # escalinata: peldaños, tierras, holguras
node tools/stairway-sweep.mjs         # escalinata: tope de pendiente × panza
node tools/scene-tree.mjs [prof]      # grafo de escena: nodos, nombres, instanciados
node tools/editor-check.mjs           # editor: mover → guardar → recargar → ¿sigue?
node tools/shoot-editor.mjs           # captura del panel con una pieza elegida
node tools/walk-check.mjs             # a pie: ¿se sube por la escalinata y no por el talud?
node tools/ligero-check.mjs           # ligera: ¿de verdad NO se descarga three?
node tools/shoot-ligero.mjs [carpeta] # ligera: página entera, sección a sección y móvil
node tools/fondo-check.mjs            # fondo animado: ¿de verdad se nota, sin pasarse?
node tools/fuentes-check.mjs          # tipografía: hosts, bytes y cuándo está la letra
node tools/fetch-fonts.mjs            # traer las fuentes al proyecto (a mano, no en cada build)
```

`fly.mjs` usa el modo de vuelo libre del propio rig, así que lo que sale en la
foto es lo que vería el visitante desde ahí.

`ligero-check.mjs` vale contra el servidor de desarrollo y contra `dist/`
(`URL=http://127.0.0.1:4173/ node tools/ligero-check.mjs`), y lo primero que
mira es la lista de peticiones: una página ligera que oculta el lienzo y se
sigue trayendo el motor es indistinguible a simple vista de una que no, y no
sirve para nada. Lo demás —las cinco secciones, una ficha por proyecto, las
láminas que se pintan al asomar, la ida y vuelta entre versiones, y el caso
sin WebGL con el contexto anulado antes de que corra la página— es lo que se
rompe al tocar `content.js` o `modo.js` sin darse cuenta.

`shoot-ligero.mjs` saca el móvil **por tiras de una pantalla**, no de una
pieza. La captura de página completa se cose por trozos y con una cabecera
fija encima Chromium la repite en cada costura: sale el portafolio tres veces
seguidas, que parece un fallo grave de la página y no lo es.

`fondo-check.mjs` le pone la hora a mano a cada animación con
`animation.currentTime` en vez de esperarla: los ciclos son de 71, 97 y 53
segundos, y mirarlos en tiempo real serían tres minutos por captura que además
saldrían en un punto distinto cada vez. Compara los fotogramas sobre una franja
de fondo limpio, sin texto ni filetes que contaminen la cuenta. Los umbrales
—entre 1 y 12 de diferencia media sobre 765— no son gusto: por debajo el cambio
queda por debajo de lo que distingue un ojo en un degradado oscuro, y por
encima deja de ser un fondo y empieza a competir con el texto.

`ligero-check.mjs` pregunta además por el **elemento que hay realmente en el
punto donde se pulsaría** cada botón. Suena redundante y no lo es: el lienzo 3D
es `position: fixed` a pantalla completa y transparente, así que si se queda en
el DOM en modo ligero se pone por delante de todo lo que no esté posicionado y
mata los botones de debajo sin dejar ni una marca. Se salvaban los de la
cabecera —`sticky`— y todo lo que cuelga de `.lg-secciones`, de modo que la
portada y el pie estuvieron muertos con las pruebas en verde. Ahora el lienzo
se retira al mostrar la versión ligera.

`fuentes-check.mjs` cuenta los recursos **por URL única y no por evento de
respuesta**. Una precarga acertada emite dos respuestas para una sola descarga
—la de la precarga y la del uso, que se sirve de ella—, así que contando
eventos el medidor daba por duplicado el peso de la tipografía justo cuando se
puso bien el `<link rel="preload">`: marcaba en rojo el cambio que estaba
mejorando. Es el modo más fácil de que una herramienta de rendimiento mienta a
favor de dejar las cosas como estaban.

Los dos de la escalinata interrogan al módulo de verdad, no a una copia de sus
números: montan el campo de alturas igual que `World._buildField` y le preguntan
a `stairwayPlan`. Lo que miden es lo que se construye.

`editor-check.mjs` es el que importa de los tres últimos, y lo que comprueba no
es que el panel se pinte sino que el **ciclo se cierra**: mover una pieza en el
navegador, guardar, recargar y encontrarla donde se dejó. Eso cruza el
navegador, el middleware de Vite, el fichero en disco y el arranque del mundo, y
cualquiera de los cuatro puede romperlo sin que se note en los otros tres. Deja
`escena.json` como estaba.

Las dos herramientas del editor fuerzan los fotogramas del vuelo de cámara a
mano (`rig.update(0.1)` en bucle) en vez de esperar. Aquí el navegador corre
sobre WebGL por software y da alrededor de **un fotograma por segundo**: con
`dt` topado a 0,1 s, un vuelo de 0,8 s se quedaría a un octavo del camino y la
captura saldría distinta en cada máquina.

Para el arbolado hay un banco de pruebas aparte, solo en desarrollo:

```
http://127.0.0.1:5173/tools/tree-preview.html
```

Renderiza cuatro árboles sobre suelo neutro, con la luz de la escena real y un
bloque de 8 m como referencia de escala. Ajustar la silueta ahí es mucho más
rápido que reconstruir el promontorio entero en cada intento.

Y otro para la hojarasca:

```
http://127.0.0.1:5173/tools/leaf-texture-preview.html
```

Vuelca el atlas de cada especie tal cual sale del generador y **mide** qué
porcentaje de píxeles opacos son flor. Esa cifra resolvió el brezo, que salía
rosa entero: la flor ocupaba el 27 % y pesa mucho más de lo que parece al
mirarla. Bajada al 11 %, la mata volvió a leerse verde. Mirar la textura
directamente es la única forma de separar un problema de pintura de uno de
iluminación; ajustar a ojo sobre el render mezcla las dos cosas.

Y la verificación que no se puede saltar:

```bash
node tools/firefox-check.mjs                  # fps, errores y captura en Firefox
node tools/firefox-check.mjs <url> <carpeta>
```

Existe porque Chromium no vale como único juez: la pantalla en negro que tapaba
la escena entera solo se daba en Firefox. Cualquier cambio en `PostFX.js` o en
un shader hay que pasarlo por aquí.

### Vegetación

Cinco especies procedurales, todas del mismo generador (`src/models/Tree.js`)
con perfiles distintos:

| Especie | Altura | Dónde crece |
| --- | --- | --- |
| `carballo` | 10,5–14 m | Lomas del interior. Medido de la foto de referencia |
| `roble` | 10,5–13,5 m | Lomas del interior |
| `fresno` | 12–15,5 m | Lomas del interior, más columnar |
| `arbusto` | 1,6–2,8 m | Toda la isla, hasta el borde del acantilado |
| `brezo` | 0,7–1,25 m | Toda la isla, más tupido en el borde expuesto |
| `helecho` | 0,9–1,6 m | Solo al pie de los árboles: busca sombra |

Dos cosas que se aprendieron a base de que salieran mal:

- **`cardSize` va en unidades de mundo.** Antes se multiplicaba por
  `height / 13`, una normalización pensada para árboles. Al heredarla los
  arbustos, las tarjetas de un brezo de un metro medían tres centímetros y la
  mata parecía un manojo de palitos.
- **El color de flor no se interpola por tono.** Ir de verde (96°) a violeta
  (305°) en HSL cruza por el cian: el brezo salía turquesa fosforito. Se pintan
  de flor algunas puntas sueltas, que además es como florece de verdad.

### De dónde salen las proporciones del carballo

La tercera especie de árbol, el **carballo**, no está ajustada a ojo: sus tres
cifras están medidas en píxeles sobre una foto de referencia
(`ref/roble-referencia.png`) usando el pipeline de
[img2threejs](https://github.com/img2threejs/img2threejs).

| Rasgo | Medido |
| --- | --- |
| Copa: ancho / alto | 1.17 |
| Tronco antes de la primera horquilla | 0.35 de la altura |
| Raíces expuestas | 0.25 de la altura |

De ahí salieron además dos cambios que benefician a **todas** las especies: la
copa se reparte en lóbulos desiguales (cada punta de rama va a su lóbulo más
cercano) y el amarillo de otoño se indexa por distancia radial dentro del
lóbulo, no por el borde de cada racimo.

Los artefactos del análisis están en `.img2threejs/`: el desglose por capas
(`analysis.md`), el `ObjectSculptSpec` validado y la evidencia PBR extraída de
recortes reales. El modelo que generó esa herramienta **no se usa** — solo
llegó al pase de *blockout* (cajas y elipsoides) y falló su propia compuerta de
silueta. Para reproducirlo:

```bash
python3 ~/.claude/skills/img2threejs/forge/stage3_build/generate_threejs_factory.py \
  .img2threejs/object-sculpt-spec.json --out /tmp/createOakTreeModel.ts
```

**Nota sobre medir rendimiento:** los navegadores headless de esta máquina no
están limitados por GPU, así que sus fotogramas por segundo no dicen nada del
rendimiento real. El contador de la esquina inferior derecha, en un navegador
normal, sí.

---

## Licencia

MIT.
