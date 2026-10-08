import { mockApi } from './mockApi';
import { realApi } from './realApi';
import type { DropApi } from './types';


export const api: DropApi = import.meta.env.VITE_USE_MOCK === 'true' ? mockApi : realApi;