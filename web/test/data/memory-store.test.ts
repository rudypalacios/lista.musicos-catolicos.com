import { MemoryStore } from '../../src/data/memory-store.ts';
import { describeStore } from './store.contract.ts';

describeStore('MemoryStore', () => Promise.resolve(new MemoryStore()));
