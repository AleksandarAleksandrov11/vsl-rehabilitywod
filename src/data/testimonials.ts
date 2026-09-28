/**
 * Testimonios reales de https://rehabilitywod.com/#testimonials.
 * `cita`: recorte aprobado (sin cambiar palabras). `completo`: texto íntegro con las tildes corregidas.
 */
export type Testimonial = {
  id: string;
  zona: string;
  nombre: string;
  descripcion: string;
  cita: string;
  completo: string[];
};

export const TESTIMONIALS: Testimonial[] = [
  {
    id: 'marian',
    zona: 'Hombro',
    nombre: 'Marian',
    descripcion: 'Dolor de hombro',
    cita: 'Después de varias consultas con fisios y seguimiento con traumatólogo sin ninguna mejoría… Ha sido el único profesional con el que he notado mejoría y he recuperado la movilidad en mi hombro.',
    completo: [
      'Después de varias consultas presenciales con fisios, seguimiento con traumatólogo y no conseguir ninguna mejoría, una compañera me habló de Gerard, al principio no estaba muy segura, pero ahora puedo decir que lo recomiendo 100%.',
      'Ha sido con el único profesional que he notado mejoría y he recuperado la movilidad en mi hombro. Siempre atento, cambiando las rutinas siempre que lo necesitaba, siempre me ha respondido a todas las dudas casi al instante, no puedo quejarme de nada y solo puedo darle las gracias.',
    ],
  },
  {
    id: 'leo',
    zona: 'Codo',
    nombre: 'Leo',
    descripcion: 'Epitrocleitis, más de un año',
    cita: 'Había probado muchos tratamientos y fisios, incluso infiltraciones, y el dolor no desaparecía. A día de hoy estoy entrenando con total normalidad sin dolor.',
    completo: [
      'Acudí a Gerard por una lesión en el codo (epitrocleitis) la cual llevaba sufriendo desde hacía más de un año. Había probado muchos tratamientos y fisios incluso infiltraciones y el dolor no desaparecía.',
      'Me puse en manos de Gerard y durante 4-5 meses no paró de asesorarme y guiarme cada día en cada sesión. La aplicación funciona súper bien y además Gerard te cuelga vídeos explicativos sobre los ejercicios. Antes de cada semana te explica cómo va a enfocar esa semana y las progresiones que vamos a hacer.',
      'A día de hoy estoy entrenando con total normalidad sin dolor y lo más importante, he aprendido a gestionar las cargas y a escuchar a mi cuerpo. Espero no tener que volver a ponerme en sus manos pero sin duda será mi primera opción.',
    ],
  },
  {
    id: 'eloy',
    zona: 'Rodilla',
    nombre: 'Eloy',
    descripcion: 'Condromalacia en ambas rodillas',
    cita: 'A pesar de ser todo online, el seguimiento y la cercanía han sido de 10. La mejora ha sido brutal y puedo volver a practicar CrossFit sin miedo a ningún movimiento.',
    completo: [
      'Después de casi un año con dolor en ambas rodillas y diagnosticado con condromalacia de grado 2 en ambas, decido ponerme en contacto con Gerard para probar otro tipo de rehabilitación.',
      'A pesar de ser todo online, el seguimiento y la cercanía que he recibido son de 10/10, poder compartir un feedback diario y ir notando la mejora día a día.',
      'Después de varios meses la mejora ha sido brutal y puedo volver a practicar el CrossFit sin miedo a ningún movimiento!',
    ],
  },
  {
    id: 'jose-maria',
    zona: 'Rodilla',
    nombre: 'Jose María',
    descripcion: 'Lesión de rodilla',
    cita: 'Es la mejor rehabilitación que he hecho nunca. Lo que más destaco es el compromiso, el feedback y la capacidad que tiene para conocerte y conocer tu lesión.',
    completo: [
      'Empecé a seguir a Gerard porque me gustaba su contenido. Me resolvió dudas sin ni siquiera estar con él. Desde el momento que me lesioné de la rodilla no dudé en ponerme en sus manos.',
      'Es la mejor rehabilitación que he hecho nunca. Ya no solo por los ejercicios (que también), lo que más puedo destacar es el compromiso tan grande, el feedback tan bueno que siempre me ha dado y sobre todo, la capacidad que tiene para conocerte y conocer tu lesión.',
      'Espero no volver a lesionarme, pero si lo hago, volveré sin duda a confiar en él.',
    ],
  },
  {
    id: 'ingrid',
    zona: 'Rodilla',
    nombre: 'Ingrid',
    descripcion: 'Diez meses con dolor',
    cita: 'Gerard me ayudó a entender mi lesión y a gestionar el dolor, las cargas y la intensidad. Mi rodilla ha recuperado su funcionalidad y puedo volver a entrenar sin dolor.',
    completo: [
      'Llevaba unos diez meses aprox. con un dolor en la rodilla que cada vez me impedía poder entrenar con normalidad y me afectaba ya en el día a día. Gerard me ayudó a entender mi lesión, a saber gestionar el dolor, las cargas, la intensidad… todo.',
      'El seguimiento es a diario, cualquier duda era resuelta enseguida y las sesiones se iban adaptando a mi progreso y sensaciones. Me he sentido súper acompañada en todo momento y en momentos en los que la motivación fallaba él estaba allí para animarme y ayudarme a entender lo que pasaba.',
      'Ha sido un camino duro pero que no habría conseguido sin su ayuda. Recomendaré siempre su servicio, ahora mi rodilla ha recuperado su funcionalidad y puedo volver a entrenar sin dolor.',
    ],
  },
  {
    id: 'sergio',
    zona: 'Hombro',
    nombre: 'Sergio',
    descripcion: 'Dolor de hombro en overhead',
    cita: 'No podía hacer ningún ejercicio con el brazo por encima de la cabeza. Poco a poco fui mejorando hasta no sentir nada de dolor y volver a entrenar con normalidad.',
    completo: [
      'Después de varias semanas con dolor en el hombro que me impedían hacer cualquier ejercicio donde tuviera que levantar el brazo por encima de la cabeza, decidí contactar con RehabilityWOD para ponerle solución. Desde el primer momento, Gerard me transmitió mucha confianza y profesionalidad.',
      'He de decir que no se trata de arte de magia (hay que sacrificarse un tiempo haciendo los ejercicios que te mandan y adaptar los entrenos), pero aunque parezca muy complicado, la aplicación que se utiliza es muy sencilla y, además, Gerard aún lo facilita más con todos los vídeos explicativos y cuestionarios diarios. También cabe decir que cualquier duda, siempre estuve en contacto con él vía app o WhatsApp, lo cual aún hace más cercano el trato.',
      'Poco a poco fui notando mejoras (con alguna que otra recaída que ya me avisó de que iban a suceder y que eran de lo más normal) hasta llegar al punto de no sentir nada de dolor y volver a entrenar con normalidad.',
      'En resumen, Gerard es un gran profesional, y durante todo el proceso tuvo una implicación diaria total. Fue la mejor decisión que tomé y no puedo estar más agradecido con él y su servicio.',
    ],
  },
];
