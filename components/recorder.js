'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FaEdit, FaStop, FaMicrophone, FaRegTrashAlt } from 'react-icons/fa';
import { BiRename } from 'react-icons/bi';
import {
  Card,
  Form,
  Button,
  ListGroup,
  ListGroupItem,
  Row,
  Col,
} from 'react-bootstrap';
import { useRouter } from 'next/router';
import { useDispatch } from 'react-redux';
import {
  useAudio,
  useRecording,
  useFFmpeg,
  useUI,
  useEffects,
  useMultitrack,
} from '../contexts/DAWProvider';
import DAW from './audio/DAW';
import { AudioDropModal } from './audio/silenceDetect';
import { catchSilence, setupAudioContext } from '../lib/dawUtils';
import StatusIndicator from './statusIndicator';
import styles from '../styles/recorder.module.css';
import { getInstrumentConfigurations, mutateInstrumentConfiguration, createInstrumentConfiguration } from "../api";

// Create a silent audio buffer as scratch audio to initialize wavesurfer
const createSilentAudio = () => {
  if (typeof window === 'undefined') return '';

  try {
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const buffer = audioContext.createBuffer(
      1,
      audioContext.sampleRate * 0.1,
      audioContext.sampleRate,
    );
    const arrayBuffer = new ArrayBuffer(44 + buffer.length * 2);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + buffer.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, audioContext.sampleRate, true);
    view.setUint32(28, audioContext.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, buffer.length * 2, true);

    const channelData = buffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }

    const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error('Error creating silent audio:', e);
    return '';
  }
};

const scratchURL = createSilentAudio();

