/**
 * Estaciones.
 *
 * Una capa que MULTIPLICA sobre el momento del día, no una paleta paralela.
 * Cuatro momentos por cuatro estaciones son dieciséis combinaciones, y
 * escribirlas a mano sería dieciséis paletas que se desincronizan a la primera
 * corrección; como capa se escriben cuatro y cuatro, y las dieciséis salen
 * solas. Lo que aporta cada una es poco a propósito: tinte de hoja, tinte de
 * hierba, calidez de la tierra, cuánta flor y cuánta bruma.
 *
 * El VERANO es el neutro —todos los multiplicadores a 1— y eso no es pereza:
 * la isla que ya existía está calibrada contra fotos de referencia, medida
 * banda a banda. Haciendo del verano el neutro, ninguna de esas medidas se
 * toca y cada estación queda definida por lo que se aparta de ella, que es
 * además como se puede juzgar si una está pasada de mano.
 *
 * NO hay nieve ni rama desnuda, y es una decisión, no una tarea pendiente:
 *
 *  - La rama desnuda cambia el número de tarjetas de copa, o sea reconstruir
 *    el bosque entero al cambiar de estación.
 *  - El suelo blanco se come los megalitos. Todo este portafolio va de que la
 *    piedra se lea contra el fondo, y granito gris sobre nieve pierde el
 *    contraste justo donde está el contenido.
 *
 * El invierno de aquí es atlántico: luz baja, bruma espesa, hierba parda y
 * hoja apagada. Que resulta ser, además, el invierno que ven los megalitos de
 * verdad.
 */

/**
 * Las cuatro, como multiplicadores sobre el verano.
 *
 * OJO CON LAS UNIDADES, que es la misma trampa que documenta `TimeOfDay`:
 * estos números operan sobre color LINEAL y el fotograma se codifica a sRGB
 * después, así que lo que se ve en pantalla es la raíz 2,2 de lo que se
 * escribe aquí. Un 0,80 se ve como un 0,90 — la mitad de lo que uno cree. Por
 * eso los apagados son más bajos de lo que parecería sensato leyéndolos.
 */
export const ESTACIONES = [
  {
    id: 'primavera',
    label: 'Primavera',
    // Verde nuevo: más claro y con menos azul que el de julio. La hoja tierna
    // es amarillenta antes de ser verde, no una versión pálida del verde.
    //
    // Es la estación más floja de las cuatro, y no por falta de mano: medido,
    // mueve la imagen un 1,8 % frente al 3,7 % del otoño. Tiene sentido — la
    // primavera de verdad tampoco se distingue de un julio a doscientos metros
    // de distancia. Lo suyo son las flores, y las flores están en la hierba,
    // que a la altura de la órbita el LOD ya ha borrado. Se ve al bajar a pie.
    hoja: [1.12, 1.22, 0.62],
    hierba: [1.05, 1.20, 0.62],
    tierra: [1.05, 1.12, 0.74],
    // La flor es lo que hace la primavera. Es el único parámetro que sube por
    // encima de 1 en toda la tabla.
    flor: 1.6,
    seco: 0,
    bruma: 1.0,
  },
  {
    id: 'verano',
    label: 'Verano',
    // El neutro. No se toca: es la isla calibrada.
    hoja: [1, 1, 1],
    hierba: [1, 1, 1],
    tierra: [1, 1, 1],
    flor: 1,
    seco: 0,
    bruma: 1.0,
  },
  {
    id: 'otono',
    label: 'Otoño',
    // El oro pide subir el rojo POR ENCIMA del verde, no solo quitar azul. La
    // primera versión llevaba [1.22, 1.02, 0.40] pensando que bastaba con
    // vaciar el azul, y en pantalla no pasaba nada: un verde apenas tiene azul
    // que quitar, así que el canal dominante seguía siendo el verde y la copa
    // seguía siendo una copa verde un poco sucia. Medido: 0,49 % de imagen
    // movida, por debajo del ruido de la propia hierba ondeando.
    hoja: [1.85, 1.00, 0.32],
    hierba: [1.50, 0.88, 0.42],
    // Y la tierra tiene que virar con ella. También se quedó corta al
    // principio, por el mismo motivo y con más razón: el verde del suelo es
    // más saturado que el de la hoja, así que aquí hay que CORTAR el verde,
    // no solo empujar el rojo. Con [1.06, 1.0, 0.92] el prado se quedaba en
    // julio debajo de un bosque de octubre.
    //
    // Y no es un detalle de acabado: desde la órbita el LOD ha borrado casi
    // toda la hierba instanciada, así que el suelo que se ve ES el terreno.
    // La mitad de la estación entra por aquí.
    tierra: [1.42, 0.82, 0.52],
    flor: 0.3,
    seco: 0.22,
    bruma: 1.2,
  },
  {
    id: 'invierno',
    label: 'Invierno',
    // Aquí manda `seco`, no el tinte: lo que hace el invierno es que a la
    // vegetación le falte croma, y eso un multiplicador no lo sabe hacer.
    // Medido, el suelo pasa de (70, 118, 68) a (100, 105, 90): los tres canales
    // casi juntos, o sea gris pardo. Eso lo hace `seco`, no estos números.
    hoja: [1.10, 0.78, 0.72],
    hierba: [1.15, 0.82, 0.72],
    tierra: [1.15, 0.86, 0.80],
    flor: 0,
    seco: 0.70,
    // Bruma espesa: es la mitad del invierno atlántico y encima tapa el fondo,
    // que es donde está el bosque — el invierno sale más barato de dibujar.
    bruma: 1.5,
  },
];

