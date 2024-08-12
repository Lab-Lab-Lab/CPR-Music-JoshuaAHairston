const template = JSON.parse(
  JSON.stringify({
    'score-partwise': {
      'part-list': {
        'score-part': [
          {
            'part-name': '',
            voiceMapping: { 0: [0] },
            staffMapping: [
              {
                mainVoiceIdx: 0,
                voices: [0],
                staffUuid: 'staffUuid',
              },
            ],
            voiceIdxToUuidMapping: {
              0: 'voiceUuid',
            },
            voiceUuidToIdxMapping: {
              voiceUuid: 0,
            },
            'part-abbreviation': '',
            'score-instrument': {
              'instrument-name': '',
              $id: 'P1-I1',
            },

            $id: 'P1',
            uuid: 'P1',
          },
        ],
      },
      part: [
        {
          measure: [
            {
              note: [],
              $number: '1',
              barline: {
                'bar-style': 'light-barline',
                noteBefore: -1,
              },
              attributes: [
                {
                  divisions: 0,
                  time: { beats: '4', 'beat-type': '4' },
                  clef: {},
                  key: {},
                  'staff-details': { 'staff-lines': '5' },
                },
              ],
              // sound: [],
              // direction: [],
            },
          ],
          $id: 'P1',
          uuid: 'P1',
        },
      ],
    },
  }),
);

/**
 * Takes a score and strips it of unnecessary properties, and rebuilds
 * according to spec (e.g., 2/4 -> 4/4, uuid's removed)
 *
 * @param {*} orig the original score from flat
 * @param {*} key the key; could omit and do this in the function, but it's even uglier code
 * @param {*} clef the clef; could also omit
 * @param {*} notes The student's motive (notes only), could omit
 * @param {*} div The orig divisions, again, could omit
 * @returns       the corrected score
 */
function correctScore(orig, key, clef, notes, div) {
  const origDupe = JSON.parse(JSON.stringify(orig));
  const result = JSON.parse(JSON.stringify(template));
  const resultScorePart =
    result['score-partwise']['part-list']['score-part'][0];
  const origScorePart =
    origDupe['score-partwise']['part-list']['score-part'][0];
  const resultAttributes =
    result['score-partwise'].part[0].measure[0].attributes[0];

  Object.keys(resultScorePart).forEach((keyItem) => {
    if (Object.hasOwn(origScorePart, keyItem) && keyItem !== 'uuid') {
      resultScorePart[keyItem] = origScorePart[keyItem];
    }
  });

  resultAttributes.clef = clef;
  resultAttributes.key = key;
  resultAttributes.divisions = `${div}`; // I think necessary for rendering
  result['score-partwise'].part[0].measure[0].note = [...notes];
  return result;
}

/**
 * Measures w/ harmonies/multiple voices in a single part caused
 * unpredictable results. this helper just removes any harmony.
 * Defaults to removing the note that has the 'chord' attribute
 * (the second of the two notes w/ equal timePos)
 *
 * @param {*} measure
 * @returns the given measure sans any harmonies
 */
function dropHarmony(measure) {
  const notes = JSON.parse(JSON.stringify(measure.note));
  const numNotes = notes.length;

  // removing w/ splice while iterating backwards is safe
  // idt using filter prototype would be simpler in this case
  for (
    let i = numNotes - 1, j = numNotes - 2;
    i > 0 && j >= 0;
    i -= 1, j -= 1
  ) {
    if (
      notes[i]['$adagio-location']?.timePos ===
      notes[j]['$adagio-location']?.timePos
    )
      notes.splice(i, 1);
  }

  return notes;
}

/**
 * rebuild given measure with attributes that are
 * more in line for CPR's spec
 *
 * Still necessary despite template approach being taken
 *
 * @param {*} measure measure to be corrected
 * @returns           corrected measure
 */