export default function RecorderRefactored({ submit, accompaniment, logOperation = null }) {
  const dispatch = useDispatch();
  const router = useRouter();
  const { slug, piece, actCategory, partType } = router.query;

  // Context hooks
  const { audioURL, setAudioURL, audioRef, addToEditHistory, clearHistory } = useAudio();

  const {
    isRecording,
    setIsRecording,
    isBlocked,
    setIsBlocked,
    mediaRecorder,
    setMediaRecorder,
    mimeType,
    setMimeType,
    recordingTime,
    setRecordingTime,
    takeNo,
    setTakeNo,
    activeTakeNo,
    setActiveTakeNo,
    blobInfo,
    setBlobInfo,
    blobURL,
    setBlobURL,
    blobData,
    setBlobData,
    chunksRef,
    accompanimentRef,
    silenceData,
    setSilenceData,
    ignoreSilence,
    setIgnoreSilence,
    showAudioDrop,
    setShowAudioDrop,
    getSupportedMimeType,
    addTake,
    deleteTake,
    clearRecordingData,
    isRecordingToTrack,
    setupTrackRecording,
    clearTrackRecording,
  } = useRecording();

  const { ffmpegRef, loaded: ffmpegLoaded } = useFFmpeg();
  const { showDAW, setShowDAW } = useUI();
  const { setFilters } = useEffects();
  const { tracks, setTrackAudio, updateTrack } = useMultitrack();

  // Track blob changes for multitrack recording
  const prevBlobURLRef = useRef(null);
  const prevIsRecordingRef = useRef(false);

  // Keep track of processed takes to avoid duplicates
  const processedTakesRef = useRef(new Set());

  // Fixed recording completion effect - apply recording to armed track
  useEffect(() => {
    // Detect when we've just stopped recording (transition from recording to not recording)
    const justStoppedRecording = prevIsRecordingRef.current && !isRecording;

    // Detect when we have a new blob URL
    const hasNewBlob = blobURL && blobURL !== prevBlobURLRef.current;

    console.log('Recording state check:', {
      justStoppedRecording,
      hasNewBlob,
      blobURL,
      prevBlobURL: prevBlobURLRef.current,
      isRecording,
      prevIsRecording: prevIsRecordingRef.current,
    });

    // If we just stopped recording AND have a new blob, apply to armed track
    if (justStoppedRecording && hasNewBlob) {
      const armedTrack = tracks.find((t) => t.armed);

      if (armedTrack) {
        console.log(
          'Recording complete, applying to armed track:',
          armedTrack.name,
          blobURL,
        );

        // Apply the recording to the armed track
        setTrackAudio(armedTrack.id, blobURL)
          .then(() => {
            console.log('Audio saved to track:', armedTrack.name);

            // Important: Update the track with the new audio URL and disarm it
            // This ensures the waveform component detects the change
            updateTrack(armedTrack.id, {
              armed: false,
              audioURL: blobURL,
              isRecording: false,
              // Force a re-render by updating a timestamp
              lastRecordingTime: Date.now(),
            });
          })
          .catch((error) => {
            console.error('Error setting track audio:', error);
          });
      }
    }

    // Update refs for next render
    prevBlobURLRef.current = blobURL;
    prevIsRecordingRef.current = isRecording;
  }, [blobURL, isRecording, tracks, setTrackAudio, updateTrack]);

  // Watch for new takes and apply to armed tracks in multitrack mode
  useEffect(() => {
    // Skip if no takes or if currently recording
    if (blobInfo.length === 0 || isRecording) return;

    // Get unprocessed takes
    const unprocessedTakes = blobInfo.filter(
      (take) => !processedTakesRef.current.has(take.url),
    );

    // Process each new take
    unprocessedTakes.forEach((take) => {
      console.log('📦 Processing new take:', take.take);

      // Mark as processed immediately to prevent reprocessing
      processedTakesRef.current.add(take.url);

      // Only apply to armed tracks if we're in DAW mode and not recording
      const armedTrack = tracks.find((t) => t.armed && !t.isRecording);

      if (armedTrack && showDAW && !isRecording) {
        console.log('🎯 Applying take to armed track:', armedTrack.name);

        // Apply the take
        setTrackAudio(armedTrack.id, take.url)
          .then(() => {
            console.log('✅ Take applied successfully');

            // Disarm the track and update its state
            updateTrack(armedTrack.id, {
              armed: false,
              isRecording: false,
              audioURL: take.url,
              lastRecordingTime: Date.now(),
            });
          })
          .catch((error) => {
            console.error('❌ Error applying take:', error);
            // Remove from processed if it failed
            processedTakesRef.current.delete(take.url);
          });
      }
    });
  }, [blobInfo, tracks, setTrackAudio, updateTrack, showDAW, isRecording]);

  // Create a ref to track current take number
  const takeNoRef = useRef(0);
  useEffect(() => {
    takeNoRef.current = takeNo;
  }, [takeNo]);

  // Add global error handler for AbortErrors
  useEffect(() => {
    const handleError = (event) => {
      if (event.error && event.error.name === 'AbortError') {
        event.preventDefault();
        console.log('Suppressed expected AbortError during audio operations');
        return false;
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason && event.reason.name === 'AbortError') {
        event.preventDefault();
        console.log('Suppressed expected AbortError promise rejection');
      }
    });

    return () => {
      window.removeEventListener('error', handleError);
    };
  }, []);

  // Initialize audio URL with scratch audio
  useEffect(() => {
    if (!audioURL) {
      setAudioURL(scratchURL);
    }
  }, [audioURL, setAudioURL]);

  // Initialize audio context and filters - only once
  useEffect(() => {
    if (typeof window !== 'undefined' && (audioURL || scratchURL)) {
      let initialized = false;

      const initAudioContext = () => {
        if (initialized) return;
        initialized = true;

        const result = setupAudioContext(audioURL || scratchURL);
        setFilters(result.filters);
        audioRef.current = result.audio;
      };

      const handleUserGesture = () => {
        initAudioContext();
        document.removeEventListener('click', handleUserGesture);
        document.removeEventListener('touchstart', handleUserGesture);
      };

      document.addEventListener('click', handleUserGesture);
      document.addEventListener('touchstart', handleUserGesture);

      return () => {
        document.removeEventListener('click', handleUserGesture);
        document.removeEventListener('touchstart', handleUserGesture);
      };
    }
  }, []); // Empty array - only run once on mount

  // Clear recording data when switching parts
  useEffect(() => {
    clearRecordingData();
  }, [partType]); // Only clear when partType changes

  // Clear processed takes when entering/leaving DAW mode
  useEffect(() => {
    if (showDAW) {
      // Clear processed takes when entering DAW mode to start fresh
      processedTakesRef.current.clear();
    }
  }, [showDAW]);

  // Initialize MediaRecorder
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      navigator?.mediaDevices?.getUserMedia
    ) {
      navigator.mediaDevices
        .getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
            sampleRate: 48000,
            latency: 0,
          },
        })
        .then((stream) => {
          const supportedType = getSupportedMimeType();
          if (!supportedType) {
            console.error('No supported audio MIME type found');
            setIsBlocked(true);
            return;
          }
          setMimeType(supportedType);

          const recorder = new MediaRecorder(stream, {
            mimeType: supportedType,
          });

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunksRef.current.push(e.data);
            }
          };

          recorder.onerror = (event) => {
            console.log('MediaRecorder error suppressed:', event.error?.name || 'unknown');
          };

          recorder.onstop = () => {
            console.log('MediaRecorder.onstop called');
            const blob = new Blob(chunksRef.current, { type: supportedType });
            const url = URL.createObjectURL(blob);

            console.log('Created blob URL:', url, 'size:', blob.size);

            setBlobData(blob);
            setBlobURL(url);

            // Always add to takes list - keep it simple
            const currentTakeNo = takeNoRef.current + 1;
            addTake({
              url,
              data: blob,
              take: currentTakeNo,
              timeStr: new Date().toLocaleString(),
              mimeType: supportedType,
              takeName: null,
            });
            setTakeNo(currentTakeNo);

            chunksRef.current = [];
          };

          setMediaRecorder(recorder);
          setIsBlocked(false);
        })
        .catch((err) => {
          console.log('Permission Denied', err);
          setIsBlocked(true);
        });
    }
    // Re-initialize when tracks change or DAW visibility changes
  }, []); // Empty dependency array - only run once

  // Store per-take history and current URL
  const takeHistoryRef = useRef({}); // { takeNo: { currentURL, history } }
  const previousTakeNoRef = useRef(-1);

  // Update audio URL when active take changes
  useEffect(() => {
    if (activeTakeNo === -1) return;

    // Only run when activeTakeNo actually changes, not when blobInfo updates
    if (previousTakeNoRef.current === activeTakeNo) {
      return;
    }

    const take = blobInfo.find((o) => o.take === activeTakeNo);
    if (!take) return;

    previousTakeNoRef.current = activeTakeNo;

    // Get or initialize this take's state
    if (!takeHistoryRef.current[activeTakeNo]) {
      // First time loading this take - initialize with original recording
      takeHistoryRef.current[activeTakeNo] = {
        currentURL: take.url,
        originalURL: take.url
      };
    }

    // Always clear history when switching takes
    // Each take has independent undo/redo history
    clearHistory();

    // Load the take's current state (either original or last edited)
    const takeState = takeHistoryRef.current[activeTakeNo];
    addToEditHistory(takeState.currentURL, 'Load Take', { isTakeLoad: true });
  }, [activeTakeNo, blobInfo, addToEditHistory, clearHistory, setAudioURL]);

  // Track current URL changes to store per-take state
  useEffect(() => {
    if (activeTakeNo !== -1 && audioURL && takeHistoryRef.current[activeTakeNo]) {
      takeHistoryRef.current[activeTakeNo].currentURL = audioURL;
    }
  }, [audioURL, activeTakeNo]);

  // Recording timer
  useEffect(() => {
    let interval = null;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => ({
          min: prev.sec === 59 ? prev.min + 1 : prev.min,
          sec: prev.sec === 59 ? 0 : prev.sec + 1,
        }));
      }, 1000);
    } else {
      setRecordingTime({ min: 0, sec: 0 });
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, setRecordingTime]);

  const startRecording = useCallback(() => {
    if (isBlocked || !mediaRecorder) {
      console.error(
        'Cannot record, microphone permissions are blocked or recorder not ready',
      );
      return;
    }

    if (accompanimentRef.current) {
      accompanimentRef.current.play();
    }

    chunksRef.current = [];
    mediaRecorder.start(10);
    setIsRecording(true);
  }, [isBlocked, mediaRecorder, accompanimentRef, chunksRef, setIsRecording]);

  const stopRecording = useCallback(async () => {
    try {
      if (accompanimentRef.current) {
        accompanimentRef.current.pause();

        // Use a safer approach to reset audio
        try {
          if (accompanimentRef.current.readyState >= 1) {
            accompanimentRef.current.currentTime = 0;
          }
        } catch (timeError) {
          // Ignore timing errors during abort
          console.log('Ignored audio timing error during stop:', timeError.name);
        }
      }

      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        // Set the active take to the one we just recorded
        setTimeout(() => {
          setActiveTakeNo(takeNoRef.current + 1);
        }, 100);
      }
      setIsRecording(false);
    } catch (error) {
      console.log('Suppressed error in stopRecording:', error.name);
      setIsRecording(false); // Ensure we still update state
    }
  }, [mediaRecorder, accompanimentRef, setIsRecording, setActiveTakeNo]);

  const handleDeleteTake = useCallback(
    (index) => {
      const takeToDelete = blobInfo[index];
      if (takeToDelete && takeToDelete.take === activeTakeNo) {
        setShowDAW(false);
      }
      deleteTake(index);
    },
    [blobInfo, activeTakeNo, setShowDAW, deleteTake],
  );

  const handleRename = useCallback((takeNumber) => {
    const nameInput = document.getElementById(`name-take-${takeNumber}`);
    const placeholder = document.getElementById(`plc-txt-${takeNumber}`);

    if (nameInput && placeholder) {
      if (nameInput.style.display === 'none') {
        nameInput.style.display = 'block';
        placeholder.style.display = 'none';
        nameInput.focus();
      } else {
        nameInput.style.display = 'none';
        placeholder.style.display = 'block';
      }
    }
  }, []);

  const submitEditedRecording = useCallback(
    async (url, activityLogData = null) => {
      if (!url || url === scratchURL) {
        alert('Please record audio before submitting');
        return;
      }

      try {
        if (!ignoreSilence && ffmpegLoaded) {
          const silenceResult = await catchSilence(
            ffmpegRef,
            url,
            '-30dB',  // Use proper dB format for cutoff threshold
            10,       // Duration in seconds to detect silence
            null,
          );
          setSilenceData(silenceResult);

          if (silenceResult?.silenceFlag) {
            setShowAudioDrop(true);
            return;
          }
        }

        const response = await fetch(url);
        // The blob from response.blob() should preserve the original MIME type
        const blob = await response.blob();
        console.log('📊 Submitting audio blob:', {
          size: blob.size,
          type: blob.type || 'unknown',
          url: url.substring(0, 50) + '...'
        });

        if (submit) {
          // IMPORTANT: Never modify the blob directly as it will corrupt it
          // Keep the blob pristine for submission

          if (activityLogData) {
            console.log('📊 Activity log data available, will be submitted separately');
            console.log('📊 Activity log size:', activityLogData.length, 'characters');

            // Store activity log in window for the submission handler to access
            // This is a temporary solution until the backend is updated to handle it properly
            if (typeof window !== 'undefined') {
              window.__PENDING_ACTIVITY_LOG__ = activityLogData;
              window.__PENDING_ACTIVITY_LOG_TIMESTAMP__ = new Date().toISOString();
            }
          }

          // Always submit the pristine blob - DO NOT MODIFY IT
          submit(blob);

          // Clear the pending activity log after a delay
          if (activityLogData && typeof window !== 'undefined') {
            setTimeout(() => {
              window.__PENDING_ACTIVITY_LOG__ = null;
              window.__PENDING_ACTIVITY_LOG_TIMESTAMP__ = null;
            }, 5000);
          }
        }
      } catch (error) {
        console.error('Error submitting recording:', error);
        alert('Error submitting recording. Please try again.');
      }
    },
    [
      ignoreSilence,
      ffmpegLoaded,
      ffmpegRef,
      setSilenceData,
      setShowAudioDrop,
      submit,
    ],
  );

  return (
    <>
      <Row>
        <Col>
          {isRecording ? (
            <Button onClick={stopRecording} className="mb-2 mt-2">
              <FaStop /> {String(recordingTime.min).padStart(2, '0')}:
              {String(recordingTime.sec).padStart(2, '0')}
            </Button>
          ) : (
            <Button onClick={startRecording} className="mb-2 mt-2">
              <FaMicrophone />
            </Button>
          )}
        </Col>
      </Row>

      <Row>
        <Col>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            ref={accompanimentRef}
            className='mb-2'
            onError={(e) => {
              console.log('Audio element error suppressed:', e.error?.name || 'unknown');
              e.preventDefault();
            }}
            onAbort={(e) => {
              console.log('Audio abort event suppressed');
              e.preventDefault();
            }}
          >
            <source src={accompaniment} type="audio/mpeg" />
          </audio>

          {blobInfo.length === 0 ? (
            <span className="mt-2">
              No takes yet. Click the microphone icon to record.
            </span>
          ) : (
            <ListGroup as="ol" numbered className="mt-2">
              <h3>Your Takes ({blobInfo.length})</h3>
              {blobInfo.map((take, i) => (
                <ListGroupItem
                  key={take.url}
                  as="li"
                  className="d-flex justify-content-between"
                  style={{ fontSize: '1rem', alignItems: 'center' }}
                >
                  <Form.Control
                    type="text"
                    placeholder={`Take ${take.take} -- ${take.timeStr}`}
                    id={`plc-txt-${take.take}`}
                    style={{ display: 'block' }}
                    value={
                      take.takeName || `Take ${take.take} -- ${take.timeStr}`
                    }
                    readOnly
                  />
                  <Form.Control
                    type="text"
                    placeholder={`Name your take`}
                    id={`name-take-${take.take}`}
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const newBlobInfo = blobInfo.map((item, idx) => {
                        if (idx === i) {
                          return { ...item, takeName: e.target.value };
                        }
                        return item;
                      });
                      setBlobInfo(newBlobInfo);
                    }}
                  />
                  <div className="d-flex align-items-center gap-1">
                    <BiRename onClick={() => handleRename(take.take)} />
                    <Button
                      size="sm"
                      variant="success"
                      style={{ fontSize: '0.6rem' }}
                      onClick={() => {
                        setActiveTakeNo(take.take);
                        setShowDAW(true);
                      }}
                    >
                      <FaEdit /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      style={{ fontSize: '0.6rem' }}
                      onClick={() => handleDeleteTake(i)}
                    >
                      <FaRegTrashAlt /> Delete
                    </Button>
                  </div>
                </ListGroupItem>
              ))}
            </ListGroup>
          )}
          {showDAW && audioURL && audioURL !== scratchURL && (
            <DAW
              onSubmit={submitEditedRecording}
              showSubmitButton={true}
              logOperation={logOperation}
            />
          )}
          {showDAW && (!audioURL || audioURL === scratchURL) && (
            <div className="text-center py-3">
              <div className="spinner-border" role="status">
                <span className="visually-hidden">Loading audio...</span>
              </div>
              <p className="mt-2">Loading take...</p>
            </div>
          )}
          <StatusIndicator
            slug={slug}
            piece={piece}
            partType={partType}
            actCategory={actCategory}
          />
        </Col>
      </Row>
      <AudioDropModal
        show={showAudioDrop}
        silenceData={silenceData}
        onIgnore={() => {
          setIgnoreSilence(true);
          setShowAudioDrop(false);
          // Pass null for activity log when retrying after silence warning
          submitEditedRecording(audioURL, null);
        }}
        onUploadNew={() => setShowAudioDrop(false)}
      />
    </>
  );
}


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
//TODO: maybe I should put this somewhere else?
const emptyDraft = () => ({
  name: "",
  description: "",
  settings: {},
  file: null,
});

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


