import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './store.js';

/** Pre-typed Redux hooks, so components never re-declare the state shape. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
