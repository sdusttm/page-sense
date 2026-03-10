import { describe, it, expect } from 'vitest';
import { convertHtmlToMarkdown, convertElementToMarkdown, findInMarkdownAST, findAllInMarkdownAST } from './index';
import { SemanticMarkdownAST } from './types/markdownTypes';

describe('dom-to-semantic-markdown export index', () => {
    describe('convertHtmlToMarkdown', () => {
        it('should correctly parse HTML string and return markdown', () => {
            const html = '<html><body><h1>Test</h1><p>Body content</p></body></html>';
            const md = convertHtmlToMarkdown(html);
            expect(md).toContain('# Test');
            expect(md).toContain('Body content');
        });

        it('should extract main content if option is provided', () => {
            const html = '<html><body><nav>nav</nav><main>Main Section</main><footer>foot</footer></body></html>';
            const md = convertHtmlToMarkdown(html, { extractMainContent: true });
            expect(md).toContain('Main Section');
            expect(md).not.toContain('nav');
            expect(md).not.toContain('foot'); // Depends on ast removal, but realistically should be mostly main
        });

        it('should extract metadata if option is provided', () => {
            const html = '<html><head><title>Meta Title</title></head><body>body</body></html>';
            const md = convertHtmlToMarkdown(html, { includeMetaData: 'standard' });
            expect(md).toContain('title: "Meta Title"');
            expect(md).toContain('body');
        });

        it('should extract main content AND metadata if both options provided', () => {
            const html = '<html><head><title>Head Title</title></head><body><main>Main Body</main></body></html>';
            const md = convertHtmlToMarkdown(html, { extractMainContent: true, includeMetaData: 'standard' });
            expect(md).toContain('title: "Head Title"');
            expect(md).toContain('Main Body');
        });

        it('should use overrideDOMParser if provided', () => {
            const fakeParser = {
                parseFromString: () => {
                    const doc = document.implementation.createHTMLDocument();
                    doc.body.innerHTML = 'Override';
                    return doc;
                }
            };
            const md = convertHtmlToMarkdown('<p>Original</p>', { overrideDOMParser: fakeParser as any });
            expect(md).toContain('Override');
        });
    });

    describe('convertElementToMarkdown', () => {
        it('should convert an explicit DOM element', () => {
            const div = document.createElement('div');
            div.innerHTML = '<strong>Bold Text</strong>';
            const md = convertElementToMarkdown(div);
            expect(md).toBe('**Bold Text**');
        });

        it('should refify URLs if options.refifyUrls is true', () => {
            const div = document.createElement('div');
            div.innerHTML = '<img src="https://example.com/img.png" alt="img" />';
            const options: any = { refifyUrls: true };
            const md = convertElementToMarkdown(div, options);
            expect(md).toContain('![img](ref0://img.png)');
            expect(options.urlMap).toEqual({ 'https://example.com': 'ref0' });
        });
    });

    describe('find functionality hooks', () => {
        it('should wrap findInAST and findAllInAST', () => {
            const ast: SemanticMarkdownAST = { type: 'link', href: '#', content: [{ type: 'text', content: 'hello' }] };
            const foundNode = findInMarkdownAST(ast, (node) => node.type === 'text');
            expect(foundNode).toBeDefined();

            const foundNodes = findAllInMarkdownAST(ast, (node) => node.type === 'link');
            expect(foundNodes.length).toBe(1);
        });
    });
});