function MidiTable({ value, onChange }) {
  return (
    <label>
      Pick Midi Device
      <select
        value={value || ""}
        onChange={onChange}
        style={{ width: '100%', marginTop: '0.25rem' }}
      >
        <option value="">-- Select a MIDI device --</option>
        {WebMidi.inputs.map((device) => (
          <option key={device.id} value={device.name}>{device.name}</option>
        ))}
      </select>
    </label>
  )
}

function InstrumentConfigEditor({ show, onSaved = null, onAudioFileChange = null, onMidiDeviceSelect = null }) {
  const [configs, setConfigs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!show) {
      return;
    }
    (async () => {
      setError("");
      setLoading(true);
      try {
        const res = await getInstrumentConfigurations()
        setConfigs(res);
        //TODO: remember the last selected config?
        if (res.length > 0) {
          setSelectedId(res[0].id);
          setDraft({
            name: res[0].name,
            description: res[0].description,
            settings: res[0].settings,
            file: res[0].file || null,
          });
          if (onAudioFileChange) {
            onAudioFileChange(res[0].file || null);
          }
        }
        else {
          setSelectedId(null);
          setDraft(emptyDraft());
          if (onAudioFileChange) {
            onAudioFileChange(null);
          }
        }
      } catch (error) {
        setError(String(error));
      } finally {
        setLoading(false);
      }
    })();

  }, [show]);

  const onSelectedConfig = (id) => {
    setSelectedId(id);
    const config = configs.find((c) => c.id === id);

    if (!config) return;

    setDraft({
      name: config.name,
      description: config.description,
      settings: config.settings,
      file: config.file || null,
    });
    if (onAudioFileChange) {
      onAudioFileChange(config.file || null);
    }
    // If there's a saved MIDI device, set it as the active input
    if (config.settings?.midiDeviceName && onMidiDeviceSelect) {
      onMidiDeviceSelect(config.settings.midiDeviceName);
    }
  };
  //TODO: Maybe put this in the useeffect? (like use it there as there's repeated code)
  const onNew = () => {
    setSelectedId(null);
    setDraft(emptyDraft());
    if (onAudioFileChange) {
      onAudioFileChange(null);
    }
  }

  const handleMidiDeviceChange = (e) => {
    const deviceName = e.target.value;

    // Update the draft settings
    setDraft({
      ...draft,
      settings: {
        ...draft.settings,
        midiDeviceName: deviceName,
      },
    });

    // Also update the active MIDI input immediately
    if (deviceName && onMidiDeviceSelect) {
      onMidiDeviceSelect(deviceName);
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0] || null;
    setDraft({ ...draft, file: file });
  };

  const save = async () => {
    setError("");
    setSaving(true);

    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      settings: draft.settings,
    };

    //We want to patch existing configs, post new ones
    const isEdit = selectedId !== null;
    const method = isEdit ? "PATCH" : "POST";

    const audioFile = draft.file instanceof File ? draft.file : null;

    try {
      let res;
      if (method === "PATCH") {
        // res is the updated config
        res = await mutateInstrumentConfiguration(selectedId, payload, audioFile);
        // Postings new config
      } else {
        // res is the created config
        res = await createInstrumentConfiguration(payload, audioFile);
      }
      console.log(`res from saving config: ${JSON.stringify(res)}`);
      // this is only the updated or created config
      // Update the local list of configs post and patch only return what was changed, not the full list
      const res2 = await getInstrumentConfigurations();
      setConfigs(res2);
      // we want it to make the updated or created config the selected one
      console.log(`checking res2 (updated config list): ${JSON.stringify(res2)}`);

      setSelectedId(res.id);
      setDraft({
        name: res.name,
        description: res.description,
        settings: res.settings,
        file: res.file || null,
      });

      if (onAudioFileChange) {
        onAudioFileChange(res.file || null);
      }

      // this is a function refference passed from the parent to let it know we saved successfully
      //TODO: I don't see a point in this if statement
      if (onSaved) {
        // This closes the modal.
        onSaved();
      }

    } catch (error) {
      setError(String(error));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div>Loading configurations...</div>;
  }

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error}</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', marginBottom: '1rem', justifyContent: 'center', alignItems: 'center', marginTop: '1rem', borderTop: '2px solid lightgray', paddingTop: '1rem' }}>
        <Button onClick={onNew} variant="primary">New Config</Button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label>
          Select Configuration:
          <select
            value={selectedId ?? ""}
            onChange={(e) => onSelectedConfig(Number(e.target.value))}
            style={{ marginLeft: '0.5rem' }}
            disabled={configs.length === 0}
          >
            {configs.length === 0 ? (
              <option value="">-- No configs available --</option>
            ) : (
              <>
                <option value="">-- Select a config --</option>
                {configs.map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.name || `Config ${config.id}`}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ flex: 1 }}>
          <label>
            Name:
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
          </label>
        </div>
        <div style={{ flex: 1 }}>
          <label>
            Description:
            <input
              type="text"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
          </label>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
        <MidiTable
          value={draft.settings?.midiDeviceName || ""}
          onChange={handleMidiDeviceChange}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label>
          Audio Sample (C5, mp3 or wav):
          <input
            type="file"
            accept=".mp3,.wav"
            onChange={handleFileChange}
            style={{ marginLeft: '0.5rem' }}
          />
        </label>
        {typeof draft.file === 'string' && draft.file && (
          <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: 'gray' }}>
            Current file: {draft.file}
          </div>
        )}
      </div>
      <div>
        <Button onClick={save} disabled={saving} variant="success">
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export function Recorder({ submit, accompaniment }) {
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
  const webmidiIndex = useRef(null);
  const handleRecordingTypeChange = useCallback((e) => {
    const value = e.target.value;
    setRecordingType(value);
  });
  const [show, setShow] = useState(false);
  const [audioFileUrl, setAudioFileUrl] = useState(null);
  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);


  useEffect(() => {
    setBlobInfo([]);
    setBlobURL('');
    setBlobData();
  }, [partType]);

  function onEnabled() {

    if (WebMidi.inputs.length < 1 && recordingType == "midi") {
      console.error('tried to give permission, but no inputs');
    } else {
      setHasPermission(true);
      webmidiIndex.current = 0;
      webmidiInput.current = WebMidi.inputs[webmidiIndex.current]; // FIXME: we need to list the inputs from the loop above in the config ui so the user can select their thing
      webmidiInput.current.channels[1].addListener("noteon", onNote);
    }
  }


  async function enableMidiTone() {
    await WebMidi.enable().catch((err) => {
      alert(err);
      return;
    });
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
    // sampler.current.triggerAttackRelease(note, 4);
    // if(hasPermission === true) {
    console.log("note on: ", note);
    loaded().then(() => {
      // would be nice for the user to have notes not play for the full duration
      // once they stop holding the key
      sampler.current.triggerAttackRelease(note, 4);
    });

  }
  // InstrumentConfigEditor and MidiTable are defined outside of Recorder

  const handleMidiDeviceSelect = (deviceName) => {
    const deviceIndex = WebMidi.inputs.findIndex(input => input.name === deviceName);
    if (deviceIndex === -1) {
      console.error(`MIDI device "${deviceName}" not found`);
      return;
    }
    console.log("Selected MIDI device index:", deviceIndex);
    // Remove listener from old device if it exists
    if (webmidiInput.current) {
      webmidiInput.current.channels[1].removeListener("noteon", onNote);
    }
    // Update to new device
    webmidiIndex.current = deviceIndex;
    webmidiInput.current = WebMidi.inputs[deviceIndex];
    webmidiInput.current.channels[1].addListener("noteon", onNote);
  };



  const startRecording = (ev) => {
    if (isBlocked) {
      console.error('cannot record, microphone permissions are blocked');
    } else if (recordingType == "mic") {
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

    const samples = audioFileUrl
      ? { C5: audioFileUrl }
      : {
        C5: "/audio/viola_c5.wav",
        A4: "/audio/viola_a4.wav",
        B4: "/audio/viola_b4.wav",
        D4: "/audio/viola_d4.wav",
        E4: "/audio/viola_e4.wav",
        F4: "/audio/viola_f4.wav",
        G4: "/audio/viola_g4.wav",
      };

    sampler.current = new Sampler(samples, {
      onload: () => {
        setSamplerLoaded(true);
      }
    }).toDestination();
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (sampler.current) {
        sampler.current.dispose();
      }
    };
  }, [audioFileUrl]);

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
              <Button onClick={startRecording} disabled={!hasPermission}> {/*idk about the disabled here */}
                <FaMicrophone />
              </Button>
              {/*<Config RecordingTypeChanged={handleRecordingTypeChange} value={recordingType}></Config>*/}
              <Button variant="secondary" onClick={handleShow}>
                <IoSettingsSharp>

                </IoSettingsSharp>
              </Button>
              <Modal show={show} onHide={handleClose}>
                <Modal.Header>
                  <Modal.Title> Recording Settings</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                  <div className="row">
                    <div className="col d-flex flex-column align-items-center">
                      <Config RecordingTypeChanged={handleRecordingTypeChange} value={recordingType}></Config>
                      {(recordingType === "midi" || recordingType === "keyboard") && (
                        <Button variant="primary" onClick={enableMidiTone}>Enable Midi and Keyboard</Button>
                      )}
                      {hasPermission && (
                        <>
                          <InstrumentConfigEditor show={show} onSaved={handleClose} onAudioFileChange={setAudioFileUrl} onMidiDeviceSelect={handleMidiDeviceSelect}></InstrumentConfigEditor>
                        </>

                      )}

                    </div>
                  </div>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="secondary" onClick={handleClose}>Close</Button>
                </Modal.Footer>
              </Modal>
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

