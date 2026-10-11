import { CreateMLCEngine, MLCEngine } from '@mlc-ai/web-llm';

export interface StrategyJSON {
  aggressiveness: number;
  preferred_distance: 'melee' | 'mid' | 'ranged';
  skill_priorities: string[];
  tactical_logic: string;
  flee_threshold: number;
  healing_threshold: number;
}

export class AIManager {
  private engine: MLCEngine | null = null;
  private readonly modelId = 'SmolLM2-1.7B-Instruct-q4f16_1-MLC'; // Using a highly lightweight model for mobile devices to avoid thermal throttling

  async init(progressCallback?: (progress: number) => void) {
    if (!this.engine) {
      this.engine = await CreateMLCEngine(this.modelId, {
        initProgressCallback: (progress) => {
          if (progressCallback) {
            progressCallback(progress.progress); // 0 to 1
          }
          console.log(progress.text);
        }
      });
    }
  }

  async generateStrategy(strategyText: string, context?: string): Promise<StrategyJSON> {
    if (!this.engine) {
      throw new Error("AI Engine not initialized");
    }

    const systemPrompt = `You are a tactical assistant for an autobattler game.
The player has the following skills available: "Fireball" (ranged damage), "Slash" (melee damage), "Heal" (restores HP), "Shield" (buffs defense), "Poison" (damage over time), "Lightning" (instant high damage), "Vampiric Drain" (damage and heal), "Freeze" (stuns enemy), and "Earthquake" (AoE knockback).
Based on the player's instructions and current combat context, you must output a valid JSON object.
Do NOT include markdown formatting or any text outside of the JSON object. Just the JSON object.

The JSON schema must strictly match:
{
  "aggressiveness": number, // 0.0 for full defense, 1.0 for full attack
  "preferred_distance": string, // must be one of: "melee", "mid", "ranged"
  "skill_priorities": string[], // array of skill names in order of preference, e.g. ["Vampiric Drain", "Freeze", "Earthquake", "Lightning", "Fireball", "Slash", "Heal", "Shield", "Poison"]
  "flee_threshold": number, // HP percentage (0-100) below which to flee
  "healing_threshold": number, // HP percentage (0-100) below which to prioritize Heal
  "tactical_logic": string // A brief sentence explaining the choice
}

Context (if any):
${context || 'No specific combat context.'}`;

    const reply = await this.engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: strategyText }
      ],
      temperature: 0.1, // low temp for more predictable JSON formatting
      // Note: While web-llm has response_format for some models, relying on prompt for small models is sometimes necessary
      // If the model supports json schema forcing natively via web-llm, we could pass response_format here.
    });

    const responseText = reply.choices[0].message.content || '{}';
    try {
      // try to parse JSON from the raw text
      // if wrapped in ```json block, strip it
      let cleaned = responseText.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
      }
      return JSON.parse(cleaned) as StrategyJSON;
    } catch (e) {
      console.error("Failed to parse JSON strategy. Fallback to default.", responseText);
      return {
        aggressiveness: 0.5,
        preferred_distance: 'mid',
        skill_priorities: ['Vampiric Drain', 'Earthquake', 'Freeze', 'Slash', 'Fireball'],
        flee_threshold: 20,
        healing_threshold: 30,
        tactical_logic: 'Fallback strategy due to parsing error.'
      };
    }
  }
}

export const aiManager = new AIManager();
