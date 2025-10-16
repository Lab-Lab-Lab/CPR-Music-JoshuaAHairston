// with thanks to https://medium.com/front-end-weekly/recording-audio-in-mp3-using-reactjs-under-5-minutes-5e960defaf10

import { Sampler, Recorder as toneRecorder, getDestination, loaded, start  } from "tone";
import { WebMidi } from "webmidi";
import MicRecorder from 'mic-recorder-to-mp3';
import { useEffect, useRef, useState, useCallback } from 'react';
import Button from 'react-bootstrap/Button';
import {
  FaMicrophone,
  FaStop,
  FaCloudUploadAlt,
  FaSpinner,
  FaTimesCircle,
  FaCheck,
  FaPlay,
  FaPause,
  FaVolumeOff,
  FaVolumeMute,
  FaVolumeDown,
  FaVolumeUp,
  FaRegTrashAlt,
} from 'react-icons/fa';
import { useDispatch, useSelector } from 'react-redux';
import ListGroup from 'react-bootstrap/ListGroup';
import ListGroupItem from 'react-bootstrap/ListGroupItem';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import { useRouter } from 'next/router';
import WaveSurfer from 'wavesurfer.js';
import { UploadStatusEnum } from '../types';
import StatusIndicator from './statusIndicator';
import styles from '../styles/recorder.module.css';
function Config({ RecordingTypeChanged, value }) {
  return (
    <label>
      Pick recording type:
      <select value={value} onChange={RecordingTypeChanged}>
        <option value="mic">Mic</option>
        <option value="midi">Midi</option>
        <option value="keyboard">Keyboard</option>
      </select>
    </label>
  );
}
function AudioViewer({ src }) {
  const containerW = useRef(null);
  const waveSurf = useRef(null);
  const volume = useRef(null);
  let vMute;
  let vOff;
  let vDown;
  let vUp;
  const play = <FaPlay style={{ paddingLeft: '2px' }} />;
  const pause = <FaPause />;
  const [playing, setPlay] = useState(play);
  const [volumeIndex, changeVolume] = useState(null);

  const toggleVolume = useCallback(() => {
    if (volume.current) {
      const volumeValue = parseFloat(volume.current.value);
      if (volumeValue !== 0) {
        volume.current.value = 0;
        waveSurf.current.setVolume(volume.current.value);
        volume.current.style.setProperty('--volumePercent', `${0}%`);
        changeVolume(vMute);
      } else {
        volume.current.value = 1;
        waveSurf.current.setVolume(volume.current.value);
        volume.current.style.setProperty('--volumePercent', `${100}%`);
        changeVolume(vUp);
      }
    }
  }, []);

  const playPause = useCallback(() => {
    if (waveSurf.current.isPlaying()) {
      setPlay(play);
      waveSurf.current.pause();
    } else {
      setPlay(pause);
      waveSurf.current.play();
    }
  }, []);

  function handleVolumeChange() {
    waveSurf.current.setVolume(volume.current.value);
    const volumeNum = volume.current.value * 100;
    volume.current.style.setProperty('--volumePercent', `${volumeNum}%`);
    if (volume.current.value === 0) {
      changeVolume(vMute);
    } else if (volume.current.value < 0.25) {
      changeVolume(vOff);
    } else if (volume.current.value < 0.5) {
      changeVolume(vDown);
    } else if (volume.current.value < 0.75) {
      changeVolume(vUp);
    }
  }

  vMute = (
    <FaVolumeMute
      style={{
        width: '1.05em',
        height: '1.05em',
        cursor: 'pointer',
        color: 'red',
        paddingLeft: '2px',
      }}
      onClick={toggleVolume}
    />
  );
  vOff = (
    <FaVolumeOff
      style={{ cursor: 'pointer', paddingRight: '9px' }}
      onClick={toggleVolume}
    />
  );
  vDown = (
    <FaVolumeDown
      style={{ cursor: 'pointer', paddingRight: '3px' }}
      onClick={toggleVolume}
    />
  );
  vUp = (
    <FaVolumeUp
      style={{
        width: '1.23em',
        height: '1.23em',
        cursor: 'pointer',
        paddingLeft: '3px',
      }}
      onClick={toggleVolume}
    />
  );

  useEffect(() => {
    changeVolume(vUp);
    if (containerW.current && !waveSurf.current) {
      waveSurf.current = WaveSurfer.create({
        container: containerW.current,
        waveColor: 'blue',
        progressColor: 'purple',
        barWidth: 3,
        barHeight: 0.5,
        barRadius: 3,
        cursorWidth: 3,
        height: 200,
        barGap: 3,
        dragToSeek: true,
        // plugins:[
        //   WaveSurferRegions.create({maxLength: 60}),
        //   WaveSurferTimeLinePlugin.create({container: containerT.current})
        // ]
      });
      if (waveSurf.current) {
        waveSurf.current.load(src);
      }
      if (volume.current && waveSurf.current) {
        waveSurf.current.setVolume(volume.current.value);
        volume.current.addEventListener('input', handleVolumeChange);
      }
    }
  }, []);

  if (waveSurf.current) {
    waveSurf.current.on('finish', () => {
      setPlay(play);
    });
  }

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        margin: '0 1rem 0 1rem',
      }}
    >
      <div
        className={styles.waveContainer}
        ref={containerW}
        style={{ width: '100%' }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Button
          style={{
            marginRight: '1rem',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            padding: '0',
          }}
          onClick={playPause}
        >
          {playing}
        </Button>
        <input
          className={styles.slider}
          style={{ marginRight: '1.5rem' }}
          ref={volume}
          type="range"
          min="0"
          max="1"
          step="0.01"
          defaultValue="1"
        />
        {volumeIndex}
      </div>
    </div>
  );
}

