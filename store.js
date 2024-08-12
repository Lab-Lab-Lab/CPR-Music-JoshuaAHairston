import { useMemo } from 'react';
import { createStore, applyMiddleware } from 'redux';
// import { composeWithDevTools } from 'redux-devtools-extension'
import thunkMiddleware from 'redux-thunk';
import { createWrapper } from 'next-redux-wrapper';
import reducers from './reducers';

// create a makeStore function
const makeStore = (context) =>
  createStore(reducers, applyMiddleware(thunkMiddleware));

// export an assembled wrapper
const wrapper = createWrapper(makeStore, { debug: true });
export default wrapper;
