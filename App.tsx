
import React, { useState, useEffect, useRef } from 'react';
import { Screen, UserPreferences, Ingredient, DietType, Meal } from './types';
import { gemini } from './geminiService';
import { DAYS, SUGGESTED_INGREDIENTS } from './constants';

// --- Sub-Components ---

const Button: React.FC<{ 
  onClick?: () => void; 
  children: React.ReactNode; 
  variant?: 'primary' | 'secondary' | 'tertiary'; 
  className?: string;
  disabled?: boolean;
}> = ({ onClick, children, variant = 'primary', className = '', disabled }) => {
  const base = "w-full py-4 px-6 rounded-2xl font-semibold transition-all duration-200 text-center flex items-center justify-center gap-2";
  const styles = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 shadow-lg shadow-indigo-200 disabled:opacity-50",
    secondary: "bg-white text-indigo-600 border border-indigo-100 hover:bg-slate-50 active:scale-95",
    tertiary: "bg-transparent text-slate-500 hover:text-slate-700 underline underline-offset-4"
  };
  return (
    <button disabled={disabled} onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
};

const Header: React.FC<{ title: string; onBack?: () => void; rightIcon?: React.ReactNode }> = ({ title, onBack, rightIcon }) => (
  <header className="flex items-center justify-between p-6 sticky top-0 bg-slate-50/80 backdrop-blur-md z-30">
    <div className="flex items-center gap-4">
      {onBack && (
        <button onClick={onBack} className="p-2 -ml-2 text-slate-600 hover:bg-white rounded-full">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
        </button>
      )}
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
    </div>
    {rightIcon}
  </header>
);

