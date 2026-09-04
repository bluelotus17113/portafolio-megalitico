/**
 * Capa de interfaz: carga, navegación, panel y ayuda.
 *
 * Solo habla con la escena a través de las devoluciones de llamada que recibe
 * en el constructor. No importa nada de three.js a propósito — así la UI se
 * puede tocar sin riesgo de romper el render, y al revés.
 */

import { SECTIONS } from '../config.js';
import { IDENTITY, PROJECTS, SKILLS } from '../content.js';
import { cambiarModo, LIGERO } from '../modo.js';
import { enviarContacto } from './contacto.js';
import {
  renderAbout,
  renderContact,
  renderExperience,
  renderProject,
  renderProjects,
  renderSkill,
  renderSkills,
} from './panels.js';

const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

export class Overlay {
  /**
   * @param {object} callbacks
   * @param {(id: string) => void} callbacks.onNavigate
   * @param {() => void} callbacks.onEnter
   * @param {() => void} callbacks.onToggleFree
   * @param {() => void} callbacks.onPanelClose
   * @param {(id: string) => void} callbacks.onTimeOfDay
   */
  constructor(callbacks = {}) {
    this.cb = callbacks;

    this.loader = document.getElementById('loader');
    this.loaderFill = this.loader.querySelector('.loader__fill');
    this.loaderStatus = this.loader.querySelector('.loader__status');
    this.loaderBar = this.loader.querySelector('.loader__bar');
    this.enterButton = this.loader.querySelector('.loader__enter');

    this.ui = document.getElementById('ui');
    this.railList = this.ui.querySelector('.rail__list');
    this.menu = document.getElementById('menu');
    this.menuList = this.menu.querySelector('.menu__list');
    this.menuToggle = this.ui.querySelector('.menu-toggle');
    this.panel = document.getElementById('panel');
    this.panelBody = this.panel.querySelector('.panel__body');
    this.panelClose = this.panel.querySelector('.panel__close');
    this.compassLabel = this.ui.querySelector('[data-compass-label]');
    this.tooltip = this.ui.querySelector('[data-tooltip]');
    this.perf = this.ui.querySelector('[data-perf]');
    this.daylight = this.ui.querySelector('[data-daylight]');
    this.help = this.ui.querySelector('.help');

    this.activeId = null;
    this.panelState = null;

    this._fillIdentity();
    this._buildRail();
    this._buildMenu();
    this._bind();
  }

  // ------------------------------------------------------------- construcción

  _fillIdentity() {
    for (const el of document.querySelectorAll('[data-identity-name]')) {
      el.textContent = IDENTITY.name;
    }
    for (const el of document.querySelectorAll('[data-identity-role]')) {
      el.textContent = IDENTITY.role;
    }
    document.title = `${IDENTITY.name} · Portafolio`;
  }

  _buildRail() {
    this.railList.innerHTML = SECTIONS.map(
      (s) => `
      <li class="rail__item" data-section="${s.id}">
        <button class="rail__dot" type="button" aria-label="${s.label}"></button>
        <span class="rail__label">${s.label}</span>
      </li>`
    ).join('');

    for (const item of this.railList.querySelectorAll('.rail__item')) {
      const id = item.dataset.section;
      item.querySelector('.rail__dot').addEventListener('click', () => this.cb.onNavigate?.(id));
      // El puntero sobre el índice ya anticipa a dónde va.
      item.addEventListener('pointerenter', () => this.setTooltip(SECTION_BY_ID[id].subtitle));
      item.addEventListener('pointerleave', () => this.setTooltip(null));
    }
  }

  _buildMenu() {
    this.menuList.innerHTML = SECTIONS.map(
      (s) => `
      <li>
        <button class="menu__entry" type="button" data-section="${s.id}">
          <span class="menu__num">${s.kicker}</span>
          <span class="menu__text">
            <strong>${s.label}</strong>
            <span>${s.subtitle}</span>
          </span>
        </button>
      </li>`
    ).join('');

    for (const entry of this.menuList.querySelectorAll('.menu__entry')) {
      entry.addEventListener('click', () => {
        this.cb.onNavigate?.(entry.dataset.section);
        this.toggleMenu(false);
      });
    }
  }

