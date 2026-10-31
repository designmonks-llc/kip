// Kip's starter templates. Each one is a page title plus ready-made blocks; the Kanban board also makes its sample
// cards as sub-pages. Used by the Templates gallery and the "/" menu.
import { createPage, updatePage, type Page } from './db';

type Block = Record<string, unknown>;
const text = (t: string) => [{ type: 'text', text: t, styles: {} }];
const bold = (t: string) => [{ type: 'text', text: t, styles: { bold: true } }];
const p = (t = '', color?: string): Block => ({ type: 'paragraph', props: color ? { backgroundColor: color } : {}, content: text(t) });
const h = (level: 1 | 2 | 3, t: string): Block => ({ type: 'heading', props: { level }, content: text(t) });
const todo = (t: string, checked = false): Block => ({ type: 'checkListItem', props: { checked }, content: text(t) });
const bullet = (t: string): Block => ({ type: 'bulletListItem', content: text(t) });
const num = (t: string): Block => ({ type: 'numberedListItem', content: text(t) });
const quote = (t: string): Block => ({ type: 'quote', content: text(t) });
const label = (k: string, v: string): Block => ({ type: 'paragraph', content: [...bold(`${k}: `), ...text(v)] });
const table = (rows: string[][]): Block => ({ type: 'table', content: { type: 'tableContent', headerRows: 1, rows: rows.map((cells) => ({ cells })) } });
const divider = (): Block => ({ type: 'divider' });
const today = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

export interface Template {
  id: string;
  name: string;
  about: string;
  /** what's inside, for the gallery preview */
  outline: string[];
  title: () => string;
  blocks: () => Block[];
  /** sample cards for the Kanban board (become sub-pages) */
  cards?: { column: number; title: string }[];
}

