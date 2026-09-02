/**
 * El formulario de contacto, uno solo para las dos versiones.
 *
 * El altar de la escena y la página ligera envían al mismo sitio y dicen lo
 * mismo cuando algo falla. Tenerlo escrito dos veces era garantía de que un
 * día divergieran: se arregla el mensaje de error en uno y el otro sigue
 * mintiendo.
 */

import { CONTACT } from '../content.js';

/**
 * Marcado del formulario. Las clases (`.form`, `.field`, `.submit`) están
 * definidas en `ui/base.css`, fuera del armazón del panel, así que sirven
 * igual dentro de la escena que en la página ligera.
 */
export function formularioContacto() {
  return `
    <form class="form" data-contact-form novalidate>
      <div class="field">
        <label for="c-name">Nombre</label>
        <input id="c-name" name="name" type="text" autocomplete="name" required />
      </div>
      <div class="field">
        <label for="c-mail">Correo</label>
        <input id="c-mail" name="email" type="email" autocomplete="email" required />
      </div>
      <div class="field">
        <label for="c-msg">Mensaje</label>
        <textarea id="c-msg" name="message" required></textarea>
      </div>
      <button class="submit" type="submit">Dejar la ofrenda</button>
      <p class="form__note" data-form-note>
        ${CONTACT.endpoint
          ? 'El mensaje se envía al altar y llega a tu bandeja.'
          : 'Sin destino configurado: define <code>CONTACT.endpoint</code> en <code>src/content.js</code> para recibirlo de verdad.'}
      </p>
    </form>
  `;
}

/**
 * Valida y envía. Escribe el resultado en la nota del propio formulario, así
 * que quien lo llama no tiene que hacer nada con lo que devuelve.
 *
 * @param {HTMLFormElement} form
 */
export async function enviarContacto(form) {
  const note = form.querySelector('[data-form-note]');
  const data = Object.fromEntries(new FormData(form).entries());

  if (!data.name || !data.email || !data.message) {
    note.dataset.state = 'error';
    note.textContent = 'Faltan datos: nombre, correo y mensaje.';
    return;
  }

  const button = form.querySelector('.submit');
  button.disabled = true;
  note.dataset.state = '';
  note.textContent = 'Llevando la ofrenda al fuego…';

  if (!CONTACT.endpoint) {
    // Sin destino no se puede enviar; se dice claro en vez de fingirlo.
    await new Promise((r) => setTimeout(r, 700));
    note.dataset.state = 'error';
    note.innerHTML =
      'No hay destino configurado, así que el mensaje no ha salido. Define <code>CONTACT.endpoint</code> en <code>src/content.js</code>.';
    button.disabled = false;
    return;
  }

  try {
    const res = await fetch(CONTACT.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    note.dataset.state = 'ok';
    note.textContent = 'El humo se lo ha llevado. Gracias.';
    form.reset();
  } catch (error) {
    note.dataset.state = 'error';
    note.textContent = `No ha salido: ${error.message}. Prueba por otro canal.`;
  } finally {
    button.disabled = false;
  }
}
