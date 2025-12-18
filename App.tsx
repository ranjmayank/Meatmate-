
import React, { useState, useEffect, useRef } from 'react';
import { Screen, UserPreferences, Ingredient, DietType, Meal } from './types';
import { gemini } from './geminiService';
import { DAYS, SUGGESTED_INGREDIENTS } from './constants';

// --- Illustrations ---

const IllustrationSplash = () => (
  <svg viewBox="0 0 200 200" className="w-48 h-48 drop-shadow-2xl">
    <circle cx="100" cy="100" r="90" fill="#EEF2FF" />
    <path d="M60 140 Q100 160 140 140" stroke="#4F46E5" strokeWidth="6" fill="none" strokeLinecap="round" />
    <rect x="70" y="60" width="60" height="70" rx="8" fill="#FFF" stroke="#4F46E5" strokeWidth="4" />
    <path d="M80 80 H120 M80 95 H120 M80 110 H100" stroke="#E0E7FF" strokeWidth="4" strokeLinecap="round" />
    <circle cx="150" cy="70" r="15" fill="#10B981" />
    <path d="M145 70 L148 73 L155 66" stroke="#FFF" strokeWidth="3" fill="none" />
  </svg>
);

const IllustrationEmptyPantry = () => (
  <svg viewBox="0 0 200 200" className="w-40 h-40 opacity-50">
    <rect x="50" y="40" width="100" height="120" rx="10" fill="none" stroke="#94A3B8" strokeWidth="4" strokeDasharray="8 8" />
    <path d="M80 70 H120 M80 100 H120 M80 130 H120" stroke="#CBD5E1" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

const IllustrationLoading = () => (
  <div className="relative">
    <svg viewBox="0 0 100 100" className="w-32 h-32">
      <path d="M30 70 Q50 90 70 70 L75 30 Q50 10 25 30 Z" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" className="animate-bounce" />
      <path d="M40 40 Q50 50 60 40" stroke="white" strokeWidth="3" fill="none" />
    </svg>
    <div className="absolute top-0 left-1/2 -translate-x-1/2 flex gap-1">
      <div className="w-1.5 h-4 bg-indigo-200 rounded-full animate-pulse delay-75" />
      <div className="w-1.5 h-6 bg-indigo-100 rounded-full animate-pulse delay-150" />
      <div className="w-1.5 h-4 bg-indigo-200 rounded-full animate-pulse delay-300" />
    </div>
  </div>
);

// --- Sub-Components ---

const Button: React.FC<{ 
  onClick?: () => void; 
  children: React.ReactNode; 
  variant?: 'primary' | 'secondary' | 'tertiary'; 
  className?: string;
  disabled?: boolean;
}> = ({ onClick, children, variant = 'primary', className = '', disabled }) => {
  const base = "w-full py-4.5 px-6 rounded-2xl font-bold transition-all duration-300 text-center flex items-center justify-center gap-2 tracking-tight";
  const styles = {
    primary: "bg-slate-900 text-white hover:bg-slate-800 active:scale-95 shadow-xl shadow-slate-200 disabled:opacity-50",
    secondary: "bg-white text-slate-900 border-2 border-slate-100 hover:border-slate-200 active:scale-95 shadow-sm",
    tertiary: "bg-transparent text-slate-400 hover:text-slate-600 underline underline-offset-8"
  };
  return (
    <button disabled={disabled} onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
};

const Header: React.FC<{ title: string; onBack?: () => void; rightIcon?: React.ReactNode }> = ({ title, onBack, rightIcon }) => (
  <header className="flex items-center justify-between px-6 py-6 sticky top-0 bg-white/80 backdrop-blur-xl z-30">
    <div className="flex items-center gap-4">
      {onBack && (
        <button onClick={onBack} className="p-2.5 -ml-2 text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors border border-slate-100">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
        </button>
      )}
      <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{title}</h1>
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
    <div className="fixed bottom-10 left-6 right-6 z-[300] bg-slate-900 text-white px-6 py-4 rounded-2xl text-sm font-bold shadow-2xl animate-in fade-in slide-in-from-bottom-8 flex items-center justify-between">
      <span>{message}</span>
      <button onClick={onClear} className="opacity-50 hover:opacity-100">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
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
    "Synchronizing your culinary preferences",
    "Auditing your virtual pantry",
    "Optimizing for maximum nutrition",
    "Crafting your customized dinner logic"
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
      }, 1800);
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
      alert("Camera access denied. Please enable it in settings.");
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
    setScreen('GENERATE_LOADING');
    setTimeout(async () => {
      try {
        const plan = await gemini.generateMealPlan(prefs, pantry);
        if (plan && plan.length > 0) {
          setMealPlan(plan);
          setScreen('WEEKLY_PLAN');
        } else {
          throw new Error("No plan returned");
        }
      } catch (e) {
        showToast("AI took too long. Retrying...");
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
    updated[activeMeal.index] = { 
      ...updated[activeMeal.index], 
      ...newMeal,
      day: updated[activeMeal.index].day 
    };
    setMealPlan(updated);
    setActiveMeal(null);
    showToast("Plan updated successfully");
  };

  const moveMealToDay = (targetDay: string) => {
    if (!activeMeal) return;
    const updated = [...mealPlan];
    const sourceIdx = activeMeal.index;
    const targetIdx = updated.findIndex(m => m.day === targetDay);
    
    if (targetIdx !== -1) {
      const sourceMealData = { ...updated[sourceIdx] };
      const targetMealData = { ...updated[targetIdx] };
      updated[sourceIdx] = { ...targetMealData, day: sourceMealData.day };
      updated[targetIdx] = { ...sourceMealData, day: targetMealData.day };
    }
    
    setMealPlan(updated);
    setActiveMeal(null);
    setIsMovingDay(false);
    showToast(`Swapped with ${targetDay}`);
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
      showToast(`${name.trim()} is already here`);
      setSearchQuery('');
      return;
    }
    togglePantryItem({ name: name.trim() });
    setSearchQuery('');
  }

  // --- Screens ---

  const renderSplash = () => (
    <div className="min-h-screen flex flex-col p-8 bg-white selection:bg-indigo-100">
      <div className="flex-1 flex flex-col justify-center items-center text-center space-y-10">
        <IllustrationSplash />
        <div className="space-y-4">
          <h1 className="text-5xl font-black text-slate-900 leading-[1.1] tracking-tighter">Dinner planning, solved.</h1>
          <p className="text-xl text-slate-500 font-medium max-w-xs mx-auto leading-relaxed">Delicious, realistic weekly plans tailored to your diet and your fridge.</p>
        </div>
      </div>
      <div className="space-y-4 pb-10">
        <Button onClick={() => handleLogin(true)}>Get Started</Button>
        <Button variant="secondary" onClick={() => navigate('LOGIN')}>Log In</Button>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="min-h-screen p-6 pb-32 bg-slate-50 flex flex-col gap-8 overflow-y-auto">
      <div className="flex justify-between items-center mt-4">
        <div className="space-y-1">
          <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Dashboard</p>
          <h2 className="text-3xl font-black text-slate-900">Hey, {prefs.name}</h2>
        </div>
        <button onClick={() => navigate('PROFILE')} className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center border-2 border-slate-100 shadow-sm active:scale-95 transition-all overflow-hidden">
          <div className="w-full h-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-black text-xl">
            {prefs.name[0]}
          </div>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Diet', value: prefs.diet, icon: '🥗' },
          { label: 'Time', value: `${prefs.baseTime}m`, icon: '⏱️' },
          { label: 'Pantry', value: pantry.length, icon: '🥫' }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm text-center space-y-1">
            <span className="text-lg">{stat.icon}</span>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{stat.label}</p>
            <p className="text-xs font-extrabold text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <button 
        onClick={generateWeek} 
        className="group relative bg-slate-900 p-10 rounded-[40px] text-left text-white shadow-2xl shadow-slate-200 overflow-hidden active:scale-[0.98] transition-all"
      >
        <div className="relative z-10 space-y-3">
          <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/10">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            AI Generator Ready
          </div>
          <h2 className="text-3xl font-black leading-none tracking-tighter">Build this week's plan</h2>
          <p className="opacity-60 text-sm font-medium">Custom Mon–Sun dinner schedule in 10s.</p>
        </div>
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
           <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M11 2L9 4.96l-3.32-.4L3.73 7.5l2.42 2.42-1.01 3.32 3.09 1.15 1.15 3.09 3.32-1.01 2.42 2.42 2.94-1.95-.4-3.32L22 11l-2.96-2L19.44 5.68l-3.32.4L13.18 3.14 11 2z"/></svg>
        </div>
      </button>

      <div className="space-y-4">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest ml-1">Essentials</h3>
        <div className="grid grid-cols-1 gap-4">
          <button 
            onClick={() => navigate('PANTRY')} 
            className="bg-white p-6 rounded-[32px] border-2 border-slate-50 shadow-sm text-left flex items-center justify-between group active:scale-[0.98] transition-all hover:border-indigo-100"
          >
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all text-indigo-600">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
              </div>
              <div>
                <p className="font-black text-slate-900 text-lg tracking-tight">Virtual Pantry</p>
                <p className="text-sm text-slate-400 font-medium">Track {pantry.length} current ingredients</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-slate-300 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
    </div>
  );

  const renderPantry = () => (
    <div className="min-h-screen p-6 bg-white flex flex-col relative overflow-hidden">
      <Header title="Your Pantry" onBack={() => navigate('DASHBOARD')} />
      <div className="flex-1 space-y-8 overflow-y-auto mt-4 pb-32 no-scrollbar">
        <div className="space-y-6">
          <button 
            onClick={() => { setScreen('SCAN_CAMERA'); startCamera(); }}
            className="w-full bg-slate-900 p-10 rounded-[40px] flex flex-col items-center gap-4 hover:bg-slate-800 transition-all shadow-xl active:scale-95"
          >
            <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-md">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </div>
            <div className="text-center">
              <p className="font-black text-white text-xl tracking-tight">AI Fridge Scanner</p>
              <p className="text-sm text-slate-400 font-medium mt-1">Instant detection via camera</p>
            </div>
          </button>

          <div className="relative group">
            <input 
              className="w-full p-5 pl-14 bg-slate-50 rounded-2xl outline-none border-2 border-transparent focus:border-slate-900 focus:bg-white transition-all font-bold placeholder:text-slate-300" 
              placeholder="Search or add manually..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCustomPantryItem(searchQuery)}
            />
            <svg className="w-6 h-6 absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-slate-900 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            {searchQuery.trim().length > 0 && (
              <button onClick={() => addCustomPantryItem(searchQuery)} className="absolute right-4 top-1/2 -translate-y-1/2 bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-black shadow-lg">ADD</button>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Suggestions</h3>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_INGREDIENTS.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase())).map(item => {
                const isSelected = pantry.find(p => p.name.toLowerCase() === item.name.toLowerCase());
                return (
                  <button
                    key={item.id}
                    onClick={() => togglePantryItem(item)}
                    className={`px-5 py-2.5 rounded-full text-sm font-bold border-2 transition-all active:scale-95 ${
                      isSelected ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-200'
                    }`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Your Inventory ({pantry.length})</h3>
            {pantry.length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {pantry.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-5 bg-white rounded-2xl border-2 border-slate-50 shadow-sm animate-in fade-in slide-in-from-left duration-300">
                    <span className="font-bold text-slate-900 text-lg capitalize">{item.name}</span>
                    <button onClick={() => togglePantryItem(item)} className="p-2 hover:bg-rose-50 hover:text-rose-500 text-slate-300 rounded-xl transition-all">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
                <IllustrationEmptyPantry />
                <p className="text-slate-400 font-medium">Your pantry is currently empty.<br/>Add items to get smarter plans.</p>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 p-8 bg-white/80 backdrop-blur-xl border-t-2 border-slate-50 z-[90]">
        <Button onClick={() => navigate('DASHBOARD')}>Save & Continue</Button>
      </div>
    </div>
  );

  const renderGenerateLoading = () => (
    <div className="min-h-screen p-12 bg-slate-900 text-white flex flex-col items-center justify-center text-center">
      <div className="mb-12">
        <IllustrationLoading />
      </div>
      <h2 className="text-4xl font-black mb-4 tracking-tighter">Preparing your week...</h2>
      <p className="text-slate-400 text-lg mb-12 font-medium opacity-80 leading-relaxed max-w-xs">Integrating diet, cooking time, and pantry inventory.</p>
      
      <div className="h-8 overflow-hidden w-full max-w-[320px] bg-white/5 rounded-full px-6">
        <div 
          className="transition-all duration-700 ease-in-out" 
          style={{ transform: `translateY(-${loadingHintIndex * 32}px)` }}
        >
          {loadingHints.map((hint, i) => (
            <p key={i} className="h-8 flex items-center justify-center text-emerald-400 font-black text-xs uppercase tracking-widest">
              {hint}
            </p>
          ))}
        </div>
      </div>
    </div>
  );

  const renderWeeklyPlan = () => (
    <div className="min-h-screen p-6 bg-slate-50 flex flex-col relative overflow-y-auto pb-40 no-scrollbar">
      <Header title="Your Weekly Dinner" onBack={() => navigate('DASHBOARD')} />
      <div className="space-y-4 mt-4">
        {mealPlan.map((meal, idx) => (
          <div 
            key={idx} 
            onClick={() => openSwap(meal, idx)}
            className="bg-white p-6 rounded-[32px] shadow-sm border-2 border-transparent hover:border-indigo-100 flex gap-5 items-center group active:scale-[0.98] transition-all cursor-pointer animate-in fade-in slide-in-from-bottom duration-500"
            style={{ animationDelay: `${idx * 80}ms` }}
          >
            <div className="flex-1 space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">{meal.day}</p>
                {meal.time > 0 && <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-3 py-1 rounded-full uppercase">{meal.time}m</span>}
              </div>
              <h3 className="font-black text-xl text-slate-900 leading-tight tracking-tight">{meal.name}</h3>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
                {meal.isPantryFriendly && (
                  <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-lg uppercase border border-emerald-100">Pantry-first</span>
                )}
                {meal.time <= 20 && meal.time > 0 && (
                  <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1.5 rounded-lg uppercase border border-indigo-100">Express</span>
                )}
                {meal.tags.slice(0, 2).map((tag, tIdx) => (
                  <span key={tIdx} className="text-[9px] font-black text-slate-400 bg-slate-50 px-2.5 py-1.5 rounded-lg uppercase border border-slate-100">{tag}</span>
                ))}
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300 group-hover:bg-slate-900 group-hover:text-white transition-all">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-8 bg-white/80 backdrop-blur-xl border-t-2 border-slate-50 z-[100] space-y-4">
        <Button onClick={() => showToast("Template saved to your library!")}>Save as Template</Button>
      </div>

      {activeMeal && (
        <div className="fixed inset-0 bg-slate-900/60 z-[200] flex items-end justify-center p-6 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-[48px] p-8 shadow-2xl animate-in slide-in-from-bottom duration-500 flex flex-col max-h-[85vh]">
            <div className="w-14 h-1.5 bg-slate-100 rounded-full mx-auto mb-8 shrink-0" />
            
            {!isMovingDay ? (
              <div className="overflow-y-auto no-scrollbar pb-4">
                <div className="mb-10 text-center shrink-0">
                  <p className="text-[10px] font-black text-indigo-500 uppercase mb-2 tracking-[0.3em]">{activeMeal.meal.day} dinner</p>
                  <h2 className="text-3xl font-black leading-none text-slate-900 tracking-tighter">{activeMeal.meal.name}</h2>
                </div>
                
                <div className="space-y-8">
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Swap Options</h3>
                    {isLoadingSwaps ? (
                       <div className="space-y-3 animate-pulse">
                         {[1,2,3].map(i => <div key={i} className="h-20 bg-slate-50 rounded-3xl" />)}
                       </div>
                    ) : (
                      <div className="space-y-3">
                        {swapOptions.map((opt, i) => (
                          <button 
                            key={i} 
                            onClick={() => applySwap(opt)}
                            className="w-full p-5 bg-slate-50 rounded-3xl text-left flex justify-between items-center hover:bg-slate-100 transition-all border-2 border-transparent active:scale-[0.98]"
                          >
                            <div className="space-y-1">
                              <p className="font-extrabold text-slate-900">{opt.name}</p>
                              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{opt.time}m • {opt.isPantryFriendly ? 'Uses Pantry' : 'Shopping Needed'}</p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                               <svg className="w-4 h-4 text-slate-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setIsMovingDay(true)} className="p-5 bg-slate-100 rounded-[28px] font-black text-slate-900 text-xs uppercase tracking-widest active:scale-95 transition-all">Move</button>
                    <button onClick={() => { 
                      applySwap({ name: "Eating Out 🍕", time: 0, tags: ['Social'], isPantryFriendly: false });
                    }} className="p-5 bg-indigo-50 text-indigo-600 rounded-[28px] font-black text-xs uppercase tracking-widest active:scale-95 transition-all">Out</button>
                  </div>

                  <button onClick={() => applySwap({ name: "Unplanned", time: 0, tags: [], isPantryFriendly: false })} className="w-full p-5 text-rose-500 font-black text-xs uppercase tracking-widest active:scale-95">Clear Day</button>
                  <Button variant="secondary" onClick={() => setActiveMeal(null)}>Close</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="text-center mb-10 shrink-0">
                  <h2 className="text-3xl font-black leading-none text-slate-900 tracking-tighter">Reschedule</h2>
                  <p className="text-slate-400 font-medium mt-2">Swap with another weekday</p>
                </div>
                <div className="grid grid-cols-1 gap-3 overflow-y-auto mb-8 no-scrollbar">
                  {DAYS.filter(d => d !== activeMeal.meal.day).map(day => (
                    <button
                      key={day}
                      onClick={() => moveMealToDay(day)}
                      className="w-full p-5 bg-slate-50 rounded-[28px] font-black text-slate-900 text-left hover:bg-slate-100 transition-all active:scale-[0.98] border-2 border-transparent"
                    >
                      {day}
                    </button>
                  ))}
                </div>
                <Button onClick={() => setIsMovingDay(false)}>Cancel</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // --- Added renderScanCamera and renderScanReview to fix missing name errors ---

  const renderScanCamera = () => (
    <div className="min-h-screen bg-black flex flex-col relative">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        className="flex-1 object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />
      
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
        <button onClick={() => navigate('PANTRY')} className="p-3 bg-white/10 backdrop-blur-md rounded-2xl text-white">
           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-white font-black text-xs uppercase tracking-[0.3em]">Scanning Pantry</span>
        <div className="w-12" />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-12 bg-gradient-to-t from-black/60 to-transparent flex flex-col items-center gap-6">
        <button 
          onClick={captureAndScan}
          className="w-20 h-20 bg-white rounded-full border-[6px] border-white/30 flex items-center justify-center active:scale-90 transition-transform"
        >
          <div className="w-14 h-14 bg-white rounded-full border-2 border-slate-900" />
        </button>
        <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Hold steady for better detection</p>
      </div>
    </div>
  );

  const renderScanReview = () => (
    <div className="min-h-screen p-6 bg-white flex flex-col">
      <Header title="Scan Results" />
      <div className="flex-1 space-y-8 overflow-y-auto mt-4 pb-32 no-scrollbar">
        <div className="space-y-4">
          <div className="p-6 bg-indigo-50 rounded-[32px] border-2 border-indigo-100 flex items-center gap-5">
             <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             </div>
             <div>
               <p className="font-black text-indigo-900">AI Detection Complete</p>
               <p className="text-xs text-indigo-600 font-bold uppercase tracking-widest">{detectedIngredients.length} items found</p>
             </div>
          </div>

          <div className="space-y-3">
            {detectedIngredients.map((name, i) => (
              <div key={i} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border-2 border-transparent">
                <span className="font-bold text-slate-900 capitalize">{name}</span>
                <button 
                  onClick={() => {
                    togglePantryItem({ name });
                    setDetectedIngredients(prev => prev.filter(item => item !== name));
                  }}
                  className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black"
                >
                  ADD
                </button>
              </div>
            ))}
          </div>

          {detectedIngredients.length === 0 && (
             <div className="py-20 text-center space-y-4">
               <p className="text-slate-400 font-medium italic">All detected items processed or none found.</p>
               <Button variant="secondary" onClick={() => navigate('PANTRY')}>Back to Pantry</Button>
             </div>
          )}
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 p-8 bg-white/80 backdrop-blur-xl border-t-2 border-slate-50 z-[90]">
        <Button onClick={() => navigate('PANTRY')}>Finish & Review Pantry</Button>
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="min-h-screen p-6 bg-slate-50 flex flex-col gap-8 overflow-y-auto pb-20">
      <Header title="Account" onBack={() => navigate('DASHBOARD')} />
      
      <div className="bg-white p-8 rounded-[40px] border-2 border-slate-50 shadow-sm flex items-center gap-6">
        <div className="w-20 h-20 bg-slate-900 rounded-[28px] flex items-center justify-center text-white text-3xl font-black shadow-2xl">
          {prefs.name[0]}
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">{prefs.name}</h2>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">{prefs.isLoggedIn ? 'Verified Member' : 'Guest Mode'}</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Configuration</h3>
        <div className="bg-white rounded-[32px] border-2 border-slate-50 shadow-sm overflow-hidden">
          {[
            { label: 'Dietary Preference', value: prefs.diet, screen: 'DIET' },
            { label: 'Standard Prep Time', value: `${prefs.baseTime}m`, screen: 'TIME_SETUP' },
            { label: 'Busy-Day Logic', value: Object.keys(prefs.busyDays).length > 0 ? 'Custom' : 'Default', screen: 'TIME_SETUP' }
          ].map((item, i) => (
            <button key={i} onClick={() => navigate(item.screen as any)} className="w-full p-6 flex items-center justify-between hover:bg-slate-50 transition-colors border-b last:border-0 border-slate-50 text-left">
              <span className="font-bold text-slate-700">{item.label}</span>
              <span className="text-slate-900 font-black text-xs uppercase bg-slate-100 px-3 py-1.5 rounded-lg tracking-widest">{item.value}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-indigo-900 p-8 rounded-[40px] text-white space-y-6 shadow-2xl shadow-indigo-100 relative overflow-hidden">
        <div className="relative z-10">
          <h4 className="font-black text-xl mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Pro Planning Insights
          </h4>
          <div className="space-y-6">
            <div className="space-y-2">
               <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Time Efficiency</p>
               <p className="text-sm font-medium opacity-80 leading-relaxed">Plans fail when time isn't respected. Your current profile optimizes for 30m Express meals.</p>
            </div>
            <div className="space-y-2">
               <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Pantry Utilization</p>
               <p className="text-sm font-medium opacity-80 leading-relaxed">Users who add 5+ pantry items report 40% higher satisfaction. Scan your fridge weekly.</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-6 opacity-10">
           <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        </div>
      </div>

      <div className="mt-8">
        <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full p-6 text-slate-400 font-black text-xs uppercase tracking-widest hover:text-rose-500 transition-colors">
          Reset All Data & Log Out
        </button>
      </div>
    </div>
  );

  // --- Utility Views ---

  const renderWelcome = () => (
    <div className="min-h-screen flex flex-col p-8 bg-slate-900 text-white selection:bg-indigo-500">
      <div className="flex-1 flex flex-col justify-center space-y-8">
        <div className="w-20 h-20 bg-indigo-500 rounded-[28px] flex items-center justify-center shadow-2xl">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
        </div>
        <div className="space-y-3">
          <h2 className="text-5xl font-black leading-none tracking-tighter">Let's build your profile.</h2>
          <p className="text-xl text-slate-400 font-medium leading-relaxed">Two quick questions and we'll have your first week planned.</p>
        </div>
      </div>
      <div className="pb-10">
        <Button className="!bg-white !text-slate-900" onClick={() => navigate('DIET')}>Get Started</Button>
      </div>
    </div>
  );

  const renderDiet = () => (
    <div className="min-h-screen p-8 bg-white flex flex-col">
      <div className="flex-1 space-y-12 mt-16">
        <div className="space-y-3 text-center">
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Your dietary lens?</h2>
          <p className="text-slate-500 font-medium">We only suggest what you love to eat.</p>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {(['Vegetarian', 'Non-veg', 'Egg-only', 'Vegan'] as DietType[]).map(type => (
            <button
              key={type}
              onClick={() => setPrefs(p => ({ ...p, diet: type }))}
              className={`p-6 rounded-3xl text-left font-black tracking-tight border-2 transition-all active:scale-95 ${
                prefs.diet === type ? 'border-slate-900 bg-slate-900 text-white shadow-xl' : 'border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-100'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
      <div className="pb-10 pt-4">
        <Button onClick={() => navigate('TIME_SETUP')}>Continue</Button>
      </div>
    </div>
  );

  const renderTimeSetup = () => (
    <div className="min-h-screen p-8 bg-white flex flex-col">
      <div className="flex-1 space-y-12 mt-16 overflow-y-auto no-scrollbar">
        <div className="space-y-3 text-center">
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">Cooking window?</h2>
          <p className="text-slate-500 font-medium">Average time you commit to dinner.</p>
        </div>
        
        <div className="space-y-8">
          <div className="flex gap-3">
            {[15, 30, 45].map(t => (
              <button
                key={t}
                onClick={() => setPrefs(p => ({ ...p, baseTime: t }))}
                className={`flex-1 py-6 px-2 rounded-3xl border-2 font-black text-sm tracking-widest ${
                  prefs.baseTime === t ? 'bg-slate-900 border-slate-900 text-white shadow-xl' : 'bg-slate-50 border-slate-50 text-slate-400'
                }`}
              >
                {t}{t === 45 ? '+' : ''} MIN
              </button>
            ))}
          </div>

          <div className="p-6 bg-slate-50 rounded-[32px] flex items-center justify-between border-2 border-slate-50">
            <div>
              <p className="font-black text-slate-900 tracking-tight">Busy-day override</p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-0.5">Adjust for specific days</p>
            </div>
            <button 
              onClick={() => setIsBusyToggle(!isBusyToggle)}
              className={`w-14 h-8 rounded-full transition-all relative ${isBusyToggle ? 'bg-slate-900' : 'bg-slate-200'}`}
            >
              <div className={`absolute top-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm ${isBusyToggle ? 'right-1' : 'left-1'}`} />
            </button>
          </div>

          {isBusyToggle && (
            <div className="space-y-3 pb-4 animate-in slide-in-from-top-4 fade-in duration-300">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                <div key={day} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-2xl">
                  <span className="font-black text-slate-400 text-xs uppercase tracking-widest ml-3">{day}</span>
                  <div className="flex gap-2">
                    {[15, 30, 45].map(t => (
                      <button 
                        key={t}
                        onClick={() => setPrefs(p => ({ ...p, busyDays: { ...p.busyDays, [day]: t } }))}
                        className={`w-12 h-10 text-[10px] rounded-xl font-black border-2 transition-all ${
                          (prefs.busyDays[day] || prefs.baseTime) === t ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-100 text-slate-300'
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
      <div className="pb-10 pt-4">
        <Button onClick={() => navigate('DASHBOARD')}>Build Profile</Button>
      </div>
    </div>
  );

  return (
    <div className="max-w-md mx-auto bg-white shadow-2xl overflow-hidden relative min-h-screen flex flex-col font-sans">
      <div className="flex-1 h-full">
        {(() => {
          switch (screen) {
            case 'SPLASH': return renderSplash();
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
