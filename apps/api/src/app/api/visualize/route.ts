import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { validateApiKey } from '@/utils/auth';

export async function POST(req: Request) {
    const authResult = await validateApiKey(req);
    if (authResult.error) {
        return new Response(JSON.stringify({ error: authResult.error }), { status: authResult.status, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const { snapshot } = await req.json();

        if (!snapshot) {
            return new Response('Missing snapshot', { status: 400 });
        }

        if (!process.env.OPENAI_API_KEY) {
            return new Response('Missing OpenAI API Key in backend', { status: 500 });
        }

        const prompt = `
      You are an expert frontend developer. 
      I will provide you with a semantic markdown snapshot of a web page's DOM structure.
      Your task is to "draw" or synthesize what this page looks like by writing clean HTML and Tailwind CSS.
      Do not write any markdown blocks, just return pure HTML.
      Try to infer layout, spacing, colors and structure based on the content and roles in the snapshot.
      Make educated guesses for missing styles to make it look like a modern website.

      Here is the snapshot:
      ${snapshot}
    `;

        const { text } = await generateText({
            model: openai('gpt-4o-mini'),
            prompt,
        });

        let textHtml = text.trim();
        if (textHtml.startsWith('```')) {
            // Remove first line (e.g. ```html)
            textHtml = textHtml.replace(/^```[a-z]*\s*\n/, '');
            // Remove last line (```)
            textHtml = textHtml.replace(/\n\s*```$/, '');
        }

        return new Response(JSON.stringify({ html: textHtml }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error: unknown) {
        console.error('Visualization error:', error);
        return new Response(error instanceof Error ? error.message : 'Error generating visualization', { status: 500 });
    }
}
