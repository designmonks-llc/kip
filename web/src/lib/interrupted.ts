// Meetings that were still running when Kip closed or crashed, offered for resuming.
import { closeMeeting, findInterruptedMeetings, type Meeting } from './db';

let list: Meeting[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export const interrupted = {
  subscribe(f: () => void) { listeners.add(f); return () => listeners.delete(f); },
  get: () => list,
  async load() { list = await findInterruptedMeetings(); emit(); },
  forget(id: string) { list = list.filter((m) => m.id !== id); emit(); },
  async end(m: Meeting) { await closeMeeting(m); interrupted.forget(m.id); },
};
