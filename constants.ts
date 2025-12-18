
import { Ingredient } from './types';

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const SUGGESTED_INGREDIENTS: Ingredient[] = [
  { id: '1', name: 'Onion', category: 'Vegetables' },
  { id: '2', name: 'Tomato', category: 'Vegetables' },
  { id: '3', name: 'Rice', category: 'Grains' },
  { id: '4', name: 'Paneer', category: 'Protein' },
  { id: '5', name: 'Eggs', category: 'Protein' },
  { id: '6', name: 'Garlic', category: 'Vegetables' },
  { id: '7', name: 'Pasta', category: 'Grains' },
  { id: '8', name: 'Chicken', category: 'Protein' },
];

export const MOCK_MEALS = [
  { name: 'Paneer Butter Masala', time: 30, tags: ['Pantry-first'], isPantryFriendly: true },
  { name: 'Garlic Butter Pasta', time: 20, tags: ['Quick'], isPantryFriendly: true },
  { name: 'Veggie Stir Fry', time: 15, tags: ['Quick'], isPantryFriendly: false },
  { name: 'Lentil Soup', time: 45, tags: ['Healthy'], isPantryFriendly: true },
  { name: 'Chickpea Salad', time: 15, tags: ['No Cook'], isPantryFriendly: true },
];