function correctMeasure(measure) {
  const defaultDiv = 2; // the default division, assuming shifts will be no less than 8th note
  const alteredMeasure = JSON.parse(JSON.stringify(measure)); // deep copy
  const origDivisions = alteredMeasure.attributes?.[0]?.divisions ?? 8; // the original division
  const beatDivision = defaultDiv / origDivisions; // conversion factor for reconstruction
  alteredMeasure.note = [...dropHarmony(alteredMeasure)];

  let modify = false;
  // check if reconstruction necessary
  if (
    Object.hasOwn(alteredMeasure, 'attributes') &&
    Array.isArray(alteredMeasure.attributes) &&
    alteredMeasure.attributes.length > 0
  ) {
    modify =
      origDivisions !== defaultDiv &&
      (alteredMeasure.attributes[0].divisions = defaultDiv);
  }

  // only modify if necessary
  if (modify) {
    alteredMeasure.note.forEach((note, i) => {
      alteredMeasure.note[i].timePos = Math.floor(
        note['$adagio-location'].timePos * beatDivision,
      );
      alteredMeasure.note[i].duration = Math.floor(
        note.duration * beatDivision,
      );
    });
  }
  // this is more out of an abundance of caution)
  alteredMeasure?.note?.forEach((note, i) => {
    alteredMeasure.note[i].isRest = Boolean(note.rest ?? false);
  });

  return alteredMeasure;
}

/**
 * given a measure, generate that measure's retrograde
 *
 * @param {*} orig the user-created measure
 * @returns        the measure in retrograde
 */
function mwRetrograde(orig) {
  const result = JSON.parse(JSON.stringify(orig));
  const origNotes = orig.note;
  const reversed = origNotes.reverse();

  reversed.forEach((note, i) => {
    let timePos = 0;
    reversed[i]['$adagio-location'] = { timePos };
    timePos += parseInt(note.duration, 10);
  });

  result.note = reversed;
  return result;
}

/**
 * Performs a rhythmic shift by eighths, wrapping shifted notes
 * back to measure start, coalescing notes that were split by
 * the shift and now adjacent
 *
 * @param {*} orig  the measure to shift
 * @param {*} shift number of eighths to shift by
 * @returns         shifted measure
 */
function mwRhythmicShift(orig, shift) {
  const measure = JSON.parse(JSON.stringify(orig));
  const numNotes = orig.note.length;

  const maxNotes =
    orig.attributes[0].time.beats * measure.attributes[0].divisions; // max # notes possible (restricted to 8ths)
  let pitchList = [...measure.note];

  // if student motive ends on eighths...
  const bypassAdj = shift > 1 && pitchList[pitchList.length - 1].duration === 1;
  // .. bypass shift adjustment for shifts by 2 & 3
  const adjShift = bypassAdj
    ? shift
    : Math.ceil(shift / measure.attributes[0].divisions);
  let checkList = pitchList.splice(numNotes - adjShift);

  const updateTimePos = (note) => {
    const n = JSON.parse(JSON.stringify(note));
    n.oPos = n['$adagio-location'].timePos; // original position
    n['$adagio-location'].timePos += shift; // perform the shift
    n.uPos = n['$adagio-location'].timePos;

    // timePos should be set according to whether note
    // is candidate for splitting
    n['$adagio-location'].timePos = checkList.includes(note)
      ? n.uPos - n.oPos - shift
      : n.uPos % maxNotes;

    return n;
  };
  pitchList = pitchList.map((n) => updateTimePos(n));
  checkList = checkList.map((n) => updateTimePos(n));

  checkList.forEach((note, i) => {
    if (note.duration > shift || note.uPos - maxNotes < 0) {
      const splitNote = JSON.parse(JSON.stringify(note));

      splitNote['$adagio-location'].timePos = splitNote.uPos;
      splitNote.duration -= 1;
      checkList[i].duration -= 1;
      checkList[i].split = true;

      pitchList.push(splitNote);
    }
  });

  // construct the final list of notes and update the measure
  pitchList = checkList.concat(pitchList);
  measure.note = pitchList;
  return measure;
}

/**
 * Performs a melodic shift by eighths on a given measure,
 * i.e., circular permutation
 * Note: rhythms remain the same, only *pitches* are
 *       shifted (as long as rests are not involved)
 *
 * @param {*} orig  the measure to shift
 * @param {*} shift amount of eighths to shift by
 * @returns         the shifted measure
 */
