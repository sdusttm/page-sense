import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    annotateInteractiveElements,
    clearAnnotations,
    clearVisualAnnotations,
    syncStateToAttributes,
    temporarilyExpandDropdowns,
    temporarilyShowHiddenElements
} from './annotator';

describe('annotator.ts utilities', () => {
    beforeEach(() => {
        document.body.innerHTML = ''; // Reset DOM before each test
    });

    describe('annotateInteractiveElements', () => {
        it('should correctly annotate interactive elements with data-agent-id', () => {
            document.body.innerHTML = `
                <div>
                    <button id="btn1">Button 1</button>
                    <a href="#" id="link1">Link 1</a>
                    <span id="span1">Just text</span>
                    <input type="text" id="input1" />
                    <div role="button" id="divBtn">Role Button</div>
                    <p tabindex="0" id="focusP">Focusable P</p>
                </div>
            `;
            const count = annotateInteractiveElements(document.body);

            // Should annotate: button, a, input, div[role=button], p[tabindex=0] -> 5 elements
            expect(count).toBe(5);

            expect(document.getElementById('btn1')?.getAttribute('data-agent-id')).toBe('1');
            expect(document.getElementById('link1')?.getAttribute('data-agent-id')).toBe('2');
            expect(document.getElementById('span1')?.hasAttribute('data-agent-id')).toBe(false);
            expect(document.getElementById('input1')?.getAttribute('data-agent-id')).toBe('3');
            expect(document.getElementById('divBtn')?.getAttribute('data-agent-id')).toBe('4');
            expect(document.getElementById('focusP')?.getAttribute('data-agent-id')).toBe('5');
        });

        it('should skip ai monitor root', () => {
            document.body.innerHTML = `
                <div id="ai-page-sense-monitor-root">
                    <button>Monitor Button</button>
                </div>
                <button id="realBtn">Real Button</button>
            `;
            const count = annotateInteractiveElements(document.body);
            expect(count).toBe(1); // Only the real button
            expect(document.getElementById('realBtn')?.getAttribute('data-agent-id')).toBe('1');
        });
    });

    describe('clearAnnotations', () => {
        it('should remove data-agent-id from all elements', () => {
            document.body.innerHTML = `
                <button data-agent-id="1">Btn1</button>
                <div data-agent-id="2">Div1</div>
            `;
            clearAnnotations(document.body);
            expect(document.querySelectorAll('[data-agent-id]').length).toBe(0);
        });
    });

    describe('clearVisualAnnotations', () => {
        it('should remove elements with .page-sense-agent-marker', () => {
            document.body.innerHTML = `
                <div>
                    <span class="page-sense-agent-marker">1</span>
                    <button>Click</button>
                </div>
            `;
            clearVisualAnnotations(document.body);
            expect(document.querySelectorAll('.page-sense-agent-marker').length).toBe(0);
            expect(document.querySelectorAll('button').length).toBe(1);
        });
    });

    describe('syncStateToAttributes', () => {
        it('should sync select option selected state to attribute', () => {
            document.body.innerHTML = `
                <select id="mySelect">
                    <option value="1">One</option>
                    <option value="2">Two</option>
                </select>
            `;
            const select = document.getElementById('mySelect') as HTMLSelectElement;
            select.value = "2"; // programmatically change it

            syncStateToAttributes(document.body);

            const options = select.querySelectorAll('option');
            expect(options[0].hasAttribute('selected')).toBe(false);
            expect(options[1].getAttribute('selected')).toBe('selected');
        });

        it('should sync checkbox and radio checked state to attribute', () => {
            document.body.innerHTML = `
                <input type="checkbox" id="myCheck" />
                <input type="radio" id="myRadio" />
            `;
            const check = document.getElementById('myCheck') as HTMLInputElement;
            const radio = document.getElementById('myRadio') as HTMLInputElement;
            check.checked = true;
            radio.checked = true;

            syncStateToAttributes(document.body);

            expect(check.getAttribute('checked')).toBe('checked');
            expect(radio.getAttribute('checked')).toBe('checked');

            check.checked = false;
            syncStateToAttributes(document.body);
            expect(check.hasAttribute('checked')).toBe(false);
        });

        it('should sync text input and textarea values to attribute', () => {
            document.body.innerHTML = `
                <input type="text" id="myText" />
                <textarea id="myTextarea"></textarea>
            `;
            const text = document.getElementById('myText') as HTMLInputElement;
            const textarea = document.getElementById('myTextarea') as HTMLTextAreaElement;
            text.value = "hello";
            textarea.value = "world";

            syncStateToAttributes(document.body);

            expect(text.getAttribute('value')).toBe('hello');
            expect(textarea.getAttribute('value')).toBe('world');
        });
    });

    describe('temporarilyExpandDropdowns', () => {
        it('should set aria-expanded=true and return a restore function', () => {
            document.body.innerHTML = `
                <button id="trigger" aria-expanded="false" aria-controls="menu1">Dropdown</button>
                <div id="menu1" aria-hidden="true">Menu Items</div>
            `;

            const restore = temporarilyExpandDropdowns();

            const trigger = document.getElementById('trigger');
            const menu = document.getElementById('menu1');

            expect(trigger?.getAttribute('aria-expanded')).toBe('true');
            expect(menu?.getAttribute('aria-hidden')).toBe('false');

            // Now call restore
            restore();

            expect(trigger?.getAttribute('aria-expanded')).toBe('false');
            expect(menu?.getAttribute('aria-hidden')).toBe('true');
        });

        it('should handle elements without existing aria-expanded', () => {
            document.body.innerHTML = `
                <button id="trigger" class="dropdown">Dropdown</button>
            `;
            const restore = temporarilyExpandDropdowns();
            const trigger = document.getElementById('trigger');

            expect(trigger?.getAttribute('aria-expanded')).toBe('true');

            restore();

            expect(trigger?.hasAttribute('aria-expanded')).toBe(false); // Should be removed since it wasn't there originally
        });
    });

    describe('temporarilyShowHiddenElements', () => {
        it('should visually unhide display:none checkbox wrappers and return a restore function', () => {
            document.body.innerHTML = `
                <div id="wrapper" style="display: none;">
                    <input type="checkbox" id="chk" />
                </div>
            `;

            const wrapper = document.getElementById('wrapper');
            const chk = document.getElementById('chk');

            const restore = temporarilyShowHiddenElements();

            // JSDOM doesn't compute standard browser layout well, so we test that the fallback style logic was hit
            expect(wrapper?.style.getPropertyValue('display')).toBe('block');

            restore();

            expect(wrapper?.style.getPropertyValue('display')).toBe('none');
        });
    });
});
