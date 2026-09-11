# Desplegar y entrar al panel

## 1. Vercel

Importa `bluelotus17113/portafolio-megalitico` en vercel.com. Detecta Vite solo
y acierta: build `npm run build`, salida `dist`, install `npm install`. El
`vercel.json` del repo aplica las cabeceras de caché de fuentes y texturas.

Cada push a `main` redespliega. No hace falta ningún workflow de GitHub
Actions — la integración va por la app de Vercel.

## 2. Variables de entorno

En **Settings → Environment Variables**, para *Production*. Ninguna de estas
puede estar en el repositorio: es público.

| Variable | Qué es |
|---|---|
| `ADMIN_HASH` | El hash de tu contraseña. Lo genera `node tools/clave.mjs`. |
| `SESSION_SECRET` | Firma la cookie de sesión. Lo genera el mismo comando. |
| `GITHUB_TOKEN` | Token de acceso para que el panel pueda commitear. |
| `GITHUB_REPO` | `bluelotus17113/portafolio-megalitico` |
| `GITHUB_BRANCH` | Opcional. `main` si no se pone. |

### La contraseña

```
node tools/clave.mjs
```

Se teclea sin eco, no se guarda en ningún sitio y no queda en el historial del
shell. Imprime `ADMIN_HASH` y `SESSION_SECRET`; pégalos en Vercel y cierra la
terminal. **La contraseña en claro no tiene que salir de tu cabeza** — no hace
falta para nada más.

Cambiar `SESSION_SECRET` cierra todas las sesiones abiertas de golpe. Es lo que
hay que hacer si alguna vez sospechas que alguien entró.

### El token de GitHub

Uno *fine-grained*, no clásico, y con el mínimo que hace falta:

- **Repository access**: sólo `portafolio-megalitico`.
- **Permissions → Contents**: *Read and write*. Nada más.
- Caducidad de 90 días y renovarlo. Un token sin caducidad es un token que
  seguirá funcionando el día que se filtre.

Con ese alcance, un token robado sólo puede tocar este repositorio. No es poco,
pero es acotado y se revoca en un clic.

## 3. Entrar

`https://<tu-dominio>/?admin` pide la contraseña. Ocho horas de sesión.

Guardar **commitea al repositorio** y Vercel redespliega: el cambio se ve en
medio minuto, no al instante. A cambio cada edición queda en el historial con
su fecha y se puede deshacer.

## Lo que protege esto, y lo que no

Lo que impide que alguien cambie tu contenido **no es que el formulario esté
escondido**: es que `/api/contenido` no escribe sin una cookie firmada. El panel
viaja en la web publicada a propósito, y da igual que alguien lo dibuje a la
fuerza — cada intento de guardar rebota con un 401.

Contra la contraseña: cada intento cuesta ~145 ms de scrypt, así que un millón
de pruebas son 126 horas de CPU. Eso protege una frase larga; **no protege una
contraseña corta**, por mucho scrypt que lleve detrás. Usa una frase.

El freno por IP de `api/entrar.js` vive en memoria del proceso y Vercel levanta
y tira instancias, así que se puede eludir repartiendo los intentos. No es la
defensa: encarece el caso fácil y nada más.

---

# career-ops: un solo registro para las dos herramientas

## Alimentar career-ops desde el portafolio

```
node tools/career-ops.mjs            # ver qué haría
node tools/career-ops.mjs escribir   # escribirlo
```

Genera `cv.md` y `config/profile.yml` dentro de career-ops a partir de
`src/contenido.json`. Así tus datos viven en un sitio: el día que corrijas un
empleo en el panel, el currículo que career-ops adapte a una oferta llevará la
corrección. Escribirlos a mano habría significado tenerlos en dos sitios, y el
que se quede viejo no avisa.

Los dos no se tratan igual, y es a propósito. **`cv.md` se regenera siempre** —
todo lo que lleva se deriva del contenido. **`profile.yml` no**: lleva cosas que
el portafolio no sabe y que sólo escribes tú (rango salarial, mínimo, preaviso),
así que se escribe una vez y a partir de ahí hay que pedirlo con `--forzar`
sabiendo lo que se pierde. Lo que falta va marcado con `TODO`.

Las cabeceras del `cv.md` van en inglés y el contenido en español: los scripts
de career-ops buscan `## Work Experience`, `## Education` y `## Skills` para
trocear el fichero, y traducirlas deja su parser sin nada que reconocer. Lo que
sale del molde lo traduce él con `language.output: es`.

## El registro de candidaturas

Vive en `carrera/candidaturas.md`, en el formato de career-ops. Apúntalo así:

```
export CAREER_OPS_TRACKER=/home/vaknadesu/Proyectos/portafolio-megalitico/carrera/candidaturas.md
```

Un solo fichero para las dos herramientas. Dos registros es la peor opción: el
día que apuntes una entrevista en uno y no en el otro, el que consultes te dará
una respuesta y no sabrás cuál es la buena.

Se edita desde el panel, sección **Candidaturas**, y cada guardado regenera
también `carrera/candidaturas.csv`, que Excel abre con doble clic. Es CSV y no
`.xlsx` a propósito: Excel lo abre igual y no entra una dependencia para
escribir un formato que por dentro es un zip de XML. Lleva la marca de orden de
bytes y la línea `sep=;` porque sin las dos un Excel español abre los acentos
rotos y mete la fila entera en la primera columna.

Después de editar desde el panel **publicado**, haz `git pull` antes de usar
career-ops: el panel commitea al repositorio y tu copia local no se entera sola.

Y para cambiar un estado, cuando estés en local, usa su comando y no la tabla a
mano: valida el estado, bloquea el fichero y apunta la transición en el registro
que leen sus informes.

```
node set-status.mjs <número|empresa> <estado>
```

Estados: `Evaluated` → `Applied` → `Responded` → `Interview` → `Offer` /
`Rejected` / `Discarded` / `SKIP`.
