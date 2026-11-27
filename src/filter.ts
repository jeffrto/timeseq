// Inspects inserted text instead of key events, since mobile keyboards don't report Enter reliably.
import { ChangeSet } from '@codemirror/state';
import type { Text, Transaction, TransactionSpec } from '@codemirror/state';
import { ENTER_INSERT_RE, onEnter, onLineChanged, onTyped } from './logic';
import type { Ctx, DocLike, LineEdit } from './logic';

type FilterResult = TransactionSpec | readonly TransactionSpec[];

function docLike(doc: Text): DocLike {
	return { lines: doc.lines, line: (n: number) => doc.line(n + 1).text };
}

export function createFilter(getCtx: () => Ctx): (tr: Transaction) => FilterResult {
	return (tr) => {
		if (
			!tr.docChanged ||
			tr.isUserEvent('undo') ||
			tr.isUserEvent('redo') ||
			tr.isUserEvent('input.paste') ||
			tr.isUserEvent('input.drop')
		) {
			return tr;
		}
		try {
			return decide(tr, getCtx());
		} catch (e) {
			console.error('Timeseq: failed to process edit', e);
			return tr;
		}
	};
}

function decide(tr: Transaction, ctx: Ctx): FilterResult {
	const newDoc = tr.newDoc;
	const doc = docLike(newDoc);

	if (tr.isUserEvent('input')) {
		let enter: { fromA: number; fromB: number } | null = null;
		tr.changes.iterChanges((fromA, _toA, fromB, _toB, inserted) => {
			if (!enter && ENTER_INSERT_RE.test(inserted.toString())) {
				enter = { fromA, fromB };
			}
		});
		if (enter) {
			const { fromA, fromB } = enter as { fromA: number; fromB: number };
			// 1-based number of the previous line == 0-based index of the new one
			const newLine = newDoc.lineAt(fromB).number;
			const d = onEnter(doc, newLine, ctx);
			if (d.kind === 'exit') {
				const line = tr.startState.doc.lineAt(fromA);
				return {
					changes: { from: line.from, to: line.to, insert: '' },
					selection: { anchor: line.from },
					userEvent: 'input',
					scrollIntoView: true,
				};
			}
			if (d.kind === 'edits') return withEdits(tr, d.edits, d.cursor);
			return tr;
		}
	}

	if (tr.isUserEvent('input.type') && tr.newSelection.ranges.length === 1) {
		const line = newDoc.lineAt(tr.newSelection.main.head).number - 1;
		const d = onTyped(doc, line, ctx);
		if (d.kind === 'edits') return withEdits(tr, d.edits, d.cursor);
	}

	const edits: LineEdit[] = [];
	const seen = new Set<number>();
	tr.changes.iterChanges((fromA, toA, fromB, toB) => {
		const oldLine = tr.startState.doc.lineAt(fromA);
		const newLine = newDoc.lineAt(fromB);
		if (tr.startState.doc.lineAt(toA).number !== oldLine.number) return;
		if (newDoc.lineAt(toB).number !== newLine.number) return;
		if (seen.has(newLine.number)) return;
		seen.add(newLine.number);
		edits.push(...onLineChanged(oldLine.text, newLine.text, newLine.number - 1, ctx));
	});
	if (edits.length) return withEdits(tr, edits, 'keep');

	return tr;
}

// Appended to the same transaction so a single undo reverts both.
function withEdits(
	tr: Transaction,
	edits: LineEdit[],
	cursor: 'map' | 'lineEnd' | 'keep',
): readonly TransactionSpec[] {
	const newDoc = tr.newDoc;
	const changes = ChangeSet.of(
		edits.map((e) => {
			const start = newDoc.line(e.line + 1).from;
			return { from: start + e.from, to: start + e.to, insert: e.insert };
		}),
		newDoc.length,
	);
	const head = tr.newSelection.main.head;
	let anchor: number;
	if (cursor === 'lineEnd') {
		anchor = changes.apply(newDoc).line(edits[0].line + 1).to;
	} else {
		anchor = changes.mapPos(head, cursor === 'map' ? 1 : -1);
	}
	return [tr, { changes, selection: { anchor }, sequential: true }];
}
