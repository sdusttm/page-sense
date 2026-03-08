import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { validateApiKey } from '@/utils/auth';

export const maxDuration = 60;

export async function POST(req: Request) {
    const authResult = await validateApiKey(req);
    if (authResult.error) {
        return new Response(JSON.stringify({ error: authResult.error }), { status: authResult.status, headers: { 'Content-Type': 'application/json' } });
    }

    try {
        const { instruction, snapshot } = await req.json();

        if (!instruction || !snapshot) {
            return new Response(JSON.stringify({ error: 'Instruction and snapshot are required' }), { status: 400 });
        }

        console.log("AGENT API HAS RECEIVED INSTRUCTION: ", instruction);

        const { object } = await generateObject({
            model: openai('gpt-4o-mini'),
            schema: z.object({
                commands: z.array(z.object({
                    action: z.enum(['click', 'type']),
                    agent_id: z.string().describe('The data-agent-id of the node to interact with. Must be drawn directly from the snapshot.'),
                    value: z.string().describe('The string to type, if the action is "type", otherwise an empty string.'),
                    reasoning: z.string().describe('Brief reasoning for why this node was chosen.')
                }))
            }),
            system: `You are an autonomous AI web agent operating inside a browser.
You will be given a Markdown snapshot of the current DOM. Note that ALL interactive elements in this snapshot have been annotated with a \`data-agent-id\` attribute.
Your job is to read the user's INSTRUCTION, look at the DOM snapshot, and figure out the sequence of actions required to fulfill the user's instruction.
You MUST output the exact \`data-agent-id\` of the target elements for the actions. Never guess an ID that is not explicitly in the snapshot.

Available actions:
- click: clicks an element (button, link, etc)
- type: types into an input or textarea element (requires providing the 'value' field)

If you cannot find the requested element, or the requested action is impossible, return an empty commands array.`,
            prompt: `Instruction: ${instruction}\n\nDOM Snapshot:\n${snapshot}`,
        });

        return new Response(JSON.stringify({ commands: object.commands }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error) {
        console.error('Agent API Error:', error);
        return new Response(JSON.stringify({ error: 'Failed to process instruction' }), { status: 500 });
    }
}
