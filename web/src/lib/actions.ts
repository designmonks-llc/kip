import { todos, setChecked, type Todo } from './blocks';
import { db, isTrashed, updatePage, type Line, type Meeting, type Page } from './db';

export interface OpenActions {
  notes: { page: Page; todo: Todo }[];
  meetings: { meeting: Meeting; line: Line }[];
}

/** Every unfinished action: unchecked to-dos in notes and open `!` lines in meetings. */
export async function loadOpenActions(): Promise<OpenActions> {
  const d = await db();
  const [pages, meetings, lines] = await Promise.all([d.getAll('pages'), d.getAll('meetings'), d.getAll('lines')]);
  const byId = new Map(pages.map((p) => [p.id, p]));
  const live = new Set(pages.filter((p) => p.kind === 'meeting' && !isTrashed(p, byId)).map((p) => p.meetingId));
  const meetingById = new Map(meetings.map((m) => [m.id, m]));
  return {
    notes: pages
      .filter((p) => p.kind === 'note' && !isTrashed(p, byId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .flatMap((page) => todos(page.content ?? []).filter((t) => !t.checked && t.text.trim()).map((todo) => ({ page, todo }))),
    meetings: lines
      .filter((l) => l.type === 'action' && !l.done && live.has(l.meetingId) && meetingById.has(l.meetingId))
      .map((line) => ({ line, meeting: meetingById.get(line.meetingId)! }))
      .sort((a, b) => b.meeting.startedAt - a.meeting.startedAt || a.line.t - b.line.t),
  };
}

export async function tickTodo(page: Page, id: string, checked: boolean) {
  await updatePage(page.id, (p) => ({ content: setChecked(p.content ?? [], id, checked) }));
}
