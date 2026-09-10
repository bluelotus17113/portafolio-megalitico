/**
 * La puerta del panel publicado.
 *
 * ── Esto no es lo que protege ──────────────────────────────────────────────
 *
 * Conviene decirlo claro donde se pueda leer: esta pantalla no da seguridad
 * ninguna. Es código que corre en el navegador de quien quiere entrar, y quien
 * quiere entrar puede saltársela con la consola abierta en diez segundos.
 *
 * Lo que protege de verdad es que `/api/contenido` exija una cookie firmada
 * antes de escribir nada. Aunque alguien fuerce el panel a dibujarse, cada
 * intento de guardar rebota con un 401. Esta pantalla existe para que quien
 * TIENE la contraseña pueda entrar, no para detener a quien no la tiene.
 *
 * ── Por qué la contraseña no toca el cliente más que de paso ───────────────
 *
 * Se manda una vez y no se guarda: ni en `localStorage`, ni en una variable, ni
 * en el campo. Lo que queda es la cookie de sesión, que el navegador maneja y
 * ningún script puede leer. Guardar la contraseña «para no volver a pedirla»
 * habría sido dejarla al alcance de cualquier script de la página.
 */

export function montarPuerta(raiz, alEntrar) {
  raiz.innerHTML = `
    <div class="pu">
      <form class="pu__caja" novalidate>
        <h1 class="pu__titulo">Panel</h1>
        <p class="pu__pie">Sólo para quien lleva el portafolio.</p>
        <label class="pu__campo">
          <span>Contraseña</span>
          <input type="password" name="clave" autocomplete="current-password" required autofocus />
        </label>
        <button class="pu__boton" type="submit">Entrar</button>
        <p class="pu__nota" data-nota role="status" aria-live="polite"></p>
      </form>
    </div>
  `;
  const form = raiz.querySelector('form');
  const nota = raiz.querySelector('[data-nota]');
  const boton = raiz.querySelector('.pu__boton');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const campo = form.querySelector('input[name="clave"]');
    const clave = campo.value;
    if (!clave) return;
    boton.disabled = true;
    nota.dataset.mal = '';
    nota.textContent = 'Comprobando…';
    try {
      const res = await fetch('/api/entrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clave }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(cuerpo.error ?? `HTTP ${res.status}`);
      // Fuera de la memoria del navegador en cuanto ha servido.
      campo.value = '';
      nota.textContent = 'Dentro.';
      alEntrar();
    } catch (err) {
      nota.dataset.mal = 'sí';
      nota.textContent = err.message;
      boton.disabled = false;
      campo.select();
    }
  });
}

/** ¿Hay sesión abierta ya? Lo decide el servidor, no el cliente. */
export async function haySesion() {
  try {
    const res = await fetch('/api/sesion', { cache: 'no-store' });
    const cuerpo = await res.json();
    return Boolean(cuerpo.dentro);
  } catch {
    return false;
  }
}