export default function Recorder({ submit, accompaniment }) {
  // const Mp3Recorder = new MicRecorder({ bitRate: 128 }); // 128 is default already
  const [isRecording, setIsRecording] = useState(false);
  const [blobURL, setBlobURL] = useState('');
  const [blobData, setBlobData] = useState();
  const [blobInfo, setBlobInfo] = useState([]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [recorder, setRecorder] = useState(new MicRecorder());
  const dispatch = useDispatch();
  const [min, setMinute] = useState(0);
  const [sec, setSecond] = useState(0);
  const [isSamplerLoaded, setSamplerLoaded] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const tRecorder = useRef(null);
  const sampler = useRef(null);
  const webmidiInput = useRef(null);
  const accompanimentRef = useRef(null);
  const router = useRouter();
  const { slug, piece, actCategory, partType } = router.query;
  const [recordingType, setRecordingType] = useState("mic");
  const handleRecordingTypeChange = useCallback((e) => {
    const value = e.target.value;
    setRecordingType(value);
  });

  useEffect(() => {
    setBlobInfo([]);
    setBlobURL('');
    setBlobData();
  }, [partType]);

  function onEnabled() {
    
    if (WebMidi.inputs.length < 1 && recordingType == "midi") {
      console.error('tried to give permission, but no inputs')
    } else {
      console.log("else statement");
      setHasPermission(true);
      console.log(hasPermission);
      WebMidi.inputs.forEach((device, index) => {
        console.log(device.name);
        console.log(index);
      });
      webmidiInput.current = WebMidi.inputs[0]; // FIXME: we need to list the inputs from the loop above in the config ui so the user can select their thing
      webmidiInput.current.channels[1].addListener("noteon", onNote);
    }
  }


  async function enableMidiTone() {
    await WebMidi.enable().catch((err) => {
      alert(err);
      return;
    })
    console.log("before start");
    await start();
    onEnabled();
  }

  function onNote(e) {
    const accidental = e.note.accidental
    let note = e.note.name;
    if (accidental != undefined) {
      note += e.note.accidental;
    }
    note += e.note.octave;
    console.log(e);
    // sampler.current.triggerAttackRelease(note, 4);
    console.log(hasPermission);
    // if(hasPermission === true) {
    console.log("Hello permission is true");
    loaded().then(() => {
      sampler.current.triggerAttackRelease(note, 4);
    });  
    // }
   
  }



  const startRecording = (ev) => {
    if (isBlocked) {
      console.error('cannot record, microphone permissions are blocked');
    } else if(recordingType == "mic") {
      //TODO make a prompt for the user to select if they are using midi or an instrument
      accompanimentRef.current.play();
      recorder
        .start()
        .then(() => {
          setIsRecording(true);
        })
        .catch((err) => console.error('problem starting recording', err));
    } else {
      accompanimentRef.current.play();
      tRecorder.current.start().then(() => {
        setIsRecording(true);
      })
        .catch((err) => console.error('problem starting recording midi/keyboard'));
    }
  };

  const stopRecording = (ev) => {
    accompanimentRef.current.pause();
    accompanimentRef.current.load();
    if (recordingType === "mic") {

      recorder
        .stop()
        .getMp3()
        .then(([buffer, blob]) => {
          setBlobData(blob);
          const url = URL.createObjectURL(blob);
          setBlobURL(url);
          setBlobInfo([
            ...blobInfo,
            {
              url,
              data: blob,
            },
          ]);
          setIsRecording(false);
        })
        .catch((e) => console.error('error stopping recording', e));

    } else {
      tRecorder.current.stop()
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          setBlobData(blob);
          setBlobURL(url);
          setBlobInfo([
            ...blobInfo,
            {
              url,
              data: blob,
            },
          ]);
          // a.href = url;
          // a.textContent = "Listen to recording";
          // a.download = "test.ogg"
          // document.body.appendChild(a);
          setIsRecording(false);
        })
        .catch((e) => console.error('error stopping recording midi/keyboard'))
    }
  };

  const submitRecording = (i, submissionId) => {
    const formData = new FormData(); // TODO: make filename reflect assignment
    formData.append(
      'file',
      new File([blobInfo[i].data], 'student-recoding.mp3', {
        mimeType: 'audio/mpeg',
      }),
    );
    // dispatch(submit({ audio: formData }));
    submit({ audio: formData, submissionId });
  };

  function deleteTake(index) {
    const newInfo = blobInfo.slice();
    newInfo.splice(index, 1);
    setBlobInfo(newInfo);
  }
  // Start of integration
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
  // check for recording permissions
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      navigator &&
      navigator.mediaDevices.getUserMedia
    ) {
      navigator.mediaDevices
        .getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false },
        })
        .then(() => {
          setIsBlocked(false);
        })
        .catch(() => {
          console.log('Permission Denied');
          setIsBlocked(true);
        });
    }
    const handleKeyDown = (event) => {
      console.log("Key pressed:", event.key);
      if (event.key in keyboardMap) {
        onNote(keyboardMap[event.key]); 
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    tRecorder.current = new toneRecorder();
    getDestination().connect(tRecorder.current);

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
  }, []);

  useEffect(() => {
    let interval = null;
    if (isRecording) {
      interval = setInterval(() => {
        setSecond(sec + 1);
        if (sec === 59) {
          setMinute(min + 1);
          setSecond(0);
        }
        if (min === 99) {
          setMinute(0);
          setSecond(0);
        }
      }, 1000);
    } else if (!isRecording && sec !== 0) {
      setMinute(0);
      setSecond(0);
      clearInterval(interval);
    }
    return () => {
      clearInterval(interval);
    };
  }, [isRecording, sec]);

  return (
    <>
      <Row>
        <Col>
          {isRecording ? (
            <Button onClick={stopRecording}>
              <FaStop /> {String(min).padStart(2, '0')}:
              {String(sec).padStart(2, '0')}
            </Button>
          ) : (
              <>
                {recordingType === "mic" ? (
                  <>
                  <Button onClick={startRecording}> {/*idk about the disabled here */}
                  <FaMicrophone />
                  </Button>
                  <Config RecordingTypeChanged={handleRecordingTypeChange} value={recordingType}></Config>
                  </>
                ) : (
                  <>
                    <Button onClick={startRecording} disabled={!hasPermission} > {/*idk about the disabled here */}
                    <FaMicrophone />
                    </Button>
                    <Button disabled={!isSamplerLoaded} onClick={enableMidiTone}>Enable Midi or Keyboard</Button>
                    <Config RecordingTypeChanged={handleRecordingTypeChange} value={recordingType}></Config>
                  </>
 
                )}
               
              </>
          )}
        </Col>
      </Row>
      <Row>
        <Col>
          {/* <StatusIndicator statusId={`recording-take-test`} /> */}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={accompanimentRef}>
            <source src={accompaniment} type="audio/mpeg" />
          </audio>
          {blobInfo.length === 0 ? (
            <span>No takes yet. Click the microphone icon to record.</span>
          ) : (
            <ListGroup as="ol" numbered>
              {blobInfo.map((take, i) => (
                <ListGroupItem
                  key={take.url}
                  as="li"
                  className="d-flex justify-content-between align-items-start"
                  style={{ fontSize: '1.5rem' }}
                >
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  {/* <audio
                    style={{ height: '2.25rem' }}
                    src={take.url}
                    controls
                  /> */}
                  <AudioViewer src={take.url} />
                  <div>
                    <Button
                      onClick={() => submitRecording(i, `recording-take-${i}`)}
                    >
                      <FaCloudUploadAlt />
                    </Button>
                    <Button onClick={() => deleteTake(i)}>
                      <FaRegTrashAlt />
                    </Button>
                  </div>
                  <div className="minWidth">
                    <StatusIndicator statusId={`recording-take-${i}`} />
                  </div>
                </ListGroupItem>
              ))}
            </ListGroup>
          )}
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={blobURL} />
        </Col>
      </Row>
    </>
  );
}