const Toast: React.FC<{ message: string; onClear: () => void }> = ({ message, onClear }) => {
  useEffect(() => {
    const timer = setTimeout(onClear, 3000);
    return () => clearTimeout(timer);
  }, [onClear]);

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] bg-slate-900 text-white px-6 py-3 rounded-full text-sm font-medium shadow-2xl animate-in fade-in slide-in-from-bottom-4">
      {message}
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [screen, setScreen] = useState<Screen>('SPLASH');
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    const saved = localStorage.getItem('mealmate_prefs');
    return saved ? JSON.parse(saved) : {
      name: 'Guest',
      diet: 'Vegetarian',
      baseTime: 30,
      busyDays: {},
      isLoggedIn: false
    };
  });
  
  const [pantry, setPantry] = useState<Ingredient[]>(() => {
    const saved = localStorage.getItem('mealmate_pantry');
    return saved ? JSON.parse(saved) : [];
  });

  const [toast, setToast] = useState<string | null>(null);
  const [detectedIngredients, setDetectedIngredients] = useState<string[]>([]);
  const [mealPlan, setMealPlan] = useState<Meal[]>([]);
  const [activeMeal, setActiveMeal] = useState<{meal: Meal, index: number} | null>(null);
  const [swapOptions, setSwapOptions] = useState<Partial<Meal>[]>([]);
  const [isLoadingSwaps, setIsLoadingSwaps] = useState(false);
  const [isBusyToggle, setIsBusyToggle] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingHintIndex, setLoadingHintIndex] = useState(0);
  const [isMovingDay, setIsMovingDay] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadingHints = [
    "Matching meals to your weekdays",
    "Prioritizing pantry-first options",
    "Balancing variety"
  ];

  // Persistence
  useEffect(() => {
    localStorage.setItem('mealmate_prefs', JSON.stringify(prefs));
  }, [prefs]);

  useEffect(() => {
    localStorage.setItem('mealmate_pantry', JSON.stringify(pantry));
  }, [pantry]);

  // Loading hints animation
  useEffect(() => {
    let interval: any;
    if (screen === 'GENERATE_LOADING') {
      interval = setInterval(() => {
        setLoadingHintIndex(i => (i + 1) % loadingHints.length);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [screen]);

  const showToast = (msg: string) => setToast(msg);

  const navigate = (to: Screen) => {
    setSearchQuery('');
    setScreen(to);
    window.scrollTo(0,0);
  }

  const handleLogin = (asGuest: boolean) => {
    if (asGuest) {
      navigate('WELCOME');
    } else {
      setPrefs(p => ({ ...p, name: 'Riya', isLoggedIn: true }));
      navigate('DASHBOARD');
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      alert("Camera access denied or unavailable.");
      navigate('PANTRY');
    }
  };

  const captureAndScan = async () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg');
      const base64 = dataUrl.split(',')[1];
      
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());

      setScreen('GENERATE_LOADING'); 
      try {
        const items = await gemini.scanPantryImage(base64);
        setDetectedIngredients(items);
        setScreen('SCAN_REVIEW');
      } catch (e) {
        showToast("Scan failed. Try manual input.");
        navigate('PANTRY');
      }
    }
  };

  const generateWeek = async () => {
    // Explicitly transition to loading first
    setScreen('GENERATE_LOADING');
    
    // Add a slight delay to ensure UI updates before heavy API work starts
    setTimeout(async () => {
      try {
        const plan = await gemini.generateMealPlan(prefs, pantry);
        if (plan && plan.length > 0) {
          setMealPlan(plan);
          setScreen('WEEKLY_PLAN'); // Use setScreen directly for immediate transition
        } else {
          throw new Error("Empty plan");
        }
      } catch (e) {
        console.error("Meal generation error:", e);
        showToast("Could not build plan. Please check your internet.");
        setScreen('DASHBOARD');
      }
    }, 100);
  };

  const openSwap = async (meal: Meal, index: number) => {
    setActiveMeal({ meal, index });
    setIsLoadingSwaps(true);
    setIsMovingDay(false);
    try {
      const suggestions = await gemini.getSwapSuggestions(meal.name, prefs, pantry);
      setSwapOptions(suggestions);
    } catch (e) {
      showToast("Could not fetch alternatives.");
    } finally {
      setIsLoadingSwaps(false);
    }
  };

  const applySwap = (newMeal: Partial<Meal>) => {
    if (!activeMeal) return;
    const updated = [...mealPlan];
    // Ensure we keep the original day and ID if it exists
    updated[activeMeal.index] = { 
      ...updated[activeMeal.index], 
      ...newMeal,
      day: updated[activeMeal.index].day 
    };
    setMealPlan(updated);
    setActiveMeal(null);
    showToast("Meal swapped!");
  };

  const moveMealToDay = (targetDay: string) => {
    if (!activeMeal) return;
    const updated = [...mealPlan];
    const sourceIdx = activeMeal.index;
    const targetIdx = updated.findIndex(m => m.day === targetDay);
    
    if (targetIdx !== -1) {
      // Swap content between days but keep the day strings mapped to their positions
      const sourceMealData = { ...updated[sourceIdx] };
      const targetMealData = { ...updated[targetIdx] };
      
      updated[sourceIdx] = { ...targetMealData, day: sourceMealData.day };
      updated[targetIdx] = { ...sourceMealData, day: targetMealData.day };
    }
    
    setMealPlan(updated);
    setActiveMeal(null);
    setIsMovingDay(false);
    showToast(`Plan adjusted for ${targetDay}`);
  };

  const togglePantryItem = (item: Ingredient | {name: string, id?: string}) => {
    const isSelected = pantry.find(p => p.name.toLowerCase() === item.name.toLowerCase());
    if (isSelected) {
      setPantry(prev => prev.filter(p => p.name.toLowerCase() !== item.name.toLowerCase()));
      showToast(`Removed ${item.name}`);
    } else {
      const newItem = { ...item, id: item.id || Math.random().toString(36).substr(2, 9), category: 'Added' };
      setPantry(prev => [...prev, newItem as Ingredient]);
      showToast(`Added ${item.name}`);
    }
  }

  const addCustomPantryItem = (name: string) => {
    if (!name.trim()) return;
    if (pantry.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) {
      showToast(`${name.trim()} already in pantry`);
      setSearchQuery('');
      return;
    }
    togglePantryItem({ name: name.trim() });
    setSearchQuery('');
  }

  // --- Render Functions ---

  const renderSplash = () => (
    <div className="min-h-screen flex flex-col p-6 bg-gradient-to-b from-indigo-50 to-white">
      <div className="flex-1 flex flex-col justify-center items-center text-center space-y-6">
        <div className="w-24 h-24 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-xl mb-4">
          <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
        </div>
        <h1 className="text-4xl font-extrabold text-slate-900 leading-tight">Plan dinners without the 9 PM panic.</h1>
        <p className="text-lg text-slate-600">MealMate builds a realistic weekly plan using your time, diet, and what you already have.</p>
      </div>
      <div className="space-y-3 pb-8">
        <Button onClick={() => handleLogin(true)}>Continue</Button>
        <Button variant="secondary" onClick={() => navigate('LOGIN')}>Log in</Button>
        <Button variant="tertiary" onClick={() => navigate('SIGNUP')}>Sign up</Button>
      </div>
    </div>
  );

  const renderLogin = () => (
    <div className="min-h-screen p-6 bg-white flex flex-col">
      <Header title="" onBack={() => navigate('SPLASH')} />
      <div className="flex-1 space-y-8 mt-4">
        <h2 className="text-3xl font-bold">Welcome back 👋</h2>
        <div className="space-y-4">
          <input className="w-full p-4 bg-slate-100 rounded-xl outline-none" placeholder="Email" />
          <input className="w-full p-4 bg-slate-100 rounded-xl outline-none" type="password" placeholder="Password" />
        </div>
      </div>
      <div className="space-y-3 pb-8">
        <Button onClick={() => handleLogin(false)}>Log in</Button>
        <Button variant="secondary" onClick={() => handleLogin(true)}>Continue as guest</Button>
      </div>
    </div>
  );

  const renderSignup = () => (
    <div className="min-h-screen p-6 bg-white flex flex-col">
      <Header title="" onBack={() => navigate('SPLASH')} />
      <div className="flex-1 space-y-8 mt-4">
        <h2 className="text-3xl font-bold text-slate-900">Create account</h2>
        <div className="space-y-4">
          <input className="w-full p-4 bg-slate-100 rounded-xl outline-none" placeholder="Name" />
          <input className="w-full p-4 bg-slate-100 rounded-xl outline-none" placeholder="Email" />
          <input className="w-full p-4 bg-slate-100 rounded-xl outline-none" type="password" placeholder="Password" />
        </div>
      </div>
      <div className="space-y-3 pb-8">
        <Button onClick={() => handleLogin(false)}>Create account</Button>
        <Button variant="secondary" onClick={() => handleLogin(true)}>Continue as guest</Button>
      </div>
    </div>
  );

  const renderWelcome = () => (
    <div className="min-h-screen flex flex-col p-6 bg-indigo-600 text-white">
      <div className="flex-1 flex flex-col justify-center space-y-6">
        <h2 className="text-4xl font-extrabold">Welcome to MealMate</h2>
        <p className="text-xl opacity-90">Answer 2 quick questions. Get a weekly dinner plan you can actually follow.</p>
        <p className="text-sm font-medium opacity-75">Takes less than 60 seconds</p>
      </div>
      <div className="pb-8">
        <Button variant="secondary" onClick={() => navigate('DIET')}>Get Started</Button>
      </div>
    </div>
  );

  const renderDiet = () => (
    <div className="min-h-screen p-6 bg-white flex flex-col">
      <div className="flex-1 space-y-8 mt-12">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-slate-900">What’s your diet?</h2>
          <p className="text-slate-500">We’ll only suggest meals that match.</p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {(['Vegetarian', 'Non-veg', 'Egg-only', 'Vegan'] as DietType[]).map(type => (
            <button
              key={type}
              onClick={() => setPrefs(p => ({ ...p, diet: type }))}
              className={`p-5 rounded-2xl text-left font-semibold border-2 transition-all ${
                prefs.diet === type ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100 bg-slate-50 text-slate-700'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
      <div className="pb-8 pt-4">
        <Button onClick={() => navigate('TIME_SETUP')}>Next</Button>
      </div>
    </div>
  );

  const renderTimeSetup = () => (
    <div className="min-h-screen p-6 bg-white flex flex-col">
      <div className="flex-1 space-y-8 mt-12 overflow-y-auto">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-slate-900 leading-tight">How much time do you usually have?</h2>
          <p className="text-slate-500">We’ll keep plans realistic.</p>
        </div>
        
        <div className="space-y-6">
          <div className="flex gap-2">
            {[15, 30, 45].map(t => (
              <button
                key={t}
                onClick={() => setPrefs(p => ({ ...p, baseTime: t }))}
                className={`flex-1 py-4 px-2 rounded-2xl border-2 font-bold ${
                  prefs.baseTime === t ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-600'
                }`}
              >
                {t}{t === 45 ? '+' : ''} min
              </button>
            ))}
          </div>

          <div className="p-5 bg-slate-50 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm">
            <div>
              <p className="font-semibold text-slate-900">Some days are very busy</p>
              <p className="text-xs text-slate-500">Adjust time for specific weekdays</p>
            </div>
            <button 
              onClick={() => setIsBusyToggle(!isBusyToggle)}
              className={`w-12 h-6 rounded-full transition-colors relative ${isBusyToggle ? 'bg-indigo-600' : 'bg-slate-300'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isBusyToggle ? 'right-1' : 'left-1'}`} />
            </button>
          </div>

          {isBusyToggle && (
            <div className="space-y-4 pb-4 animate-in slide-in-from-top fade-in duration-300">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                <div key={day} className="flex items-center justify-between p-2 bg-slate-50 rounded-xl">
                  <span className="font-bold text-slate-700 ml-2">{day}</span>
                  <div className="flex gap-1">
                    {[15, 30, 45].map(t => (
                      <button 
                        key={t}
                        onClick={() => setPrefs(p => ({ ...p, busyDays: { ...p.busyDays, [day]: t } }))}
                        className={`w-12 h-10 text-xs rounded-lg font-bold border ${
                          (prefs.busyDays[day] || prefs.baseTime) === t ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white border-slate-200 text-slate-400'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="pb-8 pt-4">
        <Button onClick={() => navigate('DASHBOARD')}>Save Preferences</Button>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="min-h-screen p-6 pb-24 bg-slate-50 flex flex-col gap-6 overflow-y-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Hi, {prefs.name} 👋</h2>
        </div>
        <button onClick={() => navigate('PROFILE')} className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border shadow-sm active:scale-95 transition-all">
          <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        </button>
      </div>

      <div className="bg-white p-6 rounded-3xl border shadow-sm flex items-center justify-around">
        <div className="text-center">
          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Diet</p>
          <p className="text-sm font-bold text-indigo-600">{prefs.diet} ✅</p>
        </div>
        <div className="h-8 w-px bg-slate-100" />
        <div className="text-center">
          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Time</p>
          <p className="text-sm font-bold text-indigo-600">{prefs.baseTime} min ✅</p>
        </div>
        <div className="h-8 w-px bg-slate-100" />
        <div className="text-center">
          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Pantry</p>
          <p className="text-sm font-bold text-indigo-600">{pantry.length > 0 ? `${pantry.length} items` : 'Empty'} {pantry.length > 0 ? '✅' : '⏳'}</p>
        </div>
      </div>

      <button onClick={generateWeek} className="bg-indigo-600 p-8 rounded-[32px] text-left text-white shadow-xl shadow-indigo-100 relative overflow-hidden active:scale-[0.98] transition-all">
        <div className="relative z-10">
          <h2 className="text-2xl font-bold mb-1">Create this week’s plan</h2>
          <p className="opacity-80 text-sm">Dinner plan for Mon–Sun in ~10 seconds</p>
        </div>
        <div className="absolute right-[-20px] bottom-[-20px] opacity-10">
          <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        </div>
      </button>

      <div className="grid grid-cols-1 gap-4">
        <button onClick={() => navigate('PANTRY')} className="bg-white p-6 rounded-3xl border shadow-sm text-left flex items-center justify-between group active:scale-[0.98] transition-all">
          <div>
            <p className="font-bold text-slate-900 text-lg">Add pantry items</p>
            <p className="text-sm text-slate-500 mt-0.5">Get pantry-first suggestions</p>
          </div>
          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center group-hover:bg-indigo-50 transition-colors shadow-inner">
            <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
          </div>
        </button>
        <button className="bg-white p-6 rounded-3xl border shadow-sm text-left flex items-center justify-between opacity-50 cursor-not-allowed">
          <div>
            <p className="font-bold text-slate-900 text-lg">View saved weeks</p>
            <p className="text-sm text-slate-500 mt-0.5">Revisit successful plans</p>
          </div>
          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center">
            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          </div>
        </button>
      </div>
    </div>
  );

  const renderPantry = () => (
    <div className="min-h-screen p-6 bg-white flex flex-col relative">
      <Header title="What do you have?" onBack={() => navigate('DASHBOARD')} />
      <div className="flex-1 space-y-8 overflow-y-auto mt-4 pb-32">
        <div className="space-y-6">
          <button 
            onClick={() => { setScreen('SCAN_CAMERA'); startCamera(); }}
            className="w-full bg-indigo-50 border-2 border-dashed border-indigo-200 p-8 rounded-[32px] flex flex-col items-center gap-3 hover:bg-indigo-100 transition-colors shadow-sm"
          >
            <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <div className="text-center">
              <p className="font-bold text-indigo-900 text-lg">Scan my fridge</p>
              <p className="text-xs text-indigo-500 mt-1">Uses AI to detect common ingredients</p>
            </div>
          </button>

          <div className="relative">
            <input 
              className="w-full p-4 pl-12 bg-slate-50 rounded-2xl outline-none border border-slate-100 focus:border-indigo-300 focus:bg-white transition-all shadow-inner" 
              placeholder="Search or add items..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addCustomPantryItem(searchQuery);
              }}
            />
            <svg className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            {searchQuery.trim().length > 0 && (
              <button onClick={() => addCustomPantryItem(searchQuery)} className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold shadow-md active:scale-95">ADD</button>
            )}
          </div>

          <div className="space-y-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Suggestions</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_INGREDIENTS.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())).map(item => {
                const isSelected = pantry.find(p => p.name.toLowerCase() === item.name.toLowerCase());
                return (
                  <button
                    key={item.id}
                    onClick={() => togglePantryItem(item)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all active:scale-95 ${
                      isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-white'
                    }`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          </div>

          {pantry.length > 0 && (
            <div className="space-y-4 pt-6">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">In your pantry ({pantry.length})</p>
              <div className="space-y-2">
                {pantry.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm animate-in fade-in slide-in-from-left duration-200">
                    <span className="font-bold text-slate-700 capitalize">{item.name}</span>
                    <button onClick={() => togglePantryItem(item)} className="p-1 hover:text-red-500 text-slate-300 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/90 backdrop-blur-md border-t z-[90]">
        <Button onClick={() => {
           showToast("Pantry updated — meals will prioritize these items");
           navigate('DASHBOARD');
        }}>Done</Button>
      </div>
    </div>
  );

  // Screen 9: Loading / Generate Screen
  const renderGenerateLoading = () => (
    <div className="min-h-screen p-12 bg-indigo-600 text-white flex flex-col items-center justify-center text-center">
      <div className="w-24 h-24 mb-10 relative">
        <div className="absolute inset-0 border-8 border-white/20 rounded-full" />
        <div className="absolute inset-0 border-8 border-white border-t-transparent rounded-full animate-spin" />
      </div>
      <h2 className="text-3xl font-extrabold mb-4 animate-pulse">Building your week…</h2>
      <p className="text-indigo-100 text-lg mb-8 opacity-90">Using your diet + time + pantry (if added).</p>
      
      <div className="h-6 overflow-hidden w-full max-w-[280px]">
        <div 
          className="transition-all duration-700 ease-in-out" 
          style={{ transform: `translateY(-${loadingHintIndex * 24}px)` }}
        >
          {loadingHints.map((hint, i) => (
            <p key={i} className="h-6 flex items-center justify-center text-indigo-200 font-medium text-sm leading-6">
              {hint}
            </p>
          ))}
        </div>
      </div>
    </div>
  );

  // Screen 10: Weekly Plan View
  const renderWeeklyPlan = () => (
    <div className="min-h-screen p-6 bg-slate-50 flex flex-col relative overflow-y-auto pb-32">
      <Header title="This week's dinners" onBack={() => navigate('DASHBOARD')} />
      <div className="space-y-4 mt-2">
        {mealPlan.length > 0 ? mealPlan.map((meal, idx) => (
          <div 
            key={idx} 
            onClick={() => openSwap(meal, idx)}
            className="bg-white p-5 rounded-[28px] shadow-sm border border-slate-100 flex gap-4 items-center group active:scale-[0.98] transition-all cursor-pointer hover:border-indigo-100 hover:shadow-md animate-in fade-in slide-in-from-bottom duration-300"
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            <div className="flex-1">
              <div className="flex justify-between items-start mb-1">
                <p className="text-[10px] font-extrabold text-indigo-500 uppercase tracking-widest">{meal.day}</p>
                {meal.time > 0 && <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase">{meal.time} min</span>}
              </div>
              <h3 className="font-bold text-lg text-slate-900 leading-tight">{meal.name}</h3>
              <div className="flex items-center gap-2 mt-3 overflow-x-auto no-scrollbar">
                {meal.isPantryFriendly && (
                  <span className="text-[9px] whitespace-nowrap font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md uppercase tracking-tight">Pantry-first</span>
                )}
                {meal.time <= 20 && meal.time > 0 && (
                  <span className="text-[9px] whitespace-nowrap font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md uppercase tracking-tight">Quick</span>
                )}
                {meal.tags.map((tag, tIdx) => (
                  <span key={tIdx} className="text-[9px] whitespace-nowrap font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md uppercase tracking-tight">{tag}</span>
                ))}
              </div>
            </div>
            <div className="text-slate-200 group-hover:text-indigo-400 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>
        )) : (
          <div className="text-center py-20 text-slate-400">
             <p>No plan generated yet.</p>
             <Button className="mt-4" onClick={generateWeek}>Build now</Button>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-md border-t flex flex-col gap-3 z-[100]">
        <Button onClick={() => showToast("Week saved as template!")}>Save week as template</Button>
      </div>

      {/* Screen 11: Edit/Swap Meal Modal */}
      {activeMeal && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-end justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl animate-in slide-in-from-bottom duration-300 flex flex-col max-h-[90vh]">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6 shrink-0" />
            
            {!isMovingDay ? (
              <div className="overflow-y-auto pr-1">
                <div className="mb-8 text-center shrink-0">
                  <p className="text-sm font-bold text-indigo-500 uppercase mb-1 tracking-widest">{activeMeal.meal.day} dinner</p>
                  <h2 className="text-2xl font-bold leading-tight text-slate-900">{activeMeal.meal.name}</h2>
                </div>
                
                <div className="space-y-6">
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Change meal</p>
                    {isLoadingSwaps ? (
                       <div className="space-y-3 animate-pulse">
                         {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-50 rounded-2xl" />)}
                       </div>
                    ) : (
                      <div className="space-y-2">
                        {swapOptions.length > 0 ? swapOptions.map((opt, i) => (
                          <button 
                            key={i} 
                            onClick={() => applySwap(opt)}
                            className="w-full p-4 bg-slate-50 rounded-2xl text-left flex justify-between items-center hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-100 active:scale-[0.98]"
                          >
                            <div>
                              <p className="font-bold text-slate-900">{opt.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{opt.time} min</p>
                            </div>
                            {opt.isPantryFriendly && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded uppercase">Uses pantry</span>}
                          </button>
                        )) : (
                          <p className="text-sm text-slate-400 text-center py-4 italic">Finding alternatives...</p>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 shrink-0">
                    <button onClick={() => setIsMovingDay(true)} className="p-4 bg-slate-100 rounded-2xl font-bold text-slate-600 text-sm active:scale-95 transition-all">Move to another day</button>
                    <button onClick={() => { 
                      applySwap({ name: "Eating Out 🍕", time: 0, tags: ['Eating Out'], isPantryFriendly: false });
                      showToast("Plan updated: Eating out!");
                    }} className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl font-bold text-sm active:scale-95 transition-all">Mark as eating out</button>
                  </div>

                  <button onClick={() => { 
                    applySwap({ name: "No Dinner Planned", time: 0, tags: [], isPantryFriendly: false });
                    showToast("Plan updated: Day cleared!");
                  }} className="w-full p-4 bg-red-50 text-red-600 rounded-2xl font-bold text-sm active:scale-95 transition-all shrink-0">Clear this day</button>

                  <Button variant="tertiary" onClick={() => setActiveMeal(null)} className="shrink-0">Close</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="text-center mb-8 shrink-0">
                  <h2 className="text-2xl font-bold leading-tight text-slate-900">Move to which day?</h2>
                  <p className="text-sm text-slate-500 mt-1">This will swap with the target day's meal.</p>
                </div>
                <div className="grid grid-cols-1 gap-2 overflow-y-auto mb-6 pr-1">
                  {DAYS.filter(d => d !== activeMeal.meal.day).map(day => (
                    <button
                      key={day}
                      onClick={() => moveMealToDay(day)}
                      className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-700 text-left hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all active:scale-[0.98]"
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <Button variant="secondary" onClick={() => setIsMovingDay(false)}>Back</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderProfile = () => (
    <div className="min-h-screen p-6 bg-slate-50 flex flex-col gap-6 overflow-y-auto pb-12">
      <Header title="Profile & Settings" onBack={() => navigate('DASHBOARD')} />
      
      <div className="bg-white p-6 rounded-3xl border shadow-sm flex items-center gap-4">
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl font-extrabold shadow-lg shadow-indigo-100">
          {prefs.name[0]}
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">{prefs.name}</h2>
          <p className="text-slate-500 text-sm">{prefs.isLoggedIn ? 'Active Account' : 'Guest Account'}</p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-bold text-slate-400 uppercase ml-2 tracking-widest">Preferences</p>
        <div className="bg-white rounded-3xl border shadow-sm divide-y overflow-hidden">
          <button onClick={() => navigate('DIET')} className="w-full p-5 flex items-center justify-between hover:bg-slate-50 text-left transition-colors">
            <span className="font-bold text-slate-700">Diet Type</span>
            <span className="text-indigo-600 font-bold bg-indigo-50 px-3 py-1 rounded-full text-xs">{prefs.diet}</span>
          </button>
          <button onClick={() => navigate('TIME_SETUP')} className="w-full p-5 flex items-center justify-between hover:bg-slate-50 text-left transition-colors">
            <span className="font-bold text-slate-700">Weekday cooking time</span>
            <span className="text-indigo-600 font-bold bg-indigo-50 px-3 py-1 rounded-full text-xs">{prefs.baseTime} min</span>
          </button>
          <button onClick={() => navigate('TIME_SETUP')} className="w-full p-5 flex items-center justify-between hover:bg-slate-50 text-left transition-colors">
            <span className="font-bold text-slate-700">Busy-day pattern</span>
            <span className="text-slate-400 font-bold text-xs">{Object.keys(prefs.busyDays).length > 0 ? 'Customized' : 'Standard'}</span>
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-bold text-slate-400 uppercase ml-2 tracking-widest">Planning Health</p>
        <div className="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600 font-medium">Pantry added this week</span>
            <span className={`font-bold ${pantry.length > 0 ? 'text-emerald-600' : 'text-amber-500'}`}>{pantry.length > 0 ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600 font-medium">Plan created this week</span>
            <span className={`font-bold ${mealPlan.length > 0 ? 'text-emerald-600' : 'text-amber-500'}`}>{mealPlan.length > 0 ? 'Yes' : 'No'}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600 font-medium">Days planned</span>
            <span className="font-bold text-slate-900">{mealPlan.length}/7</span>
          </div>
        </div>
      </div>

      <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 shadow-sm">
        <h4 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Static Insights
        </h4>
        <ul className="space-y-4">
          <li className="flex gap-3">
             <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1.5 flex-shrink-0" />
             <p className="text-sm text-indigo-800 leading-tight">Plans fail mid-week when time isn’t respected. Use busy-day settings to adjust.</p>
          </li>
          <li className="flex gap-3">
             <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1.5 flex-shrink-0" />
             <p className="text-sm text-indigo-800 leading-tight">Most users drop off if pantry feels mandatory. Add as much as you can for better results.</p>
          </li>
          <li className="flex gap-3">
             <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full mt-1.5 flex-shrink-0" />
             <p className="text-sm text-indigo-800 leading-tight">Swaps reduce abandonment. Tap any meal to see instant alternatives.</p>
          </li>
        </ul>
      </div>

      <div className="mt-8 space-y-3">
        <Button variant="secondary" onClick={() => {
          localStorage.clear();
          window.location.reload();
        }}>Logout (Reset Demo)</Button>
      </div>
    </div>
  );

  const renderScanCamera = () => (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      <div className="p-6 flex justify-between items-center text-white shrink-0">
        <button onClick={() => {
          const stream = videoRef.current?.srcObject as MediaStream;
          stream?.getTracks().forEach(t => t.stop());
          navigate('PANTRY');
        }} className="p-2">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <span className="font-bold tracking-tight">SCAN FRIDGE</span>
        <div className="w-10" />
      </div>
      
      <div className="flex-1 relative flex items-center justify-center bg-slate-900 overflow-hidden">
        <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none flex items-center justify-center">
          <div className="w-full h-2/3 border-2 border-white/50 rounded-3xl" />
        </div>
        <p className="absolute bottom-12 text-center w-full text-white font-bold bg-black/60 py-3 px-6 rounded-full backdrop-blur-md max-w-[80%]">Take a clear photo of your pantry</p>
      </div>

      <div className="p-12 flex justify-center bg-black shrink-0">
        <button onClick={captureAndScan} className="w-20 h-20 rounded-full bg-white flex items-center justify-center p-2 border-8 border-slate-900 shadow-2xl active:scale-90 transition-all">
          <div className="w-full h-full rounded-full bg-indigo-600" />
        </button>
      </div>
    </div>
  );

  const renderScanReview = () => {
    const [localReview, setLocalReview] = useState<{name: string, selected: boolean}[]>(
      detectedIngredients.map(name => ({ name, selected: true }))
    );

    return (
      <div className="min-h-screen p-6 bg-white flex flex-col">
        <Header title="We found these items" onBack={() => navigate('PANTRY')} />
        <div className="flex-1 space-y-6 overflow-y-auto mt-4 pr-1">
          <p className="text-slate-500 text-sm">Review detected ingredients. Uncheck anything incorrect.</p>
          <div className="space-y-2">
            {localReview.map((item, idx) => (
              <div key={idx} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl active:bg-indigo-50 transition-colors">
                <input 
                  type="checkbox" 
                  checked={item.selected}
                  onChange={() => {
                    const next = [...localReview];
                    next[idx].selected = !next[idx].selected;
                    setLocalReview(next);
                  }}
                  className="w-6 h-6 rounded-lg text-indigo-600 border-slate-300 focus:ring-0"
                  id={`check-${idx}`}
                />
                <label htmlFor={`check-${idx}`} className="font-bold text-slate-800 capitalize flex-1 cursor-pointer">{item.name}</label>
              </div>
            ))}
          </div>
        </div>
        <div className="pb-8 pt-4 space-y-3">
          <Button onClick={() => {
            const itemsToAdd = localReview
              .filter(i => i.selected)
              .map(i => ({ id: Math.random().toString(36).substr(2, 9), name: i.name, category: 'Scanned' }));
            
            setPantry(prev => {
              const existingNames = new Set(prev.map(p => p.name.toLowerCase()));
              const filteredNew = itemsToAdd.filter(i => !existingNames.has(i.name.toLowerCase()));
              return [...prev, ...filteredNew];
            });
            showToast(`Added ${itemsToAdd.length} items to pantry`);
            navigate('PANTRY');
          }}>Add to pantry</Button>
          <Button variant="secondary" onClick={() => navigate('SCAN_CAMERA')}>Retake photo</Button>
        </div>
      </div>
    );
  };

  // --- Router ---

  return (
    <div className="max-w-md mx-auto bg-slate-50 shadow-2xl overflow-hidden relative min-h-screen flex flex-col">
      <div className="flex-1 h-full">
        {(() => {
          switch (screen) {
            case 'SPLASH': return renderSplash();
            case 'LOGIN': return renderLogin();
            case 'SIGNUP': return renderSignup();
            case 'WELCOME': return renderWelcome();
            case 'DIET': return renderDiet();
            case 'TIME_SETUP': return renderTimeSetup();
            case 'DASHBOARD': return renderDashboard();
            case 'PANTRY': return renderPantry();
            case 'SCAN_CAMERA': return renderScanCamera();
            case 'SCAN_REVIEW': return renderScanReview();
            case 'GENERATE_LOADING': return renderGenerateLoading();
            case 'WEEKLY_PLAN': return renderWeeklyPlan();
            case 'PROFILE': return renderProfile();
            default: return renderSplash();
          }
        })()}
      </div>
      {toast && <Toast message={toast} onClear={() => setToast(null)} />}
    </div>
  );
}
