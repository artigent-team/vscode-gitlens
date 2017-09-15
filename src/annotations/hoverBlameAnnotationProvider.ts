'use strict';
import { DecorationOptions, Range } from 'vscode';
import { FileAnnotationType } from './annotationController';
import { Annotations, endOfLineIndex } from './annotations';
import { BlameAnnotationProviderBase } from './blameAnnotationProvider';
import { GitBlameCommit } from '../gitService';
import { Logger } from '../logger';

export class HoverBlameAnnotationProvider extends BlameAnnotationProviderBase {

    async provideAnnotation(shaOrLine?: string | number): Promise<boolean> {
        this.annotationType = FileAnnotationType.Hover;

        const blame = await this.getBlame(this._config.annotations.file.hover.heatmap.enabled);
        if (blame === undefined) return false;

        const start = process.hrtime();

        const cfg = this._config.annotations.file.hover;

        const now = Date.now();
        const offset = this.uri.offset;
        const renderOptions = Annotations.hoverRenderOptions(this._config.theme, cfg.heatmap);
        const dateFormat = this._config.defaultDateFormat;

        const decorations: DecorationOptions[] = [];
        const decorationsMap: { [sha: string]: DecorationOptions } = Object.create(null);
        const document = this.document;

        let commit: GitBlameCommit | undefined;
        let hasRemotes: boolean | undefined;
        let hover: DecorationOptions | undefined;

        for (const l of blame.lines) {
            const line = l.line + offset;

            hover = decorationsMap[l.sha];

            if (hover !== undefined) {
                hover = { ...hover } as DecorationOptions;

                if (cfg.wholeLine) {
                    hover.range = document.validateRange(new Range(line, 0, line, endOfLineIndex));
                }
                else {
                    const endIndex = document.lineAt(line).firstNonWhitespaceCharacterIndex;
                    hover.range = new Range(line, 0, line, endIndex);
                }

                decorations.push(hover);

                continue;
            }

            commit = blame.commits.get(l.sha);
            if (commit === undefined) continue;

            if (hasRemotes === undefined) {
                hasRemotes = this.git.hasRemotes(commit.repoPath);
            }

            hover = Annotations.hover(commit, renderOptions, cfg.heatmap.enabled, dateFormat, hasRemotes);

            if (cfg.wholeLine) {
                hover.range = document.validateRange(new Range(line, 0, line, endOfLineIndex));
            }
            else {
                const endIndex = document.lineAt(line).firstNonWhitespaceCharacterIndex;
                hover.range = new Range(line, 0, line, endIndex);
            }

            if (cfg.heatmap.enabled) {
                Annotations.applyHeatmap(hover, commit.date, now);
            }

            decorations.push(hover);
            decorationsMap[l.sha] = hover;

        }

        if (decorations.length) {
            this.editor.setDecorations(this.decoration!, decorations);
        }

        const duration = process.hrtime(start);
        Logger.log(`${(duration[0] * 1000) + Math.floor(duration[1] / 1000000)} ms to compute hover blame annotations`);

        this.selection(shaOrLine, blame);
        return true;
    }
}