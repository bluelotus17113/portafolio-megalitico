/**
 * Contenido del panel lateral.
 *
 * Funciones puras: reciben datos de `content.js` y devuelven HTML. No tocan
 * el DOM ni conocen la escena, así que se pueden probar y reordenar sin
 * arrastrar nada del motor 3D detrás.
 */

import { ABOUT, CONTACT, EXPERIENCE, PROJECTS, SKILLS } from '../content.js';
import { runeFor } from '../utils/runes.js';
import { posterCanvas } from '../utils/posters.js';
import { formularioContacto } from './contacto.js';
import { esc } from '../utils/html.js';

export { esc };

function header(section, { kicker } = {}) {
  return `
    <p class="panel__kicker">${esc(kicker ?? section.kicker)}</p>
    <h2 class="panel__title">${esc(section.label)}</h2>
    <p class="panel__subtitle">${esc(section.subtitle)}</p>
    <p class="panel__lore">${esc(section.lore)}</p>
  `;
}

export function renderAbout(section) {
  const paragraphs = ABOUT.body.map((p) => `<p class="panel__text">${esc(p)}</p>`).join('');
  const facts = ABOUT.facts?.length
    ? `<div class="facts">${ABOUT.facts
        .map(
          (f) => `
          <div class="facts__item">
            <span class="facts__label">${esc(f.label)}</span>
            <span class="facts__value">${esc(f.value)}</span>
          </div>`
        )
        .join('')}</div>`
    : '';

  return `
    <div class="stagger">
      ${header(section)}
      <hr class="panel__rule" />
      ${paragraphs}
      ${facts}
    </div>
  `;
}

export function renderProjects(section) {
  const items = PROJECTS.map(
    (p) => `
      <li>
        <button class="list__item" type="button" data-open-project="${esc(p.id)}">
          <span class="list__head">
            <span class="list__title">${esc(p.title)}</span>
            <span class="list__meta">${esc(p.year)}</span>
          </span>
          <span class="list__body">${esc(p.summary)}</span>
        </button>
      </li>`
  ).join('');

  return `
    <div class="stagger">
      ${header(section)}
      <hr class="panel__rule" />
      <ul class="list">${items}</ul>
    </div>
  `;
}

export function renderProject(project) {
  const poster = posterCanvas(project.poster ?? { seed: 1, hue: 190 }).toDataURL('image/webp', 0.85);
  const tags = project.stack?.length
    ? `<ul class="tags">${project.stack.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    : '';
  const link = project.url
    ? `<a class="external" href="${esc(project.url)}" target="_blank" rel="noopener noreferrer">Ver el proyecto ↗</a>`
    : '';

  return `
    <div class="stagger">
      <button class="back" type="button" data-back="projects">← Círculo de monolitos</button>
      <p class="panel__kicker">${esc(project.tag)} · ${esc(project.year)}</p>
      <h2 class="panel__title">${esc(project.title)}</h2>
      <img class="poster" src="${poster}" alt="Lámina del proyecto ${esc(project.title)}" />
      <p class="panel__text">${esc(project.summary)}</p>
      ${tags}
      ${link}
    </div>
  `;
}

export function renderSkills(section) {
  const families = [...new Set(SKILLS.map((s) => s.family))];
  const blocks = families
    .map((family) => {
      const meters = SKILLS.filter((s) => s.family === family)
        .map(
          (s) => `
          <div class="meter">
            <div class="meter__head">
              <span class="meter__name">${esc(s.name)}</span>
              <span class="meter__rune">${esc(runeFor(s.name + s.family))}</span>
            </div>
            <div class="meter__track">
              <span class="meter__fill" style="right: ${(100 - s.level * 100).toFixed(1)}%"></span>
            </div>
          </div>`
        )
        .join('');
      return `<div><h3 class="group-title">${esc(family)}</h3>${meters}</div>`;
    })
    .join('');

  return `
    <div class="stagger">
      ${header(section)}
      <hr class="panel__rule" />
      ${blocks}
    </div>
  `;
}

export function renderSkill(skill, section) {
  return `
    <div class="stagger">
      <button class="back" type="button" data-back="skills">← Todas las runas</button>
      <p class="panel__kicker">${esc(skill.family)}</p>
      <h2 class="panel__title">${esc(skill.name)}</h2>
      <p class="panel__subtitle">Runa ${esc(skill.rune ?? runeFor(skill.name + skill.family))}</p>
      <div class="meter" style="margin-top: 28px">
        <div class="meter__track">
          <span class="meter__fill" style="right: ${(100 - skill.level * 100).toFixed(1)}%"></span>
        </div>
      </div>
      <p class="panel__lore">${esc(section.lore)}</p>
    </div>
  `;
}

export function renderExperience(section, focusIndex = -1) {
  // Se muestra de la etapa más reciente a la más antigua: es lo que se lee
  // primero en un currículo, aunque el camino en 3D se recorra al revés.
  const items = [...EXPERIENCE]
    .map((entry, i) => ({ entry, i }))
    .reverse()
    .map(
      ({ entry, i }) => `
        <li class="timeline__item"${i === focusIndex ? ' data-focus="true"' : ''}>
          <p class="timeline__period">${esc(entry.period)}</p>
          <h3 class="timeline__role">${esc(entry.role)}</h3>
          <p class="timeline__org">${esc(entry.org)}</p>
          <p class="timeline__detail">${esc(entry.detail)}</p>
        </li>`
    )
    .join('');

  return `
    <div class="stagger">
      ${header(section)}
      <hr class="panel__rule" />
      <ol class="timeline">${items}</ol>
    </div>
  `;
}

export function renderContact(section) {
  const channels = (CONTACT.links ?? [])
    .map((link) => {
      const disabled = !link.href;
      return `
        <li>
          <a class="channels__link" href="${esc(link.href ?? '#')}"
             ${disabled ? 'aria-disabled="true" tabindex="-1"' : 'target="_blank" rel="noopener noreferrer"'}>
            <span class="channels__label">${esc(link.label)}</span>
            <span class="channels__value">${esc(link.value)}</span>
          </a>
        </li>`;
    })
    .join('');

  return `
    <div class="stagger">
      ${header(section)}
      <hr class="panel__rule" />
      <p class="panel__text">${esc(CONTACT.intro)}</p>
      <ul class="channels">${channels}</ul>
      ${formularioContacto()}
    </div>
  `;
}