export const TEMPLATES: Template[] = [
  {
    id: 'kanban', name: 'Kanban board', about: 'Move work from To do to Done. Every card opens as its own page.',
    outline: ['To do · Doing · Done', 'Cards you drag between columns', 'Each card is a page for notes and files'],
    title: () => 'Project board',
    blocks: () => [p('Drag cards between columns. Click a card to open it and write inside it.'), { type: 'kanban', props: { data: '' } }, p()],
    cards: [{ column: 0, title: 'Write the brief' }, { column: 0, title: 'Collect references' }, { column: 1, title: 'First design round' }, { column: 2, title: 'Kick-off call' }],
  },
  {
    id: 'project', name: 'Project tracker', about: 'Goal, tasks with owners and status, milestones and notes.',
    outline: ['Goal', 'Tasks table: owner, status, due', 'Milestones', 'Notes and links'],
    title: () => 'Project tracker',
    blocks: () => [
      h(2, 'Goal'), p('What does done look like?'),
      h(2, 'Tasks'),
      table([['Task', 'Owner', 'Status', 'Due'], ['Write the brief', '@you', 'In progress', 'Fri'], ['Share first designs', '@sara', 'Not started', 'Next week'], ['Client review', '@rafi', 'Not started', '']]),
      h(2, 'Milestones'), todo('Kick-off'), todo('First round'), todo('Final delivery'),
      h(2, 'Notes and links'), p(),
    ],
  },
  {
    id: 'meeting', name: 'Meeting notes', about: 'Agenda, notes, decisions, actions and open questions.',
    outline: ['Date and attendees', 'Agenda', 'Decisions (>)', 'Actions (!)', 'Questions (?)'],
    title: () => `Meeting – ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
    blocks: () => [
      label('Date', today()), label('Attendees', ''),
      h(2, 'Agenda'), num('Updates'), num('Decisions to make'), num('Next steps'),
      h(2, 'Notes'), p(),
      h(2, 'Decisions'), p('> ', 'blue'),
      h(2, 'Actions'), todo(''),
      h(2, 'Questions'), p('? ', 'yellow'),
    ],
  },
  {
    id: 'weekly', name: 'Weekly planner', about: 'Top three priorities and a plan for every day of the week.',
    outline: ['Top 3 this week', 'Monday to Sunday', 'Notes'],
    title: () => `Week of ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
    blocks: () => [
      h(2, 'Top 3 this week'), todo(''), todo(''), todo(''),
      ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].flatMap((d) => [h(3, d), todo('')]),
      h(2, 'Notes'), p(),
    ],
  },
  {
    id: 'content', name: 'Content calendar', about: 'Plan posts by date, channel and status.',
    outline: ['Calendar table: date, title, channel, status', 'Ideas', 'Published'],
    title: () => 'Content calendar',
    blocks: () => [
      table([['Date', 'Title', 'Channel', 'Status'], ['Mon', 'Behind the scenes', 'Instagram', 'Draft'], ['Wed', 'Case study', 'Behance', 'Idea'], ['Fri', 'Weekly tips', 'LinkedIn', 'Scheduled']]),
      h(2, 'Ideas'), bullet(''),
      h(2, 'Published'), todo('', true),
    ],
  },
  {
    id: 'brief', name: 'Client brief', about: 'Everything about a client project on one page.',
    outline: ['About the client', 'Goals and audience', 'Deliverables', 'Timeline, budget, contacts'],
    title: () => 'Client brief',
    blocks: () => [
      h(2, 'About the client'), p(),
      h(2, 'Goals'), bullet(''),
      h(2, 'Audience'), p(),
      h(2, 'Deliverables'), todo(''), todo(''),
      h(2, 'Timeline'), table([['Phase', 'Dates', 'Notes'], ['Discovery', '', ''], ['Design', '', ''], ['Delivery', '', '']]),
      h(2, 'Budget'), p('$ ', 'green'),
      h(2, 'Contacts'), bullet('Name · role · email'),
    ],
  },
  {
    id: 'bugs', name: 'Bug tracker', about: 'Log bugs with severity, status and owner.',
    outline: ['How to report a bug', 'Bugs table: severity, status, owner', 'Fixed'],
    title: () => 'Bug tracker',
    blocks: () => [
      quote('Steps to reproduce, what you expected, what happened. A screenshot helps.'),
      table([['Bug', 'Severity', 'Status', 'Owner'], ['Login button does nothing on Safari', 'High', 'Open', '@rafi'], ['Typo on pricing page', 'Low', 'Open', '']]),
      h(2, 'Fixed'), todo('', true),
    ],
  },
  {
    id: 'journal', name: 'Daily journal', about: 'A calm page for today: priorities, notes and wins.',
    outline: ['Grateful for', 'Today’s priorities', 'Notes', 'Wins'],
    title: () => today(),
    blocks: () => [h(2, 'Grateful for'), p(), h(2, 'Today’s priorities'), todo(''), todo(''), h(2, 'Notes'), p(), h(2, 'Wins'), bullet('')],
  },
  {
    id: 'reading', name: 'Reading list', about: 'Books and articles to read, with notes.',
    outline: ['Reading table: title, author, status', 'Favourite quotes'],
    title: () => 'Reading list',
    blocks: () => [table([['Title', 'Author', 'Status', 'Notes'], ['', '', 'To read', ''], ['', '', 'Reading', ''], ['', '', 'Done', '']]), h(2, 'Favourite quotes'), quote('')],
  },
  {
    id: 'todo', name: 'To-do list', about: 'Today, this week and later.',
    outline: ['Today', 'This week', 'Later'],
    title: () => 'To-do list',
    blocks: () => [h(2, 'Today'), todo(''), h(2, 'This week'), todo(''), h(2, 'Later'), todo(''), divider(), p()],
  },
];

/** Makes a page from a template (inside `parentId` if given) and returns it. */
export async function createFromTemplate(t: Template, parentId?: string): Promise<Page> {
  const page = await createPage({ parentId, title: t.title(), content: t.blocks() });
  if (t.cards?.length) {
    const columns = ['To do', 'Doing', 'Done'].map((title) => ({ id: crypto.randomUUID(), title, cards: [] as { id: string; title: string; pageId?: string }[] }));
    for (const c of t.cards) {
      const card = await createPage({ parentId: page.id, title: c.title, content: [p('Notes, to-dos and files for this card.')] });
      columns[c.column].cards.push({ id: crypto.randomUUID(), title: c.title, pageId: card.id });
    }
    const data = JSON.stringify({ columns });
    await updatePage(page.id, (pg) => ({ content: (pg.content as Block[]).map((b) => (b.type === 'kanban' ? { ...b, props: { data } } : b)) }));
  }
  return page;
}