/** Ids y etiquetas, para la barra. */
export const ESTACION_IDS = ESTACIONES.map((e) => e.id);

/**
 * Husos del hemisferio sur.
 *
 * Lista corta y a mano. No hay forma de sacar la latitud del navegador sin
 * pedirle permiso de ubicación a alguien que acaba de entrar a ver un
 * portafolio, y eso cuesta muchísimo más de lo que vale acertar la estación.
 * Con el huso se acierta en la enorme mayoría de los casos y no se pregunta
 * nada.
 *
 * Los husos del sur que además son tropicales —Lima, La Paz, Recife— NO están
 * aquí sino en `TROPICO`, que se consulta antes: para ellos el hemisferio da
 * igual porque no tienen estaciones que invertir.
 */
const SUR =
  /^(Australia\/|Antarctica\/|America\/Argentina\/|Indian\/(Kerguelen|Mauritius|Reunion)|Atlantic\/Stanley|Pacific\/(Auckland|Chatham|Norfolk|Tongatapu|Apia|Noumea)|America\/(Santiago|Punta_Arenas|Montevideo|Asuncion|Sao_Paulo|Bahia|Campo_Grande|Cuiaba)$|Africa\/(Johannesburg|Windhoek|Harare|Maputo|Lusaka|Gaborone|Maseru|Mbabane)$)/;

/**
 * Husos donde no hay estaciones que valgan.
 *
 * Entre los trópicos el año no va de hoja y nieve sino de seco y lluvias, y
 * ponerle otoño a alguien de Bogotá un martes de veinte grados no es un
 * detalle bonito: es equivocarse con confianza. Para estos husos la función
 * devuelve `null` —no «verano»— y quien llama decide: la isla arranca en el
 * neutro y la barra no señala ninguna como suya, porque ninguna lo es.
 *
 * Aquí está, entre otros, el huso de casa.
 */
const TROPICO =
  /^(America\/(Bogota|Lima|Caracas|Guayaquil|Panama|Costa_Rica|Guatemala|El_Salvador|Tegucigalpa|Managua|Santo_Domingo|Port-au-Prince|Puerto_Rico|Jamaica|Mexico_City|Merida|Manaus|Belem|Recife|Fortaleza|La_Paz|Paramaribo|Guyana|Cayenne)|Asia\/(Bangkok|Jakarta|Singapore|Manila|Kuala_Lumpur|Ho_Chi_Minh|Phnom_Penh|Vientiane|Yangon|Colombo|Kolkata|Dhaka)|Africa\/(Lagos|Nairobi|Accra|Kinshasa|Addis_Ababa|Dar_es_Salaam|Kampala|Abidjan|Dakar|Douala|Khartoum)|Pacific\/(Honolulu|Port_Moresby|Guadalcanal|Fiji))$/;

/** @returns {string} El huso del visitante, o cadena vacía si no se puede saber. */
function huso() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/**
 * Qué estación le toca a quien mira.
 *
 * Los cortes van al día 21 de marzo, junio, septiembre y diciembre. Los
 * equinoccios y solsticios reales bailan un par de días de un año a otro y
 * calcularlos pediría efemérides, para ganar cuarenta y ocho horas de
 * precisión en un portafolio.
 *
 * Y hay una diferencia importante con `faseDeLaHora`, que conviene no perder
 * de vista: la hora del día la tiene todo el mundo, la estación no. Por eso
 * esto acierta menos y por eso el selector de la barra no es un adorno sino
 * la respuesta de verdad — aquí solo se elige por dónde empezar.
 *
 * De ahí el `null`: entre los trópicos no es que la estación sea difícil de
 * calcular, es que no existe. Devolver «verano» ahí sería mentir con un dato
 * que parece medido, y quien lo llame trata el null como quiera — la isla
 * arranca en el neutro y la barra no marca ninguna como suya.
 *
 * @param {Date} fecha
 * @param {string} [zona]  El huso, inyectable para poder probarlo.
 * @returns {string|null} id de estación, o null si ahí no hay estaciones.
 */
export function estacionDeLaFecha(fecha = new Date(), zona = huso()) {
  if (TROPICO.test(zona)) return null;

  // Del mes al cuadrante, corriendo el mes uno si ya se pasó el día 21.
  // Marzo 21 cae en 3, diciembre 21 en 12; dividir entre tres y coger el resto
  // reparte los doce en las cuatro estaciones sin una sola comparación.
  const k = fecha.getMonth() + (fecha.getDate() >= 21 ? 1 : 0);
  const norte = ['invierno', 'primavera', 'verano', 'otono'][Math.floor(k / 3) % 4];
  if (!SUR.test(zona)) return norte;

  // El sur va medio año desfasado: dos cuadrantes.
  const i = ESTACION_IDS.indexOf(norte);
  return ESTACION_IDS[(i + 2) % 4];
}
