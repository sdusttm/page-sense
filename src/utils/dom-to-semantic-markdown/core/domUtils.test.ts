import { describe, it, expect, beforeEach } from 'vitest';
import { findMainContent, wrapMainContent, calculateScore } from './domUtils';

describe('domUtils', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    describe('findMainContent', () => {
        it('should return existing <main> element', () => {
            document.body.innerHTML = `
                <header>Header</header>
                <main id="the-main">Main Content</main>
                <footer>Footer</footer>
            `;
            const main = findMainContent(document);
            expect(main.id).toBe('the-main');
            expect(main.tagName.toLowerCase()).toBe('main');
        });

        it('should return element with role="main"', () => {
            document.body.innerHTML = `
                <header>Header</header>
                <div role="main" id="role-main">Role main</div>
            `;
            const main = findMainContent(document);
            expect(main.id).toBe('role-main');
        });

        it('should detect candidate based on highest score heuristics and independence', () => {
            document.body.innerHTML = `
                <nav>Nav</nav>
                <div id="content" class="article">
                    <p>Paragraph 1</p>
                    <p>Paragraph 2</p>
                    <p>Paragraph 3</p>
                    <span>More text goes here. ` + 'Text '.repeat(50) + `</span>
                    <div id="nested" class="article">
                        <p>Paragraph 4</p>
                        <p>Paragraph 5</p>
                    </div>
                </div>
                <footer>Footer</footer>
            `;
            const main = findMainContent(document);
            expect(main.id).toBe('content'); // Should pick the outer independent one
        });

        it('should return documentdocumentElement if body does not exist', () => {
            const doc = document.implementation.createHTMLDocument();
            doc.documentElement.removeChild(doc.body);
            const main = findMainContent(doc);
            expect(main.tagName.toLowerCase()).toBe('html');
        });

        it('should return root element immediately if no candidates are populated', () => {
            // A completely empty document body generates 0 candidates since there are no score-able texts or tags
            const doc = document.implementation.createHTMLDocument();
            doc.body.innerHTML = '';
            const main = findMainContent(doc);
            expect(main.tagName.toLowerCase()).toBe('body');
        });

        it('should identify completely independent candidates accurately from multiple nested blocks', () => {
            document.body.innerHTML = `
                <div id="master">
                    <section id="independent1" class="main-content">
                        <p>1</p><p>2</p><p>3</p>
                    </section>
                    <section id="independent2" class="main-content" data-main="true">
                        <p>4</p><p>5</p><p>6</p><p>7</p>
                    </section>
                </div>
            `;
            const main = findMainContent(document);
            expect(main.id).toBe('independent2');
        });
    });

    describe('wrapMainContent', () => {
        it('should wrap element in <main> if it is not already', () => {
            document.body.innerHTML = `
                <div id="content">Hello</div>
            `;
            const el = document.getElementById('content') as Element;
            wrapMainContent(el, document);
            expect(el.parentElement?.tagName.toLowerCase()).toBe('main');
            expect(el.parentElement?.id).toBe('detected-main-content');
        });

        it('should not wrap if it is already <main>', () => {
            document.body.innerHTML = `
                <main id="content">Hello</main>
            `;
            const el = document.getElementById('content') as Element;
            wrapMainContent(el, document);
            expect(el.parentElement?.tagName.toLowerCase()).toBe('body'); // not wrapped further
        });
    });

    describe('calculateScore', () => {
        it('should assign score based on classes, tags, paragraphs, and data attributes', () => {
            const el = document.createElement('article');
            el.className = 'main-content';
            el.setAttribute('data-main', 'true');
            el.setAttribute('role', 'main');
            el.innerHTML = '<p>1</p><p>2</p>';

            const score = calculateScore(el);
            // Class impact: 10
            // Tag impact (article): 5
            // Paragraphs: 2
            // data-main: 10
            // role main: 10
            // link density: 0 (boost 5)
            // Total: 42
            expect(score).toBeGreaterThan(40);
        });

        it('should trace textContent limits and link empty nodes', () => {
            const el = document.createElement('div');
            el.innerHTML = '<a></a><a>Link with text</a>' + 'Text '.repeat(50);

            const score = calculateScore(el);
            expect(score).toBeGreaterThan(0);
        });

        it('should output extensive debug logs internally when score elements exist', () => {
            // In JSDOM, text content size and link calculations are straightforward. 
            // We just construct a long block to hit text content length > 200 paths
            const el = document.createElement('main');
            el.innerHTML = '<p>A</p><p>B</p><p>C</p><p>D</p><p>E</p><p>F</p>' + 'Very Long Content Block '.repeat(50);
            const score = calculateScore(el);
            expect(score).toBeGreaterThan(5);
        });
    });
});
