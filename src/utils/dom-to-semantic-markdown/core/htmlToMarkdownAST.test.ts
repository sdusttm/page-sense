import { describe, it, expect, vi } from 'vitest';
import { htmlToMarkdownAST } from './htmlToMarkdownAST';
import { _Node } from './ElementNode';

describe('htmlToMarkdownAST', () => {
    it('should convert heading elements appropriately', () => {
        const div = document.createElement('div');
        div.innerHTML = '<h1>Title</h1><h2>Subtitle</h2>';
        const result = htmlToMarkdownAST(div);
        expect(result).toEqual([
            { type: 'heading', level: 1, content: [{ type: 'text', content: 'Title' }] },
            { type: 'heading', level: 2, content: [{ type: 'text', content: 'Subtitle' }] }
        ]);
    });

    it('should convert paragraphs and add double line break', () => {
        const div = document.createElement('div');
        div.innerHTML = '<p>Hello world</p>';
        const result = htmlToMarkdownAST(div);
        expect(result).toEqual([
            { type: 'text', content: 'Hello world' },
            { type: 'text', content: '\n\n' }
        ]);
    });

    it('should convert images and links', () => {
        const div = document.createElement('div');
        div.innerHTML = '<a href="https://example.com">Click <img src="https://example.com/img.png" alt="An image" /></a>';
        const result = htmlToMarkdownAST(div);
        expect(result).toEqual([
            {
                type: 'link',
                href: 'https://example.com/', // JSDOM forces trailing slash on origins
                content: [
                    { type: 'text', content: 'Click' },
                    { type: 'image', src: 'https://example.com/img.png', alt: 'An image' }
                ]
            }
        ]);
    });

    it('should convert data URLs in images to empty src to save tokens', () => {
        const div = document.createElement('div');
        div.innerHTML = '<img src="data:image/png;base64,iVBOR" alt="Base64 Image" />';
        const result = htmlToMarkdownAST(div);
        expect(result).toEqual([
            { type: 'image', src: '-', alt: 'Base64 Image' }
        ]);
    });

    it('should format interactive elements with data-agent-id', () => {
        const div = document.createElement('div');
        div.innerHTML = '<a href="#" data-agent-id="42">Click me</a>';
        const result = htmlToMarkdownAST(div);
        expect(result).toEqual([
            { type: 'text', content: '[ID: 42] ' },
            {
                type: 'link',
                href: 'http://localhost:3000/#',
                content: [{ type: 'text', content: 'Click me' }]
            }
        ]);
    });

    it('should convert checkboxes and show checked status in ID marker', () => {
        const div = document.createElement('div');
        div.innerHTML = '<div role="checkbox" aria-checked="true" data-agent-id="99">Check</div>';
        const result = htmlToMarkdownAST(div);
        expect(result).toEqual([
            { type: 'text', content: '[ID: 99 ✓] ' },
            { type: 'text', content: 'Check' } // Inherits from default logic
        ]);
    });

    it('should map input, select, button to native ast node types without pure text markers', () => {
        const div = document.createElement('div');
        div.innerHTML = `
            <input type="text" value="hello text" data-agent-id="10" />
            <select data-agent-id="11"><option selected>Option 1</option></select>
            <button data-agent-id="12">Submit</button>
        `;
        const result = htmlToMarkdownAST(div);
        // Note: The marker \`[ID: X] \` should NOT be included for input, select, button.
        expect(result).toEqual([
            { type: 'input', inputType: 'text', value: 'hello text', placeholder: undefined, checked: undefined, disabled: false, agentId: '10' },
            { type: 'select', value: 'Option 1', options: ['Option 1'], disabled: false, agentId: '11' },
            { type: 'button', content: [{ type: 'text', content: 'Submit' }], disabled: false, agentId: '12' }
        ]);
    });

    it('should convert lists', () => {
        const div = document.createElement('div');
        div.innerHTML = '<ul><li>One</li><li>Two</li></ul>';
        const result = htmlToMarkdownAST(div);
        expect(result).toEqual([
            {
                type: 'list',
                ordered: false,
                items: [
                    { type: 'listItem', content: [{ type: 'text', content: 'One' }] },
                    { type: 'listItem', content: [{ type: 'text', content: 'Two' }] }
                ]
            }
        ]);
    });

    it('should convert tables', () => {
        const div = document.createElement('div');
        div.innerHTML = `
            <table>
                <tr><th>Header</th></tr>
                <tr><td>Cell</td></tr>
            </table>
        `;
        const result = htmlToMarkdownAST(div, { enableTableColumnTracking: true });

        // Has a header separator row
        expect(result.length).toBe(1);
        expect(result[0].type).toBe('table');
        const rows = (result[0] as any).rows;
        expect(rows.length).toBe(3); // Header, Separator, Cell
        expect(rows[1].cells[0].content).toBe('---');
        // Check column ids populated
        expect((result[0] as any).colIds.length).toBeGreaterThan(0);
    });

    it('should convert text formatting (bold, italic, strikethrough, code)', () => {
        const div = document.createElement('div');
        div.innerHTML = '<strong>Bold</strong><em>Italic</em><s>Strike</s><code class="language-js">Code</code>';
        const result = htmlToMarkdownAST(div);
        expect(result).toEqual([
            { type: 'bold', content: [{ type: 'text', content: 'Bold' }] },
            { type: 'italic', content: [{ type: 'text', content: 'Italic' }] },
            { type: 'strikethrough', content: [{ type: 'text', content: 'Strike' }] },
            { type: 'code', content: 'Code', language: 'js', inline: true }
        ]);
    });

    it('should execute overrideElementProcessing if provided', () => {
        const div = document.createElement('div');
        div.innerHTML = '<span class="test-override">Secret</span>';

        const overrideElementProcessing = (el: Element) => {
            if (el.className === 'test-override') {
                return [{ type: 'text', content: 'OVERRIDDEN' }] as any;
            }
            return null;
        };

        const result = htmlToMarkdownAST(div, { overrideElementProcessing });
        expect(result).toEqual([
            { type: 'text', content: 'OVERRIDDEN' }
        ]);
    });

    it('should handle inputs, forms, and SVGs', () => {
        const div = document.createElement('div');
        div.innerHTML = `
            <form data-agent-id="1">
                <input type="text" value="hello" data-agent-id="2">
                <input type="checkbox" checked data-agent-id="3">
                <select data-agent-id="4"><option value="opt">A</option></select>
                <textarea data-agent-id="5">Textarea</textarea>
                <svg data-agent-id="6"><path></path></svg>
            </form>
        `;
        const ast = htmlToMarkdownAST(div) as any;
        expect(ast.find((a: any) => a.type === 'input')).toBeDefined();
        expect(ast.find((a: any) => a.type === 'select')).toBeDefined();
    });

    it('should test generic edge cases elements', () => {
        const custom = document.createElement('custom-tag');
        custom.textContent = 'Custom text';
        const ast = htmlToMarkdownAST(custom) as any;
        expect(ast[0].type).toBe('text');
        expect(ast[0].content).toBe('Custom text');

        const label = document.createElement('label');
        label.textContent = 'Label text';
        const ast2 = htmlToMarkdownAST(label) as any;
        expect(ast2[0].type).toBe('text');
        expect(ast2[0].content).toBe('Label text');
    });

    it('should convert semantic tags properly', () => {
        const div = document.createElement('div');
        div.innerHTML = `
            <article>Article</article>
            <aside>Aside</aside>
            <details>Details</details>
            <figcaption>Fig</figcaption>
            <figure>Figure</figure>
            <footer>Footer</footer>
            <header>Header</header>
            <main>Main</main>
            <mark>Mark</mark>
            <nav>Nav</nav>
            <section>Section</section>
            <summary>Summary</summary>
            <time>Time</time>
        `;
        const ast = htmlToMarkdownAST(div) as any;
        expect(ast.filter((a: any) => a.type === 'semanticHtml').length).toBe(13);
    });

    it('should process blockquote and ignore script/style tags', () => {
        const div = document.createElement('div');
        div.innerHTML = '<blockquote>Quote</blockquote><script>js</script><style>css</style><noscript>no</noscript>';
        const ast = htmlToMarkdownAST(div) as any;
        expect(ast.length).toBe(1);
        expect(ast[0].type).toBe('blockquote');
    });

    it('should process video tags', () => {
        const div = document.createElement('div');
        div.innerHTML = '<video src="my.mp4" poster="post.png" controls></video>';
        const ast = htmlToMarkdownAST(div) as any;
        expect(ast[0].type).toBe('video');
    });

    it('should handle processUnhandledElement override correctly', () => {
        const div = document.createElement('div');
        div.innerHTML = '<custom-tag>Test</custom-tag>';
        const processUnhandledElement = (elem: Element) => {
            if (elem.tagName.toLowerCase() === 'custom-tag') return [{ type: 'text', content: 'CUSTOM' }] as any;
            return null;
        };
        const ast = htmlToMarkdownAST(div, { processUnhandledElement }) as any;
        expect(ast[0].content).toBe('CUSTOM');
    });

    it('should parse extended metadata (og, twitter, json-ld) and basic meta tags', () => {
        const doc = document.createElement('html');
        doc.innerHTML = `
            <head>
                <meta property="og:title" content="Open Graph Title">
                <meta name="twitter:card" content="summary">
                <meta name="description" content="Meta Description">
                <meta name="viewport" content="width=device-width">
                <script type="application/ld+json">{"@type": "WebPage"}</script>
                <script type="application/ld+json">{invalid-json}</script>
            </head>
        `;
        const ast = htmlToMarkdownAST(doc, { includeMetaData: 'extended' }) as any;
        expect(ast[0].type).toBe('meta');
        expect(ast[0].content.openGraph.title).toBe('Open Graph Title');
        expect(ast[0].content.twitter.card).toBe('summary');
        expect(ast[0].content.standard.description).toBe('Meta Description');
        expect(ast[0].content.standard.viewport).toBeUndefined();

        const astBasic = htmlToMarkdownAST(doc, { includeMetaData: 'basic' }) as any;
        expect(astBasic[0].content.openGraph).toEqual({});
        expect(astBasic[0].content.jsonLd).toBeUndefined();
    });

    it('should map select element values using selectedIndex natively ignoring select loop bindings', () => {
        const div = document.createElement('div');
        div.innerHTML = '<select><option>Opt 1</option><option>Opt 2</option></select>';
        const select = div.querySelector('select') as HTMLSelectElement;

        // JSDOM dynamically keeps option.selected in sync. We mock it natively false to force the index fallback.
        Object.defineProperty(select.options[0], 'selected', { value: false });
        Object.defineProperty(select.options[1], 'selected', { value: false });
        select.selectedIndex = 1;

        const ast = htmlToMarkdownAST(div) as any;
        expect(ast[0].value).toBe('Opt 2');
    });

    it('should generate debug logs when debug options are supplied', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
        const div = document.createElement('div');
        div.innerHTML = '<p>debug</p>';
        htmlToMarkdownAST(div, { debug: true });
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    it('should skip data:image a href elements natively', () => {
        const div = document.createElement('div');
        div.innerHTML = '<a href="data:image/png">Data Image</a>';
        const result = htmlToMarkdownAST(div) as any;
        expect(result[0].href).toBe('-');
    });

    it('should fallback to # if href is not natively stringifiable', () => {
        const div = document.createElement('div');
        const a = document.createElement('a');
        div.appendChild(a);
        Object.defineProperty(a, 'href', { value: 12345 });
        const result = htmlToMarkdownAST(div) as any;
        expect(result[0].href).toBe('#');
    });

    it('should map <br> line breaks to explicit newline text nodes', () => {
        const div = document.createElement('div');
        div.innerHTML = 'a<br>b';
        const ast = htmlToMarkdownAST(div) as any;
        expect(ast[1].content).toBe('\n');
    });
});
