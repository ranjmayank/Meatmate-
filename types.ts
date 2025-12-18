
export type Screen = 
  | 'SPLASH' 
  | 'LOGIN' 
  | 'SIGNUP' 
  | 'WELCOME' 
  | 'DIET' 
  | 'TIME_SETUP' 
  | 'DASHBOARD' 
  | 'PANTRY' 
  | 'SCAN_CAMERA' 
  | 'SCAN_REVIEW' 
  | 'GENERATE_LOADING' 
  | 'WEEKLY_PLAN' 
  | 'PROFILE';

export type DietType = 'Vegetarian' | 'Non-veg' | 'Egg-only' | 'Vegan';

export interface UserPreferences {
  name: string;
  diet: DietType;
  baseTime: number; // minutes
  busyDays: Record<string, number>;
  isLoggedIn: boolean;
}

export interface Ingredient {
  id: string;
  name: string;
  category?: string;
}

export interface Meal {
  id: string;
  name: string;
  time: number;
  tags: string[];
  isPantryFriendly: boolean;
  day: string;
}

export interface MealPlan {
  id: string;
  meals: Meal[];
  createdAt: string;
}
