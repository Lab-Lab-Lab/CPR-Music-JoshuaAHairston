import Form from 'react-bootstrap/Form';
import { useDispatch, useSelector } from 'react-redux';
import Spinner from 'react-bootstrap/Spinner';
import { fetchInstruments } from '../actions';

export default function InstrumentSelector({ defaultInstrument, onChange }) {
  // FIXME
  // eslint-disable-next-line prefer-const
  let { items: instruments, loaded: instrumentsLoaded } = useSelector(
    (state) => state.instruments,
  );

  if (!instrumentsLoaded) {
    const dispatch = useDispatch();
    instruments = dispatch(fetchInstruments());
  }

  return instrumentsLoaded ? (
    <Form.Select
      size="sm"
      onChange={(e) => onChange(instruments[e.target.value])}
      defaultValue={
        Object.values(instruments).find((i) => i.name === defaultInstrument).id
      }
    >
      {instruments &&
        Object.values(instruments).map((instrument) => (
          <option key={instrument.id} value={instrument.id}>
            {instrument.name}
          </option>
        ))}
    </Form.Select>
  ) : (
    <Spinner size="sm" variant="primary" />
  );
}
