
import { GoogleGenAI, Type } from "@google/genai";
import { UserPreferences, Ingredient, Meal } from "./types";
import { DAYS } from "./constants";

export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // Correct initialization as per mandatory guidelines
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  }

  async scanPantryImage(base64Image: string): Promise<string[]> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
            { text: "List the food items and raw ingredients you see in this fridge/pantry image. Return only a comma-separated list of names." }
          ]
        }
      });
      const text = response.text || "";
      return text.split(',').map(s => s.trim()).filter(s => s.length > 0);
    } catch (error) {
      console.error("Scan error:", error);
      throw error;
    }
  }

  async generateMealPlan(prefs: UserPreferences, pantry: Ingredient[]): Promise<Meal[]> {
    try {
      const pantryList = pantry.map(i => i.name).join(', ');
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Create a dinner meal plan for one week (${DAYS.join(', ')}). 
          User diet: ${prefs.diet}. Average prep time: ${prefs.baseTime} minutes. 
          Pantry items available: ${pantryList || 'None'}. 
          Prioritize using pantry items. 
          Return a JSON array of exactly 7 objects (one for each day).`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Name of the dish" },
                time: { type: Type.NUMBER, description: "Cook time in minutes" },
                tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Tags like Quick, Healthy, etc." },
                isPantryFriendly: { type: Type.BOOLEAN, description: "Whether it uses pantry items heavily" },
                day: { type: Type.STRING, description: "The day of the week" }
              },
              required: ["name", "time", "day", "isPantryFriendly", "tags"]
            }
          }
        }
      });

      const text = response.text || "[]";
      // Sanitize potential markdown wrap if API ignores responseMimeType
      const cleanJson = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      console.error("Generation error:", error);
      throw error;
    }
  }

  async getSwapSuggestions(currentMeal: string, prefs: UserPreferences, pantry: Ingredient[]): Promise<Partial<Meal>[]> {
     try {
      const pantryList = pantry.map(i => i.name).join(', ');
      const response = await this.ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Suggest 3-5 alternative dinner meals for someone who doesn't want "${currentMeal}".
          Diet: ${prefs.diet}. Max time: ${prefs.baseTime} mins.
          Pantry: ${pantryList}.
          Return as JSON array with properties: name, time, isPantryFriendly.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                time: { type: Type.NUMBER },
                isPantryFriendly: { type: Type.BOOLEAN }
              },
              required: ["name", "time", "isPantryFriendly"]
            }
          }
        }
      });
      const text = response.text || "[]";
      const cleanJson = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (error) {
      console.error("Swap error:", error);
      return [];
    }
  }
}

export const gemini = new GeminiService();
