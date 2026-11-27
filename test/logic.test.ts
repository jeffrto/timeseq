import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	ENTER_INSERT_RE,
	findSection,
	onEnter,
	onLineChanged,
	onTyped,
	parseLine,
} from '../src/logic';

const ctx = {
	headerDate: (line: string) => /^#+\s*\[\[(\d{4}-\d{2}-\d{2})\]\]/.exec(line)?.[1] ?? null,
	isStamp: (s: string) => /^\d\d:\d\d:\d\d$/.test(s),
	now: () => '10:00:05',
	today: () => '2026-11-27',
	alwaysBullet: true,
	autoHeading: true,
	stampCompletion: true,
};

const doc = (...lines: string[]) => ({ lines: lines.length, line: (n: number) => lines[n] });

function apply(lines: string[], edits: { line: number; from: number; to: number; insert: string }[]) {
	const out = [...lines];
	const sorted = [...edits].sort((a, b) => b.line - a.line || b.from - a.from);
	for (const e of sorted) {
		const t = out[e.line];
		out[e.line] = t.slice(0, e.from) + e.insert + t.slice(e.to);
	}
	return out.join('\n');
}

function run(fn: typeof onEnter, lines: string[], lineNo: number) {
	const d = fn(doc(...lines), lineNo, ctx);
	if (d.kind !== 'edits') return d.kind;
	return apply(lines, d.edits);
}

test('parseLine: bullets, tasks, numbers, stamps', () => {
	const p = parseLine('\t- [ ] **10:00:00**: hello', ctx.isStamp);
	assert.equal(p.indent, '\t');
	assert.equal(p.marker, '- ');
	assert.equal(p.checkbox, '[ ] ');
	assert.equal(p.stamp, '**10:00:00**: ');
	assert.equal(p.content, 'hello');
	assert.equal(parseLine('1. x', ctx.isStamp).marker, '1. ');
	assert.equal(parseLine('**bold** text', ctx.isStamp).marker, '');
	assert.equal(parseLine('- **bold**: text', ctx.isStamp).stamp, '');
});

test('ENTER_INSERT_RE matches Enter, not pastes', () => {
	assert.ok(ENTER_INSERT_RE.test('\n'));
	assert.ok(ENTER_INSERT_RE.test('\n- '));
	assert.ok(ENTER_INSERT_RE.test('\n\t- [ ] '));
	assert.ok(ENTER_INSERT_RE.test('\n2. '));
	assert.ok(!ENTER_INSERT_RE.test('\nhello'));
	assert.ok(!ENTER_INSERT_RE.test('a\nb'));
});

test('Enter after the heading stamps a new bullet', () => {
	assert.equal(run(onEnter, ['## [[2026-11-27]]', ''], 1), '## [[2026-11-27]]\n- **10:00:05**: ');
});

test('Enter on a bullet stamps the continued bullet', () => {
	assert.equal(
		run(onEnter, ['## [[2026-11-27]]', '- **10:00:00**: a', '- '], 2),
		'## [[2026-11-27]]\n- **10:00:00**: a\n- **10:00:05**: ',
	);
});

test('Enter on a task stamps after the checkbox', () => {
	assert.equal(
		run(onEnter, ['## [[2026-11-27]]', '- [ ] **10:00:00**: a', '- [ ] '], 2),
		'## [[2026-11-27]]\n- [ ] **10:00:00**: a\n- [ ] **10:00:05**: ',
	);
});

test('Enter on a nested bullet stamps it too', () => {
	assert.equal(
		run(onEnter, ['## [[2026-11-27]]', '\t- **10:00:00**: a', '\t- '], 2),
		'## [[2026-11-27]]\n\t- **10:00:00**: a\n\t- **10:00:05**: ',
	);
});

test('Enter on a blank line does not stamp', () => {
	assert.equal(run(onEnter, ['## [[2026-11-27]]', '- **10:00:00**: a', '', ''], 3), 'none');
});

test('Enter on a stamp-only line exits', () => {
	assert.equal(run(onEnter, ['## [[2026-11-27]]', '- **10:00:00**: ', '- '], 2), 'exit');
	assert.equal(run(onEnter, ['## [[2026-11-27]]', '- [ ] **10:00:00**: ', '- [ ] '], 2), 'exit');
});

test('No stamping outside dated sections or inside code blocks', () => {
	assert.equal(run(onEnter, ['## Notes', '- a', '- '], 2), 'none');
	assert.equal(run(onEnter, ['- a', '- '], 1), 'none');
	assert.equal(run(onEnter, ['## [[2026-11-27]]', '```', 'code', ''], 3), 'none');
	assert.equal(
		run(onEnter, ['## [[2026-11-27]]', '```', '## not a heading', '```', 'x', ''], 5),
		'## [[2026-11-27]]\n```\n## not a heading\n```\nx\n- **10:00:05**: ',
	);
});

test('Enter on a new day inserts a dated heading', () => {
	assert.equal(
		run(onEnter, ['## [[2026-11-26]]', '- **23:59:00**: a', '- '], 2),
		'## [[2026-11-26]]\n- **23:59:00**: a\n\n## [[2026-11-27]]\n- **10:00:05**: ',
	);
});

test('Typing a marker on an empty line stamps it', () => {
	assert.equal(
		run(onTyped, ['## [[2026-11-27]]', '', '- '], 2),
		'## [[2026-11-27]]\n\n- **10:00:05**: ',
	);
	assert.equal(run(onTyped, ['## [[2026-11-27]]', '- hi'], 1), 'none');
});

test('Typing "[ ] " after a fresh stamp moves the checkbox first', () => {
	const d = onTyped(doc('## [[2026-11-27]]', '- **10:00:00**: [ ] '), 1, ctx);
	assert.equal(d.kind, 'edits');
	if (d.kind === 'edits') {
		assert.equal(d.cursor, 'lineEnd');
		assert.equal(apply(['## [[2026-11-27]]', '- **10:00:00**: [ ] '], d.edits).split('\n')[1], '- [ ] **10:00:00**: ');
	}
});

test('Checking a stamped task appends completion time; unchecking removes it', () => {
	const checked = onLineChanged('- [ ] **10:00:00**: task', '- [x] **10:00:00**: task', 0, ctx);
	assert.equal(apply(['- [x] **10:00:00**: task'], checked), '- [x] **10:00:00**: task ✅ 10:00:05');

	const unchecked = onLineChanged(
		'- [x] **10:00:00**: task ✅ 10:00:05',
		'- [ ] **10:00:00**: task ✅ 10:00:05',
		0,
		ctx,
	);
	assert.equal(apply(['- [ ] **10:00:00**: task ✅ 10:00:05'], unchecked), '- [ ] **10:00:00**: task');

	assert.deepEqual(onLineChanged('- [x] **10:00:00**: t ✅ 2026-11-27', '- [ ] **10:00:00**: t ✅ 2026-11-27', 0, ctx), []);
	assert.deepEqual(onLineChanged('- [ ] task', '- [x] task', 0, ctx), []);
});

test('findSection ignores headings inside code', () => {
	assert.equal(findSection(doc('## [[2026-11-27]]', '```', '# x', '```', ''), 4, ctx)?.date, '2026-11-27');
});
