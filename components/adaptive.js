import Button from 'react-bootstrap/Button'
// tone doesn't have named exports
import { Sampler, Recorder, getDestination, loaded, start  } from "tone";
import { WebMidi } from "webmidi";
import { useState, useEffect, useRef } from 'react';


function Adpative() {
  const recorder = useRef(null);
  const sampler = useRef(null);
  const [isSamplerLoaded, setSamplerLoaded] = useState(false);
  // const [isToneLoaded, setToneLoaded] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  // https://github.com/Tonejs/Tone.js/wiki/Using-Tone.js-with-React-React-Typescript-or-Vue
  // https://dev.to/ericsonwillians/ive-built-my-own-synthesizer-using-tonejs-and-react-293f

  const webmidiInput = useRef(null)

  useEffect(() => {
    const handleKeyDown = (event) => {
        console.log("Key pressed:", event.key);
      if (event.key in keyboardMap) {
        onNote(keyboardMap[event.key]); 
        }
      }
    window.addEventListener("keydown", handleKeyDown);
    recorder.current = new Recorder();
    getDestination().connect(recorder.current);

    sampler.current = new Sampler({

      C5: "/audio/viola_c5.wav",
      A4: "/audio/viola_a4.wav",
      B4: "/audio/viola_b4.wav",
      D4: "/audio/viola_d4.wav",
      E4: "/audio/viola_e4.wav",
      F4: "/audio/viola_f4.wav",
      G4: "/audio/viola_g4.wav",
    }, {
      onload: () => {
        setSamplerLoaded(true);
      }
    }).toDestination();
    return () => window.removeEventListener("keydown", handleKeyDown);
  },[]);

  const keyboardMap = {
  'a': {
    qwerty: 'a',
    note: {
      name: 'C',
      octave: 4,
      accidental: undefined,
    }
  },
  'w': {
    qwerty: 'w',
    note: {
      name: 'C',
      octave: 4,
      accidental: '#',
    }
  },
  's': {
    qwerty: 's',
    note: {
      name: 'D',
      octave: 4,
      accidental: undefined,
    }
  },
  'e': {
    qwerty: 'e',
    note: {
      name: 'D',
      octave: 4,
      accidental: '#',
    }
  },
  'd': {
    qwerty: 'd',
    note: {
      name: 'E',
      octave: 4,
      accidental: undefined,
    }
  },
  'f': {
    qwerty: 'f',
    note: {
      name: 'F',
      octave: 4,
      accidental: undefined,
    }
  },
  't': {
    qwerty: 't',
    note: {
      name: 'F',
      octave: 4,
      accidental: '#',
    }
  },
  'g': {
    qwerty: 'g',
    note: {
      name: 'G',
      octave: 4,
      accidental: undefined,
    }
  },

  'y': {
    qwerty: 'y',
    note: {
      name: 'G',
      octave: 4,
      accidental: '#',
    }
  },
  'h': {
    qwerty: 'h',
    note: {
      name: 'A',
      octave: 4,
      accidental: undefined,
    }
  },
  'u': {
    qwerty: 'u',
    note: {
      name: 'A',
      octave: 4,
      accidental: '#',
    }
  },
  'j': {
    qwerty: 'j',
    note: {
      name: 'B',
      octave: 4,
      accidental: undefined,
    }
  },
  'k': {
    qwerty: 'k',
    note: {
      name: 'C',
      octave: 5,
      accidental: undefined,
    }
  },

}
  function onEnabled() {
    
    if (WebMidi.inputs.length < 1) {
      console.error('tried to give permission, but no inputs')
    } else {
      setHasPermission(true);
    WebMidi.inputs.forEach((device, index) => {
      console.log(device.name);
      console.log(index);
    });
     webmidiInput.current = WebMidi.inputs[0]; // FIXME: we need to list the inputs from the loop above in the config ui so the user can select their thing
      webmidiInput.current.channels[1].addListener("noteon", onNote);

  }

}
  //TODO: Have the 
  function onNote(e) {
  const accidental = e.note.accidental
  let note = e.note.name;
  if (accidental != undefined) {
    note += e.note.accidental;
  }
  note += e.note.octave;
  console.log(e);
    // sampler.current.triggerAttackRelease(note, 4);

    loaded().then(() => {
    sampler.current.triggerAttackRelease(note, 4);
  });
}

  
  async function enableEverything() {
     // TODO: We will tell the user to plug in the 
     await WebMidi.enable().catch((err) => {
       console.log("error");
      alert(err);
      return;
  });
    await start();
    
  onEnabled();
    
  }

  return (
    <>
      <Button variant="primary" disabled={!isSamplerLoaded} onClick={enableEverything}>start</Button>
      <Button variant="primary" disabled={!hasPermission}> Start Recording</Button>
      <Button variant="primary">End Recording</Button>
    </>
  );
}




export default Adpative;