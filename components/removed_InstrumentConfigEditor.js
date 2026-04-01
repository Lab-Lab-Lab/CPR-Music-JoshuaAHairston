// This is the old InstrumentConfigEditor that was nested inside Recorder.
// Kept for reference. The extracted version is now at the top of recorder.js.

  function InstrumentConfigEditor({show, onSaved = null, onAudioFileChange = null}) {
    const [configs, setConfigs] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [draft, setDraft] = useState(emptyDraft());
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    // on load of the modal, we should fetch the instrument configs each time?
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
          }
          else {
            setSelectedId(null);
            setDraft(emptyDraft());
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
      // If there's a saved MIDI device, set it as the active input
      if (config.settings?.midiDeviceName) {
        console.log("Config has saved MIDI device:", config.settings.midiDeviceName);
        const deviceIndex = WebMidi.inputs.findIndex(input => input.name === config.settings.midiDeviceName);
        if (deviceIndex !== -1) {
          console.log("Found MIDI device index:", deviceIndex);
          // Remove listener from old device if it exists
          if (webmidiInput.current) {
            webmidiInput.current.channels[1].removeListener("noteon", onNote);
          }

          webmidiIndex.current = deviceIndex;
          webmidiInput.current = WebMidi.inputs[deviceIndex];
          webmidiInput.current.channels[1].addListener("noteon", onNote);
        }
      }
    };
    //TODO: Maybe put this in the useeffect? (like use it there as there's repeated code)
    const onNew = () => {
      setSelectedId(null);
      setDraft(emptyDraft());
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
      if (deviceName) {
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

    //Add the UI for editing instrument configs here
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
        <div style={{display: 'flex', justifyContent: 'center', marginBottom: '1rem'}}>
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
