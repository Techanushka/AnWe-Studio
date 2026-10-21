/** Guesses the language from a first transcription pass so the rest of the video can be locked to it. */
const STOP = {
  english: 'the and is to of you that it in for was this with are have not but they what we on be at'.split(' '),
  spanish: 'el la de que y en los se del las un por con no una su para es al lo como más pero'.split(' '),
  french: 'le la les des et est que pas une un du en pour dans qui sur au ce il elle nous vous'.split(' '),
  german: 'der die das und ist nicht ein eine zu den mit von sie ich es auf für auch dem'.split(' '),
  portuguese: 'o a os as de que e não um uma para com do da em se por mais como mas isso'.split(' '),
};

export function guessLanguage(text) {
  const letters = (text.match(/\p{L}/gu) || []).length;
  if (letters < 12) return null;
  const deva = (text.match(/[\u0900-\u097F]/g) || []).length;
  if (deva / letters > 0.5) return 'hindi';
  const latin = (text.match(/[A-Za-z\u00C0-\u017F]/g) || []).length;
  if (latin / letters < 0.8) return null; // Arabic/other scripts: leave to Whisper (Urdu/Persian look alike)

  const words = text.toLowerCase().match(/[\p{L}']+/gu) || [];
  if (words.length < 6) return null;
  const scores = Object.entries(STOP).map(([lang, list]) => {
    const set = new Set(list);
    return [lang, words.reduce((n, w) => n + (set.has(w) ? 1 : 0), 0)];
  }).sort((a, b) => b[1] - a[1]);
  const [best, second] = scores;
  return best[1] >= 3 && best[1] >= 1.5 * Math.max(1, second[1]) ? best[0] : null;
}