  _bind() {
    this.enterButton.addEventListener('click', () => this.cb.onEnter?.());

    // Hay dos salidas hacia la versión ligera y son las dos deliberadas: la de
    // la pantalla de carga, para quien ve que su equipo no llega, y la del
    // menú, para quien ya está dentro y prefiere leer. Ambas recargan.
    for (const boton of document.querySelectorAll('[data-action="ligero"]')) {
      boton.addEventListener('click', () => cambiarModo(LIGERO));
    }

    this.menuToggle.addEventListener('click', () => {
      this.toggleMenu(this.menu.hidden);
    });

    this.ui.querySelector('[data-action="home"]').addEventListener('click', (e) => {
      e.preventDefault();
      this.cb.onNavigate?.(null);
      this.toggleMenu(false);
    });

    this.ui.querySelector('[data-action="walk"]').addEventListener('click', () => {
      this.cb.onToggleWalk?.();
      this.toggleMenu(false);
    });

    this.ui.querySelector('[data-action="free"]').addEventListener('click', () => {
      this.cb.onToggleFree?.();
      this.toggleMenu(false);
    });

    this.ui.querySelector('[data-action="help"]').addEventListener('click', () => this.toggleHelp(true));
    this.help.querySelector('.help__close').addEventListener('click', () => this.toggleHelp(false));
    this.help.addEventListener('click', (e) => {
      if (e.target === this.help) this.toggleHelp(false);
    });

    this.panelClose.addEventListener('click', () => {
      this.close();
      this.cb.onPanelClose?.();
    });

    // Delegación: los botones del panel se recrean con cada render.
    this.panelBody.addEventListener('click', (e) => {
      const openProject = e.target.closest('[data-open-project]');
      if (openProject) {
        const project = PROJECTS.find((p) => p.id === openProject.dataset.openProject);
        if (project) this.open('project', project);
        return;
      }
      const back = e.target.closest('[data-back]');
      if (back) {
        this.open(back.dataset.back);
      }
    });

    this.panelBody.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-contact-form]');
      if (!form) return;
      e.preventDefault();
      enviarContacto(form);
    });

    // Cierra el menú al pulsar fuera.
    document.addEventListener('pointerdown', (e) => {
      if (this.menu.hidden) return;
      if (this.menu.contains(e.target) || this.menuToggle.contains(e.target)) return;
      this.toggleMenu(false);
    });
  }

  // ------------------------------------------------------------------- carga

  /** @param {number} value 0..1 */
  setProgress(value, label) {
    const pct = Math.max(0, Math.min(1, value));
    this.loaderFill.style.right = `${(1 - pct) * 100}%`;
    this.loaderBar.setAttribute('aria-valuenow', Math.round(pct * 100));
    if (label) this.loaderStatus.textContent = label;
  }

  /** Todo cargado: aparece el botón de entrada. */
  ready() {
    this.loaderStatus.textContent = 'La piedra está despierta';
    this.enterButton.hidden = false;
    this.enterButton.focus({ preventScroll: true });
  }

  /** Oculta la carga y muestra la interfaz. */
  enter() {
    this.loader.dataset.done = 'true';
    this.ui.hidden = false;
    // Un frame de margen para que la transición de opacidad arranque.
    requestAnimationFrame(() => {
      this.ui.dataset.ready = 'true';
    });
    setTimeout(() => {
      this.loader.remove();
    }, 1400);
  }

  // -------------------------------------------------------------- navegación

  setActive(id) {
    this.activeId = id;
    for (const item of this.railList.querySelectorAll('.rail__item')) {
      item.dataset.active = String(item.dataset.section === id);
    }
    for (const entry of this.menuList.querySelectorAll('.menu__entry')) {
      entry.dataset.active = String(entry.dataset.section === id);
    }
    this.compassLabel.textContent = id ? SECTION_BY_ID[id].subtitle : 'El Círculo';
  }

  toggleMenu(open) {
    this.menu.hidden = !open;
    this.menuToggle.setAttribute('aria-expanded', String(open));
  }

  toggleHelp(open) {
    this.help.hidden = !open;
  }

  get helpOpen() {
    return !this.help.hidden;
  }

  /**
   * Construye el selector de momento del día.
   *
   * Los momentos los publica el mundo, no la interfaz: la lista y el orden
   * viven en `TimeOfDay.js` junto a las paletas, que es donde se añaden o se
   * quitan. Aquí solo se pintan botones.
   *
   * @param {Array<{id: string, label: string}>} phases
   * @param {string} activeId
   */
  setTimePhases(phases, activeId) {
    if (!this.daylight) return;
    this.daylight.textContent = '';
    this.timeButtons = new Map();

    for (const phase of phases) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'daylight__option';
      button.textContent = phase.label;
      button.dataset.phase = phase.id;
      button.setAttribute('aria-pressed', String(phase.id === activeId));
      button.addEventListener('click', () => {
        this.setTimePhase(phase.id);
        this.cb.onTimeOfDay?.(phase.id);
      });
      this.daylight.appendChild(button);
      this.timeButtons.set(phase.id, button);
    }
  }

  /** Marca visualmente el momento activo, sin disparar la devolución. */
  setTimePhase(id) {
    if (!this.timeButtons) return;
    for (const [key, button] of this.timeButtons) {
      button.setAttribute('aria-pressed', String(key === id));
    }
  }

  setTooltip(text) {
    if (!text) {
      this.tooltip.hidden = true;
      return;
    }
    this.tooltip.textContent = text;
    this.tooltip.hidden = false;
  }

  setPerf(text) {
    this.perf.textContent = text;
  }

  // ------------------------------------------------------------------- panel

  /**
   * @param {'about'|'projects'|'project'|'skills'|'skill'|'experience'|'contact'|'link'} kind
   * @param {any} payload
   */
  open(kind, payload) {
    let html = '';
    let accent = null;
    let sectionId = null;

    switch (kind) {
      case 'about':
        sectionId = 'about';
        html = renderAbout(SECTION_BY_ID.about);
        break;
      case 'projects':
        sectionId = 'projects';
        html = renderProjects(SECTION_BY_ID.projects);
        break;
      case 'project':
        sectionId = 'projects';
        html = renderProject(payload);
        break;
      case 'skills':
        sectionId = 'skills';
        html = renderSkills(SECTION_BY_ID.skills);
        break;
      case 'skill':
        sectionId = 'skills';
        html = renderSkill(payload, SECTION_BY_ID.skills);
        break;
      case 'experience':
        sectionId = 'experience';
        html = renderExperience(SECTION_BY_ID.experience, payload?.index ?? -1);
        break;
      case 'contact':
        sectionId = 'contact';
        html = renderContact(SECTION_BY_ID.contact);
        break;
      case 'link':
        // Un canal concreto abre la sección entera: es más útil que una
        // ficha con un solo dato.
        sectionId = 'contact';
        html = renderContact(SECTION_BY_ID.contact);
        break;
      default:
        return;
    }

    accent = SECTION_BY_ID[sectionId]?.color;
    this.panel.style.setProperty('--panel-accent', `#${(accent ?? 0x4fe6d8).toString(16).padStart(6, '0')}`);
    this.panelBody.innerHTML = html;
    this.panel.hidden = false;
    // Reinicia la animación de entrada aunque el panel ya estuviera abierto.
    this.panel.dataset.open = 'false';
    requestAnimationFrame(() => {
      this.panel.dataset.open = 'true';
      this.panel.querySelector('.panel__scroll').scrollTop = 0;
    });
    this.panelState = { kind, payload, sectionId };

    // Enfoca el hito señalado dentro de la cronología.
    const focus = this.panelBody.querySelector('[data-focus="true"]');
    if (focus) {
      setTimeout(() => focus.scrollIntoView({ block: 'center', behavior: 'smooth' }), 420);
    }
  }

  close() {
    this.panel.dataset.open = 'false';
    this.panelState = null;
    setTimeout(() => {
      if (this.panel.dataset.open !== 'true') this.panel.hidden = true;
    }, 760);
  }

  get panelOpen() {
    return this.panel.dataset.open === 'true';
  }
}

/** Índice de secciones que también usa el atajo numérico del teclado. */
export const SECTION_ORDER = SECTIONS.map((s) => s.id);
export { SECTION_BY_ID, SKILLS };
