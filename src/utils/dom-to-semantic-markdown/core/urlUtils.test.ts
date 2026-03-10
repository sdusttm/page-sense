import { describe, it, expect } from 'vitest';
import { refifyUrls } from './urlUtils';
import { SemanticMarkdownAST } from '../types/markdownTypes';

describe('urlUtils', () => {
    it('should ignore non-http urls', () => {
        const ast: SemanticMarkdownAST = { type: 'link', href: 'mailto:test@example.com', content: [] };
        const refs = refifyUrls(ast);
        expect((ast as any).href).toBe('mailto:test@example.com');
        expect(refs).toEqual({});
    });

    it('should refify media urls', () => {
        const ast: SemanticMarkdownAST = { type: 'image', src: 'https://example.com/images/photo.jpg', alt: 'photo' };
        const refs = refifyUrls([ast]);
        expect((ast as any).src).toBe('ref0://photo.jpg');
        expect(refs).toEqual({ 'https://example.com/images': 'ref0' });
    });

    it('should refify deeply nested long urls', () => {
        const ast: SemanticMarkdownAST = { type: 'link', href: 'https://example.com/a/b/c/d/e', content: [] };
        const refs = refifyUrls(ast);
        expect((ast as any).href).toBe('ref0');
        expect(refs).toEqual({ 'https://example.com/a/b/c/d/e': 'ref0' });
    });

    it('should not refify short http urls', () => {
        const ast: SemanticMarkdownAST = { type: 'link', href: 'https://example.com/a', content: [] };
        const refs = refifyUrls(ast);
        expect((ast as any).href).toBe('https://example.com/a');
    });

    it('should recursively refify lists and tables', () => {
        const ast: SemanticMarkdownAST = {
            type: 'list',
            ordered: false,
            items: [
                {
                    type: 'listItem',
                    content: [
                        { type: 'image', src: 'https://example.com/img/1.png', alt: '' },
                        { type: 'image', src: 'https://example.com/img/2.png', alt: '' }
                    ]
                }
            ]
        };
        const tableAst: SemanticMarkdownAST = {
            type: 'table',
            rows: [
                { cells: [{ type: 'tableCell', content: [{ type: 'image', src: 'https://example.com/img/3.png', alt: '' }] }] }
            ]
        };
        const refs = refifyUrls([ast, tableAst]);
        expect(refs).toEqual({ 'https://example.com/img': 'ref0' });
    });

    it('should recursively refify blockquotes and semantic htmls', () => {
        const ast: SemanticMarkdownAST = {
            type: 'blockquote',
            content: [
                { type: 'video', src: 'https://example.com/media/vid.mp4', controls: false, poster: '' }
            ]
        };
        const refs = refifyUrls(ast);
        expect((ast as any).content[0].src).toBe('ref0://vid.mp4');
    });
});
