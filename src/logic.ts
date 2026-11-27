// No Obsidian/CodeMirror imports so it can be unit-tested. Line numbers are 0-based.

export interface Ctx {
	headerDate(line: string): string | null;
	isStamp(text: string): boolean;
	now(): string;
	today(): string;
	alwaysBullet: boolean;
	autoHeading: boolean;
	stampCompletion: boolean;
}

export interface DocLike {
	lines: number;
	line(n: number): string;
}

export interface LineEdit {
	line: number;
	from: number;
	to: number;
	insert: string;
}

export type Decision =
	| { kind: 'none' }
	// Enter on a stamp-only line: cancel it and clear that line
	| { kind: 'exit' }
	| { kind: 'edits'; edits: LineEdit[]; cursor: 'map' | 'lineEnd' };

const NONE: Decision = { kind: 'none' };

const LINE_RE =
	/^([\t ]*)(?:((?:[-*+]|\d+[.)])[\t ])(\[.\](?:[\t ]|$))?)?(.*)$/;
const STAMP_RE = /^\*\*([^*\n]+)\*\*:[\t ]?/;
const HEADING_RE = /^#{1,6}[\t ]/;
const DONE_RE = /[\t ]*✅ (\S+)[\t ]*$/;

// Newline + optional list continuation, as inserted by Enter
export const ENTER_INSERT_RE =
	/^\n[\t ]*(?:(?:[-*+]|\d+[.)])[\t ]+(?:\[.\][\t ]+)?)?$/;

export interface ParsedLine {
	indent: string;
	marker: string;
	checkbox: string;
	stamp: string;
	content: string;
	prefixLen: number;
}

export function parseLine(text: string, isStamp: (s: string) => boolean): ParsedLine {
	const m = LINE_RE.exec(text) as RegExpExecArray;
	const indent = m[1];
	const marker = m[2] ?? '';
	const checkbox = m[3] ?? '';
	let content = m[4];
	let stamp = '';
	const s = STAMP_RE.exec(content);
	if (s && isStamp(s[1])) {
		stamp = s[0];
		content = content.slice(stamp.length);
	}
	return {
		indent,
		marker,
		checkbox,
		stamp,
		content,
		prefixLen: indent.length + marker.length + checkbox.length,
	};
}

export function isFence(line: string): boolean {
	const t = line.trim();
	return t.startsWith('```') || t.startsWith('~~~');
}

export function isHeading(line: string): boolean {
	return HEADING_RE.test(line);
}

export function findSection(
	doc: DocLike,
	lineNo: number,
	ctx: Ctx,
): { date: string; line: number } | null {
	let inCode = false;
	let section: { date: string; line: number } | null = null;
	for (let n = 0; n < lineNo; n++) {
		const t = doc.line(n);
		if (isFence(t)) {
			inCode = !inCode;
			continue;
		}
		if (inCode || !isHeading(t)) continue;
		const date = ctx.headerDate(t);
		section = date ? { date, line: n } : null;
	}
	if (inCode || (lineNo < doc.lines && isFence(doc.line(lineNo)))) return null;
	return section;
}

function stampText(ctx: Ctx): string {
	return `**${ctx.now()}**: `;
}

function rolloverHeading(
	doc: DocLike,
	lineNo: number,
	sectionDate: string,
	ctx: Ctx,
): string {
	const today = ctx.today();
	if (!ctx.autoHeading || sectionDate === today) return '';
	const prev = lineNo > 0 ? doc.line(lineNo - 1) : '';
	return (prev.trim() !== '' ? '\n' : '') + `## [[${today}]]\n`;
}

function stampEdits(doc: DocLike, lineNo: number, sectionDate: string, ctx: Ctx): LineEdit[] {
	const p = parseLine(doc.line(lineNo), ctx.isStamp);
	const edits: LineEdit[] = [];
	const heading = rolloverHeading(doc, lineNo, sectionDate, ctx);
	if (heading) edits.push({ line: lineNo, from: 0, to: 0, insert: heading });
	if (p.marker) {
		edits.push({ line: lineNo, from: p.prefixLen, to: p.prefixLen, insert: stampText(ctx) });
	} else {
		const bullet = ctx.alwaysBullet ? '- ' : '';
		const at = p.indent.length;
		edits.push({ line: lineNo, from: at, to: at, insert: bullet + stampText(ctx) });
	}
	return edits;
}

export function onEnter(doc: DocLike, newLine: number, ctx: Ctx): Decision {
	if (newLine < 1 || newLine >= doc.lines) return NONE;
	const prevText = doc.line(newLine - 1);
	if (prevText.trim() === '') return NONE;

	const prev = parseLine(prevText, ctx.isStamp);
	if (prev.stamp && prev.content.trim() === '') return { kind: 'exit' };

	const section = findSection(doc, newLine, ctx);
	if (!section) return NONE;

	const cur = parseLine(doc.line(newLine), ctx.isStamp);
	if (cur.stamp) return NONE;

	return { kind: 'edits', edits: stampEdits(doc, newLine, section.date, ctx), cursor: 'map' };
}

export function onTyped(doc: DocLike, lineNo: number, ctx: Ctx): Decision {
	const text = doc.line(lineNo);
	const p = parseLine(text, ctx.isStamp);
	if (!p.marker) return NONE;

	// "- **t**: [ ] " -> "- [ ] **t**: "
	if (p.stamp && !p.checkbox) {
		const m = /^(\[.\])[\t ]+$/.exec(p.content);
		if (!m) return NONE;
		return {
			kind: 'edits',
			edits: [{ line: lineNo, from: p.prefixLen, to: text.length, insert: `${m[1]} ${p.stamp}` }],
			cursor: 'lineEnd',
		};
	}

	if (p.stamp || p.content !== '') return NONE;
	const section = findSection(doc, lineNo, ctx);
	if (!section) return NONE;
	return { kind: 'edits', edits: stampEdits(doc, lineNo, section.date, ctx), cursor: 'map' };
}

function isChecked(checkbox: string): boolean {
	return /^\[[xX]\]/.test(checkbox);
}

export function onLineChanged(
	oldText: string,
	newText: string,
	lineNo: number,
	ctx: Ctx,
): LineEdit[] {
	if (!ctx.stampCompletion) return [];
	const o = parseLine(oldText, ctx.isStamp);
	const n = parseLine(newText, ctx.isStamp);
	if (!n.stamp || !o.checkbox || !n.checkbox) return [];

	const was = isChecked(o.checkbox);
	const now = isChecked(n.checkbox);
	const done = DONE_RE.exec(newText);
	const hasDone = done !== null && ctx.isStamp(done[1]);

	if (!was && now && !hasDone) {
		const end = newText.trimEnd().length;
		return [{ line: lineNo, from: end, to: newText.length, insert: ` ✅ ${ctx.now()}` }];
	}
	if (was && !now && hasDone && done) {
		return [{ line: lineNo, from: done.index, to: newText.length, insert: '' }];
	}
	return [];
}