function mwMelodicShift(orig, shift) {
  const result = JSON.parse(JSON.stringify(orig));
  const pitchList = [];

  // push the correct attribute for this note
  // IMPORTANT: flat freaks out if a note has pitch and rest properties au même temps
  // for (const note of result.note) {
  //   pitchList.push(note.isRest ? note.rest : note.pitch);
  // }

  result.note.forEach((n) => {
    pitchList.push(n.isRest ? n.rest : n.pitch);
  });

  // move the first note to the end of the list, call it shiftList
  const shiftList = pitchList.splice(shift).concat(pitchList);

  result.note.forEach((n, i) => {
    const temp = shiftList.shift();
    const isPitch = Object.hasOwnProperty.call(temp, 'step');
    const which = isPitch ? 'pitch' : 'rest';

    if (isPitch === n.isRest) {
      delete result.note[i][isPitch ? 'rest' : 'pitch'];
      // delete n[isPitch ? 'rest' : 'pitch'];
      result.note[i][which] = temp;
      result.note[i].isRest = !isPitch;
    } else {
      // otherwise they're both pitches/both rests and no change is necessary
      result.note[i][isPitch ? 'pitch' : 'rest'] = temp;
    }
  });

  return result;
}

/**
 * Performs both melodic and rhythmic shift by eighths
 * on a given measure. See documentation for mwRhythmicShift()
 * and mwMelodicShift() for individual function details
 *
 * @param {*} orig  the measure to shift
 * @param {*} shift amount of eighths to shift by
 * @returns         the shifted measure
 */
function mwRhythmicMelodicShift(orig, shift) {
  let result = JSON.parse(JSON.stringify(orig));
  result = mwMelodicShift(result, shift);
  result = mwRhythmicShift(result, shift);
  return result;
}

/**
 * Takes a user-created motive and generates 10
 * variations:
 *  - retrograde     (1)
 *  - rhythmic shift (3)
 *  - melodic shift  (3)
 *  - both r + m     (3)
 * Then builds one score with all 10 variations + the user's
 * original motive
 *
 * @param {*} origStr String repr of the user-created motive
 * @returns           An 11 measure score with original motive
 *                    and 10 procedurally generated variations
 *                    on that motive
 */
function mwCreateVariations(origStr) {
  const orig = JSON.parse(origStr.slice());

  if (!orig || !Object.hasOwn(orig, 'score-partwise')) return null;

  const { key } = orig['score-partwise'].part[0].measure[0].attributes[0];
  const { clef } = orig['score-partwise'].part[0].measure[0].attributes[0];
  const divs =
    orig['score-partwise'].part[0].measure[0].attributes[0].divisions;
  const notes = orig['score-partwise'].part[0].measure[0].note;
  const correctedScore = correctScore(orig, key, clef, notes, divs); // correct the whole score
  const givenMeasure = correctedScore['score-partwise'].part[0].measure[0]; // grab the motive...
  const correctedMeasure = correctMeasure(givenMeasure); // ...then correct it

  const measures = [
    correctedMeasure,
    mwRetrograde(JSON.parse(JSON.stringify(correctedMeasure))),
    mwRhythmicShift(correctedMeasure, 1),
    mwRhythmicShift(correctedMeasure, 2),
    mwRhythmicShift(correctedMeasure, 3),
    mwMelodicShift(correctedMeasure, 1),
    mwMelodicShift(correctedMeasure, 2),
    mwMelodicShift(correctedMeasure, 3),
    mwRhythmicMelodicShift(correctedMeasure, 1),
    mwRhythmicMelodicShift(correctedMeasure, 2),
    mwRhythmicMelodicShift(correctedMeasure, 3),
  ];

  // ensure final measure has the correct type of barline
  measures[measures.length - 1].barline['bar-style'] = 'light-heavy';

  // const result = mwMergeVariations(correctedScore, measures);
  const result = JSON.parse(JSON.stringify(correctedScore));

  // merge all the variations into resulting score
  // was previously a function
  measures.forEach((measure, i) => {
    measure.note.forEach((note, j) => {
      measures[i].note[j].duration = note.duration.toString();
      measures[i].note[j].type = note.duration === '1' ? 'eighth' : 'quarter';
    });
  });
  result['score-partwise'].part[0].measure = [...measures];
  result['score-partwise']['part-list']['score-part'].uuid = 'variations';

  return result;
}

export {
  mwRetrograde,
  mwRhythmicShift,
  mwMelodicShift,
  mwRhythmicMelodicShift,
  mwCreateVariations,
  correctMeasure,
  correctScore,
};
