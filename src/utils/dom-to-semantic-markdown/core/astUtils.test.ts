import { describe, it, expect } from 'vitest';
import { getMainContent, findInAST, findAllInAST } from './astUtils';
import { SemanticMarkdownAST } from '../types/markdownTypes';

describe('astUtils', () => {
    describe('getMainContent', () => {
        it('should extract content within <-main-> tags', () => {
            const str = "Intro\n<-main->\nCore Content Here\n</-main->\nOutro";
            expect(getMainContent(str)).toBe("\nCore Content Here\n");
        });

        it('should remove nav, footer, header, aside if no main tag', () => {
            const str = "<-header->head</-header->\nContent\n<-nav->nav</-nav->\n<-aside->aside</-aside->\n<-footer->foot</-footer->";
            expect(getMainContent(str)).toBe("\nContent\n\n\n");
        });
    });

    describe('findInAST', () => {
        it('should find the first matching node in AST', () => {
            const ast: SemanticMarkdownAST[] = [
                { type: 'text', content: 'hello' },
                { type: 'link', href: 'url', content: [{ type: 'image', src: 'img.png', alt: 'img' }] }
            ];
            const found = findInAST(ast, (node) => node.type === 'image');
            expect(found).toBeDefined();
            expect(found?.type).toBe('image');
        });

        it('should return undefined if not found', () => {
            const ast: SemanticMarkdownAST = { type: 'text', content: 'plain' };
            const found = findInAST(ast, (node) => node.type === 'table');
            expect(found).toBeUndefined();
        });
    });

    describe('findAllInAST', () => {
        it('should find all matching nodes in AST', () => {
            const ast: SemanticMarkdownAST = {
                type: 'list',
                ordered: false,
                items: [
                    { type: 'listItem', content: [{ type: 'text', content: 'T1' }, { type: 'link', href: '#1', content: [] }] },
                    { type: 'listItem', content: [{ type: 'link', href: '#2', content: [] }] }
                ]
            };
            const found = findAllInAST(ast, (node) => node.type === 'link');
            expect(found.length).toBe(2);
            expect((found[0] as any).href).toBe('#1');
            expect((found[1] as any).href).toBe('#2');
        });

        it('should return empty array if no match', () => {
            const ast: SemanticMarkdownAST = { type: 'text', content: 'only text' };
            const found = findAllInAST(ast, (n) => n.type === 'image');
            expect(found).toEqual([]);
        });

        it('should recurse on table and extract matching elements', () => {
            const ast: SemanticMarkdownAST = {
                type: 'table',
                rows: [
                    { cells: [{ type: 'tableCell', content: [{ type: 'link', href: 'url', content: [] }] }] }
                ]
            };
            const found = findAllInAST(ast, (n) => n.type === 'link');
            expect(found.length).toBe(1);
        });

        it('should recurse on blockquote and semanticHtml', () => {
            const ast1: SemanticMarkdownAST = { type: 'blockquote', content: [{ type: 'image', src: 'img.png', alt: '' }] };
            const ast2: SemanticMarkdownAST = { type: 'semanticHtml', htmlType: 'article', content: [{ type: 'image', src: 'img2.png', alt: '' }] };

            expect(findAllInAST(ast1, n => n.type === 'image').length).toBe(1);
            expect(findInAST(ast1, n => n.type === 'image')).toBeDefined();

            expect(findAllInAST(ast2, n => n.type === 'image').length).toBe(1);
            expect(findInAST(ast2, n => n.type === 'image')).toBeDefined();
        });

        it('should recurse on table for findInAST', () => {
            const ast: SemanticMarkdownAST = {
                type: 'table',
                rows: [
                    { cells: [{ type: 'tableCell', content: [{ type: 'link', href: 'url', content: [] }] }] }
                ]
            };
            expect(findInAST(ast, n => n.type === 'link')).toBeDefined();
            expect(findInAST(ast, n => n.type === 'image')).toBeUndefined();
        });

        it('should handle findInAST with lists', () => {
            const ast: SemanticMarkdownAST = {
                type: 'list',
                ordered: true,
                items: [
                    { type: 'listItem', content: [{ type: 'image', src: 'img3.png', alt: '' }] }
                ]
            };
            expect(findInAST(ast, n => n.type === 'image')).toBeDefined();
        });
    });
});
