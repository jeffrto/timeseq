import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { createFilter } from '../src/filter';

const ctx = {
	headerDate: (line: string) => /^#+\s*\[\[(\d{4}-\d{2}-\d{2})\]\]/.exec(line)?.[1] ?? null,
	isStamp: (s: string) => /^\d\d:\d\d:\d\d$/.test(s),
	now: () => '10:00:05',
	today: () => '2026-11-27',
	alwaysBullet: true,
	autoHeading: true,
	stampCompletion: true,
};

// "|" marks the cursor
function make(text: string) {
	const anchor = text.indexOf('|');
	return EditorState.create({
		doc: text.replace('|', ''),
		selection: { anchor },
		extensions: [EditorState.transactionFilter.of(createFilter(() => ctx))],
	});
}

function show(state: EditorState) {
	const doc = state.doc.toString();
	const h = state.selection.main.head;
	return doc.slice(0, h) + '|' + doc.slice(h);
}

function enter(state: EditorState, insert = '\n') {
	const pos = state.selection.main.head;
	return state.update({
		changes: { from: pos, insert },
		selection: { anchor: pos + insert.length },
		userEvent: 'input',
	}).state;
}

function type(state: EditorState, text: string) {
	const pos = state.selection.main.head;
	return state.update({
		changes: { from: pos, insert: text },
		selection: { anchor: pos + text.length },
		userEvent: 'input.type',
	}).state;
}

test('Enter after heading → stamped bullet, cursor after stamp', () => {
	const s = enter(make('## [[2026-11-27]]|'));
	assert.equal(show(s), '## [[2026-11-27]]\n- **10:00:05**: |');
});

test('Enter with Obsidian list continuation', () => {
	const s = enter(make('## [[2026-11-27]]\n- **10:00:00**: a|'), '\n- ');
	assert.equal(show(s), '## [[2026-11-27]]\n- **10:00:00**: a\n- **10:00:05**: |');
});

test('Enter in a task list', () => {
	const s = enter(make('## [[2026-11-27]]\n- [ ] **10:00:00**: a|'), '\n- [ ] ');
	assert.equal(show(s), '## [[2026-11-27]]\n- [ ] **10:00:00**: a\n- [ ] **10:00:05**: |');
});

test('Enter splitting a line stamps the moved text', () => {
	const s = enter(make('## [[2026-11-27]]\n- **10:00:00**: a| b'), '\n- ');
	assert.equal(show(s), '## [[2026-11-27]]\n- **10:00:00**: a\n- **10:00:05**: | b');
});

test('Double Enter exits the log list', () => {
	let s = enter(make('## [[2026-11-27]]\n- **10:00:00**: a|'), '\n- ');
	s = enter(s, '\n- ');
	assert.equal(show(s), '## [[2026-11-27]]\n- **10:00:00**: a\n|');
});

test('Enter on a new day adds a heading', () => {
	const s = enter(make('## [[2026-11-26]]\n- **23:59:00**: a|'), '\n- ');
	assert.equal(show(s), '## [[2026-11-26]]\n- **23:59:00**: a\n\n## [[2026-11-27]]\n- **10:00:05**: |');
});

test('Paste is never stamped', () => {
	const st = make('## [[2026-11-27]]|');
	const s = st.update({ changes: { from: st.doc.length, insert: '\n' }, userEvent: 'input.paste' }).state;
	assert.equal(s.doc.toString(), '## [[2026-11-27]]\n');
});

test('Typing "- " on an empty line stamps it, then "[ ] " becomes a task', () => {
	let s = make('## [[2026-11-27]]\n\n|');
	s = type(s, '-');
	s = type(s, ' ');
	assert.equal(show(s), '## [[2026-11-27]]\n\n- **10:00:05**: |');
	s = type(s, '[ ] ');
	assert.equal(show(s), '## [[2026-11-27]]\n\n- [ ] **10:00:05**: |');
});

test('Checking a task appends completion time; unchecking removes it', () => {
	let s = make('## [[2026-11-27]]\n- [ ] **10:00:00**: task|');
	const box = s.doc.toString().indexOf('[ ]') + 1;
	s = s.update({ changes: { from: box, to: box + 1, insert: 'x' } }).state;
	assert.equal(s.doc.toString(), '## [[2026-11-27]]\n- [x] **10:00:00**: task ✅ 10:00:05');
	s = s.update({ changes: { from: box, to: box + 1, insert: ' ' } }).state;
	assert.equal(s.doc.toString(), '## [[2026-11-27]]\n- [ ] **10:00:00**: task');
});

test('Outside a dated section nothing happens', () => {
	const s = enter(make('## Notes\n- a|'), '\n- ');
	assert.equal(show(s), '## Notes\n- a\n- |');
});
