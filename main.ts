import {
	App,
	Editor,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	moment,
} from 'obsidian';
import { EditorState } from '@codemirror/state';
import { getDailyNoteSettings } from 'obsidian-daily-notes-interface';
import { isHeading } from './src/logic';
import type { Ctx } from './src/logic';
import { createFilter } from './src/filter';

interface TimelogSettings {
	logFormat: string;
	alwaysBullet: boolean;
	stampCompletion: boolean;
	autoAddDateHeading: boolean;
}

const DEFAULT_SETTINGS: TimelogSettings = {
	logFormat: 'HH:mm:ss',
	alwaysBullet: true,
	stampCompletion: true,
	autoAddDateHeading: true,
};

const DEFAULT_HEADER_FORMAT = 'YYYY-MM-DD';

export default class TimelogPlugin extends Plugin {
	settings: TimelogSettings;

	dailyNoteFormat: string = DEFAULT_HEADER_FORMAT;
	statusBarItemEl: HTMLElement;

	async onload() {
		await this.loadSettings();

		const dailySettings = getDailyNoteSettings();
		this.dailyNoteFormat = dailySettings?.format || DEFAULT_HEADER_FORMAT;

		this.registerEditorExtension(
			EditorState.transactionFilter.of(createFilter(() => this.ctx())),
		);

		this.statusBarItemEl = this.addStatusBarItem();
		this.statusBarItemEl.hide();
		this.updateStatusBar();

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => this.updateStatusBar()),
		);
		this.registerEvent(
			this.app.workspace.on('editor-change', (editor) => this.updateStatusBar(editor)),
		);

		this.addCommand({
			id: 'start-log-entry',
			name: 'Start log entry',
			editorCallback: (editor: Editor) => {
				const date = moment().format(this.dailyNoteFormat);
				const bullet = this.settings.alwaysBullet ? '- ' : '';
				editor.replaceSelection(`## [[${date}]]\n${bullet}**${this.now()}**: `);
				this.updateStatusBar(editor);
			},
		});

		this.addCommand({
			id: 'jump-to-latest-log-header',
			name: 'Jump to latest log header',
			editorCallback: (editor: Editor) => {
				const targetLine = this.findLatestDatedHeader(editor);
				if (targetLine === null) {
					new Notice('No dated headers found');
					return;
				}

				const desiredLine = targetLine + 1;
				if (desiredLine >= editor.lineCount()) {
					const headerText = editor.getLine(targetLine);
					editor.replaceRange('\n', {
						line: targetLine,
						ch: headerText.length,
					});
				}

				const cursorLine = Math.min(targetLine + 1, editor.lineCount() - 1);
				const cursor = { line: cursorLine, ch: 0 };
				editor.setCursor(cursor);
				editor.scrollIntoView({ from: cursor, to: cursor }, true);
			},
		});

		this.addSettingTab(new TimelogSettingTab(this.app, this));
	}

	ctx(): Ctx {
		return {
			headerDate: (line) => this.extractHeaderDate(line)?.format(this.dailyNoteFormat) ?? null,
			isStamp: (text) => moment(text, this.settings.logFormat, true).isValid(),
			now: () => this.now(),
			today: () => moment().format(this.dailyNoteFormat),
			alwaysBullet: this.settings.alwaysBullet,
			autoHeading: this.settings.autoAddDateHeading,
			stampCompletion: this.settings.stampCompletion,
		};
	}

	now(): string {
		return moment().format(this.settings.logFormat || DEFAULT_SETTINGS.logFormat);
	}

	findLatestDatedHeader(editor: Editor): number | null {
		let latestLine: number | null = null;
		let latestDate: moment.Moment | null = null;
		const lines = editor.lineCount();

		for (let lineNumber = 0; lineNumber < lines; lineNumber++) {
			const parsed = this.extractHeaderDate(editor.getLine(lineNumber));
			if (!parsed) {
				continue;
			}

			if (!latestDate || parsed.isAfter(latestDate)) {
				latestDate = parsed;
				latestLine = lineNumber;
			}
		}

		return latestLine;
	}

	extractHeaderDate(line: string): moment.Moment | null {
		const trimmed = line.trim();
		if (!isHeading(trimmed)) {
			return null;
		}

		const content = trimmed.replace(/^#+\s*/, '').trim();
		const linkMatch = content.match(/\[\[(.+?)\]\]/);
		const linkContent = linkMatch ? linkMatch[1] : content;
		const dateText = linkContent.split('|')[0];
		const parsed = moment(dateText, this.dailyNoteFormat, true);

		return parsed.isValid() ? parsed : null;
	}

	updateStatusBar(editor?: Editor) {
		if (!this.statusBarItemEl) {
			return;
		}

		const activeEditor = editor ?? this.getActiveEditor();
		if (!activeEditor || !this.hasDatedHeader(activeEditor)) {
			this.statusBarItemEl.hide();
			return;
		}

		this.statusBarItemEl.show();
		this.statusBarItemEl.setText('Timeseq active');
	}

	getActiveEditor(): Editor | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		return view?.editor ?? null;
	}

	hasDatedHeader(editor: Editor): boolean {
		const lines = editor.lineCount();
		for (let lineNumber = 0; lineNumber < lines; lineNumber++) {
			if (this.extractHeaderDate(editor.getLine(lineNumber))) {
				return true;
			}
		}
		return false;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class TimelogSettingTab extends PluginSettingTab {
	plugin: TimelogPlugin;

	constructor(app: App, plugin: TimelogPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Log format')
			.setDesc('Moment.js format of the timestamp, e.g. HH:mm:ss')
			.addMomentFormat((format) =>
				format
					.setDefaultFormat(DEFAULT_SETTINGS.logFormat)
					.setValue(this.plugin.settings.logFormat ?? DEFAULT_SETTINGS.logFormat)
					.onChange(async (value) => {
						this.plugin.settings.logFormat = value || DEFAULT_SETTINGS.logFormat;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Always use bullets')
			.setDesc('When pressing Enter on a line that is not a list item, start a bullet ("- ") before the timestamp')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.alwaysBullet).onChange(async (value) => {
					this.plugin.settings.alwaysBullet = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Completion time on tasks')
			.setDesc('When a timestamped task is checked, append " ✅ <time>". Unchecking removes it.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.stampCompletion).onChange(async (value) => {
					this.plugin.settings.stampCompletion = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Auto-add date heading')
			.setDesc('Automatically add a new date heading when the date rolls over (e.g., after midnight)')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoAddDateHeading).onChange(async (value) => {
					this.plugin.settings.autoAddDateHeading = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
