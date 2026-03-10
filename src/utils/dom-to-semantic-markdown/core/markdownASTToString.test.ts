import { describe, it, expect } from 'vitest';
import { markdownASTToString } from './markdownASTToString';
import { SemanticMarkdownAST } from '../types/markdownTypes';

describe('markdownASTToString', () => {
    it('should return empty string for empty input', () => {
        expect(markdownASTToString([])).toBe('');
    });

    it('should render basic text, bold, italic, and strikethrough', () => {
        const ast: SemanticMarkdownAST[] = [
            { type: 'text', content: 'hello ' },
            { type: 'bold', content: [{ type: 'text', content: 'world' }] },
            { type: 'text', content: ' ' },
            { type: 'italic', content: [{ type: 'text', content: 'test' }] },
            { type: 'text', content: ' ' },
            { type: 'strikethrough', content: [{ type: 'text', content: 'strike' }] }
        ];
        expect(markdownASTToString(ast)).toBe('hello **world** *test* ~~strike~~');
    });

    it('should render headings', () => {
        const ast: SemanticMarkdownAST[] = [
            { type: 'heading', level: 1, content: [{ type: 'text', content: 'H1' }] },
            { type: 'heading', level: 2, content: [{ type: 'text', content: 'H2' }] }
        ];
        expect(markdownASTToString(ast)).toBe('# H1\n\n## H2');
    });

    it('should render links and images', () => {
        const ast: SemanticMarkdownAST[] = [
            { type: 'link', href: 'https://foo.com', content: [{ type: 'text', content: 'Foo' }] },
            { type: 'text', content: ' ' },
            { type: 'image', src: 'img.png', alt: 'Test Img' }
        ];
        expect(markdownASTToString(ast)).toBe('[Foo](https://foo.com) \n![Test Img](img.png)');
    });

    it('should render lists', () => {
        const ast: SemanticMarkdownAST[] = [
            {
                type: 'list',
                ordered: true,
                items: [
                    { type: 'listItem', content: [{ type: 'text', content: 'A' }] },
                    { type: 'listItem', content: [{ type: 'text', content: 'B' }] }
                ]
            }
        ];
        expect(markdownASTToString(ast)).toBe('1. A\n2. B');
    });

    it('should render tables with colspan', () => {
        const ast: SemanticMarkdownAST[] = [
            {
                type: 'table',
                rows: [
                    {
                        cells: [
                            { type: 'tableCell', content: [{ type: 'text', content: 'Col 1' }] }
                        ]
                    }
                ]
            }
        ];
        expect(markdownASTToString(ast)).toBe('| Col 1 |');
    });

    it('should render code blocks', () => {
        const ast: SemanticMarkdownAST[] = [
            { type: 'code', inline: true, content: 'const a = 1;', language: '' },
            { type: 'code', inline: false, content: 'function() {}', language: 'js' }
        ];
        expect(markdownASTToString(ast).replace(/\\r/g, '')).toBe('`const a = 1;`\n```js\nfunction() {}\n```');
    });

    it('should render interactive elements (input, select, button)', () => {
        const ast: SemanticMarkdownAST[] = [
            { type: 'input', inputType: 'text', value: 'foo', agentId: '1' },
            { type: 'select', value: 'yes', options: ['yes', 'no'], agentId: '2' },
            { type: 'button', content: [{ type: 'text', content: 'Click' }], agentId: '3' }
        ];
        // Includes spacing based on block/inline heuristics
        const str = markdownASTToString(ast);
        expect(str).toContain('[Input Type: text ID: 1] Value: "foo"');
        expect(str).toContain('[Select ID: 2] Current Value: "yes" Options: "yes", "no"');
        expect(str).toContain('[Button ID: 3] Click');
    });

    it('should render semantic HTML blocks', () => {
        const ast: SemanticMarkdownAST[] = [
            { type: 'semanticHtml', htmlType: 'section', content: [{ type: 'text', content: 'Section' }] },
            { type: 'semanticHtml', htmlType: 'header', content: [{ type: 'text', content: 'Head' }] }
        ];
        const str = markdownASTToString(ast);
        expect(str).toContain('---\n\nSection\n\n---');
        expect(str).toContain('<!-- <header> -->\nHead\n<!-- </header> -->');
    });

    it('should render metadata if options are provided', () => {
        const ast: SemanticMarkdownAST[] = [
            {
                type: 'meta',
                content: {
                    standard: { title: 'Test Title' },
                    openGraph: { 'og:image': 'img.png' },
                    jsonLd: [{ '@type': 'WebPage', name: 'Home' }]
                }
            } as any
        ];
        const str = markdownASTToString(ast, { includeMetaData: 'extended' });
        expect(str).toContain('title: "Test Title"');
        expect(str).toContain('openGraph:\n  og:image: "img.png"');
        expect(str).toContain('schema:\n  WebPage:');
    });

    it('should extract text from missing or unknown nodes', () => {
        const unknown: any = { type: 'unknown_node', content: 'Fallback content' };
        expect(markdownASTToString(unknown)).toBe('');
        const empty: any = { type: 'unknown_node' };
        expect(markdownASTToString(empty)).toBe('');
        const textArray: any = [{ type: 'unknown', content: [{ type: 'text', content: 'Nested' }] }];
        expect(markdownASTToString(textArray)).toBe('');
    });

    it('should extract text from semanticHtml without wrapper', () => {
        const ast: SemanticMarkdownAST[] = [{
            type: 'semanticHtml',
            htmlType: 'article',
            content: [{ type: 'text', content: 'Semantic text' }]
        }];
        expect(markdownASTToString(ast)).toBe('Semantic text');
    });
});
