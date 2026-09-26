import { GoogleGenAI, Type } from '@google/genai';
import type { ApiHandler } from './_types';
import { fail, ok } from './_types';
import { GEMINI_TEXT_MODEL } from './_models';
import { capChars, serverTimeout, stripBannedWords } from './_util';

interface AIMoveRequest {
  stateSummary: string;
  topMoves: { id: string; desc: string; score: number }[];
}

const PERSONA = `You are a cartoon rival in a fighting game called Broskis. 
You are arrogant, confident, and you talk down to your opponent.
You must choose one of the 3 provided moves and say a taunt.
Your taunt must be short (maximum 8 words), in English only, funny, but never use real insults or swear words.
Never use the word "AI", "bot", or admit you are a machine. You are a real, physical rival.
Comment on the move you are about to make or just taunt the opponent.`;

const handler: ApiHandler<AIMoveRequest> = async ({ body, env }) => {
  if (!body?.topMoves || body.topMoves.length === 0) return fail(400, 'missing moves');

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return ok({ choice: 0, taunt: "You're lucky I'm holding back!" });

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `${PERSONA}
State:
${body.stateSummary}

Moves available:
${body.topMoves.map((m, i) => `[${i}] ${m.desc} (Score: ${m.score})`).join('\n')}

Choose one move by its index (0, 1, or 2) and provide a taunt (8 words max).`;

    const res = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        thinkingConfig: { thinkingBudget: 0 },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            choice: { type: Type.INTEGER },
            taunt: { type: Type.STRING }
          },
          required: ['choice', 'taunt']
        },
        abortSignal: serverTimeout(2000), // Wait no more than a bit since frontend fallback is 1.5s
      },
    });

    const raw = JSON.parse(res.text ?? '{}');
    let choice = Number(raw.choice) || 0;
    if (choice < 0 || choice >= body.topMoves.length) choice = 0;
    
    let taunt = typeof raw.taunt === 'string' ? raw.taunt : "Take this!";
    taunt = stripBannedWords(capChars(taunt, 50));
    
    // Quick word count check
    const words = taunt.split(/\s+/);
    if (words.length > 8) {
      taunt = words.slice(0, 8).join(' ');
    }

    return ok({ choice, taunt });
  } catch (err) {
    console.error('[api/ai-move]', err);
    return ok({ choice: 0, taunt: "System error, but you still lose!" });
  }
};

export default handler;
