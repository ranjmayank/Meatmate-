
import React, { useState, useEffect, useRef } from 'react';
import { Screen, UserPreferences, Ingredient, DietType, Meal } from './types';
import { gemini } from './geminiService';
import { DAYS, SUGGESTED_INGREDIENTS } from './constants';

// --- Illustrations ---

const IllustrationChef = () => (
  <svg viewBox="0 0 200 200" className="w-64 h-64 md:w-72 md:h-72 drop-shadow-2xl transition-all duration-500">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#064E3B', stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: '#065F46', stopOpacity: 1 }} />
      </linearGradient>
    </defs>
    <circle cx="100" cy="100" r="95" fill="#FDFCF7" />
    <path d="M50 140 Q100 170 150 140" stroke="url(#grad1)" strokeWidth="4" fill="none" strokeLinecap="round" />
    <rect x="75" y="45" width="50" height="60" rx="4" fill="white" stroke="#064E3B" strokeWidth="3" />
    <path d="M85 60 H115 M85 75 H115" stroke="#ECFDF5" strokeWidth="3" strokeLinecap="round" />
    <circle cx="160" cy="80" r="24" fill="#D97706" opacity="0.95" />
    <path d="M154 80 L158 84 L168 74" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" />
  </svg>
);

const IllustrationEmpty = () => (
  <div className="flex flex-col items-center opacity-40 py-12">
    <svg viewBox="0 0 100 100" className="w-40 h-40 grayscale">
      <path d="M20 40 H80 V80 Q80 90 70 90 H30 Q20 90 20 80 Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M40 30 L50 20 L60 30" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
    <p className="mt-6 font-serif italic text-xl">The kitchen is quiet...</p>
  </div>
);

// --- Styled Components ---

const Button: React.FC<{ 
  onClick?: () => void; 
  children: React.ReactNode; 
  variant?: 'primary' | 'secondary' | 'ghost'; 
  className?: string;
  disabled?: boolean;
}> = ({ onClick, children, variant = 'primary', className = '', disabled }) => {
  const base = "w-full py-5 px-10 rounded-2xl font-extrabold transition-all duration-300 flex items-center justify-center gap-4 tracking-wide text-base btn-press disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-[#064E3B] text-white shadow-xl shadow-emerald-900/20 hover:bg-[#08634b] hover:-translate-y-0.5",
    secondary: "bg-white text-[#064E3B] border-2 border-emerald-50 shadow-md hover:border-emerald-200 hover:bg-emerald-50/10",
    ghost: "bg-transparent text-emerald-800/70 hover:text-emerald-900 underline underline-offset-8 decoration-emerald-200"
  };
  return (
    <button disabled={disabled} onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
};

const Header: React.FC<{ title: string; onBack?: () => void; right?: React.ReactNode }> = ({ title, onBack, right }) => (
  <header className="flex items-center justify-between px-6 py-10 sticky top-0 bg-[#FDFCF7]/95 backdrop-blur-2xl z-40 border-b border-emerald-50/60 shadow-sm">
    <div className="flex items-center gap-6">
      {onBack && (
        <button onClick={onBack} className="w-12 h-12 flex items-center justify-center text-emerald-900 bg-white border border-emerald-100 rounded-2xl shadow-sm hover:bg-emerald-50 transition-all btn-press">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
        </button>
      )}
      <h1 className="text-3xl font-bold text-[#064E3B] tracking-tight">{title}</h1>
    </div>
    {right}
  </header>
);

const Toast: React.FC<{ message: string; onClear: () => void }> = ({ message, onClear }) => {
  useEffect(() => {
    const timer = setTimeout(onClear, 3000);
    return () => clearTimeout(timer);
  }, [onClear]);

  return (
    <div className="fixed bottom-8 left-6 right-6 z-[300] bg-[#1A1C19] text-[#FDFCF7] px-10 py-6 rounded-[2.5rem] text-sm md:text-base font-bold shadow-2xl animate-in fade-in slide-in-from-bottom-12 flex items-center justify-between border border-white/5">
      <div className="flex items-center gap-4">
        <span className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
        {message}
      </div>
      <button onClick={onClear} className="opacity-40 hover:opacity-100 transition-opacity p-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
};

// --- Main Application ---

export default function App() {
  const [screen, setScreen] = useState<Screen>('SPLASH');
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    const saved = localStorage.getItem('mealmate_prefs_v2');
    return saved ? JSON.parse(saved) : {
      name: 'Guest',
      diet: 'Vegetarian',
      baseTime: 30,
      busyDays: {},
      isLoggedIn: false
    };
  });
  
  const [pantry, setPantry] = useState<Ingredient[]>(() => {
    const saved = localStorage.getItem('mealmate_pantry_v2');
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
    "Consulting our flavor archives",
    "Matching with your pantry's inventory",
    "Optimizing prep times for your schedule",
    "Finalizing your bespoke culinary week"
  ];

  // Logic & Effects
  useEffect(() => localStorage.setItem('mealmate_prefs_v2', JSON.stringify(prefs)), [prefs]);
  useEffect(() => localStorage.setItem('mealmate_pantry_v2', JSON.stringify(pantry)), [pantry]);

  useEffect(() => {
    let interval: any;
    if (screen === 'GENERATE_LOADING') {
      interval = setInterval(() => setLoadingHintIndex(i => (i + 1) % loadingHints.length), 2200);
    }
    return () => clearInterval(interval);
  }, [screen]);

  const showToast = (msg: string) => setToast(msg);
  const navigate = (to: Screen) => { setScreen(to); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      showToast("Camera access required for scanning.");
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
        showToast("Scan unsuccessful. Please add manually.");
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
        } else throw new Error();
      } catch (e) {
        showToast("AI Strategist is busy. Let's try again.");
        setScreen('DASHBOARD');
      }
    }, 1500);
  };

  const togglePantryItem = (item: Ingredient | {name: string, id?: string}) => {
    const isSelected = pantry.find(p => p.name.toLowerCase() === item.name.toLowerCase());
    if (isSelected) {
      setPantry(prev => prev.filter(p => p.name.toLowerCase() !== item.name.toLowerCase()));
      showToast(`Removed ${item.name}`);
    } else {
      const newItem = { ...item, id: item.id || Math.random().toString(36).substr(2, 9), category: 'Manual' };
      setPantry(prev => [...prev, newItem as Ingredient]);
      showToast(`Added ${item.name}`);
    }
  }

  const addCustomPantryItem = (name: string) => {
    if (!name.trim()) return;
    togglePantryItem({ name: name.trim() });
    setSearchQuery('');
  };

  useEffect(() => {
    if (activeMeal) {
      const fetchSwaps = async () => {
        setIsLoadingSwaps(true);
        try {
          const suggestions = await gemini.getSwapSuggestions(activeMeal.meal.name, prefs, pantry);
          setSwapOptions(suggestions);
        } catch (e) {
          console.error("Failed to fetch swaps", e);
        } finally {
          setIsLoadingSwaps(false);
        }
      };
      fetchSwaps();
    } else {
      setSwapOptions([]);
    }
  }, [activeMeal, prefs, pantry]);

  // --- Screens ---

  const renderSplash = () => (
    <div className="min-h-screen flex flex-col p-10 bg-[#FDFCF7] page-enter">
      <div className="flex-1 flex flex-col justify-center items-center text-center space-y-16">
        <IllustrationChef />
        <div className="space-y-8">
          <h1 className="text-6xl font-serif text-[#064E3B] leading-[1.1] italic tracking-tight">Dinner Planning,<br/>Perfectly Seasoned.</h1>
          <p className="text-xl text-emerald-900/60 font-medium max-w-sm mx-auto leading-relaxed">Sophisticated, realistic meal plans tailored to your life and your kitchen stock.</p>
        </div>
      </div>
      <div className="space-y-6 pb-16">
        <Button onClick={() => navigate('WELCOME')}>Get Started</Button>
        <Button variant="secondary" onClick={() => navigate('LOGIN')}>Existing Member</Button>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="min-h-screen p-6 pb-40 bg-[#FDFCF7] page-enter flex flex-col gap-12 max-w-lg mx-auto overflow-x-hidden">
      <Header title={`Chef ${prefs.name}`} right={
        <button onClick={() => navigate('PROFILE')} className="w-14 h-14 bg-white border-2 border-emerald-50 rounded-[1.25rem] flex items-center justify-center text-[#064E3B] font-extrabold shadow-sm active:scale-90 transition-all">
          {prefs.name[0]}
        </button>
      } />

      <div className="grid grid-cols-3 gap-5">
        {[
          { icon: '🥗', val: prefs.diet, label: 'Diet' },
          { icon: '⏱️', val: `${prefs.baseTime}m`, label: 'Prep' },
          { icon: '📦', val: pantry.length, label: 'Stock' }
        ].map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-emerald-50 text-center space-y-2 transition-transform hover:scale-105">
            <span className="text-3xl block">{stat.icon}</span>
            <p className="text-[11px] font-bold text-emerald-900/40 uppercase tracking-widest">{stat.label}</p>
            <p className="text-sm font-black text-emerald-900">{stat.val}</p>
          </div>
        ))}
      </div>

      <button 
        onClick={generateWeek}
        className="group relative bg-[#064E3B] p-12 rounded-[3.5rem] text-left text-white shadow-2xl shadow-emerald-900/20 overflow-hidden card-premium"
      >
        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center gap-3 bg-white/10 px-5 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.2em] border border-white/5 backdrop-blur-md">
            <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse shadow-[0_0_8px_rgba(110,231,183,0.8)]" />
            Strategist Online
          </div>
          <h2 className="text-5xl font-serif italic leading-[1] tracking-tight">Curate my<br/>next week</h2>
          <p className="text-emerald-100/60 text-lg font-medium leading-relaxed">Bespoke Mon–Sun dinner schedule synchronized with your preferences.</p>
        </div>
        <div className="absolute -top-12 -right-12 opacity-[0.08] rotate-12 group-hover:rotate-45 group-hover:scale-125 transition-all duration-700 ease-out">
          <svg className="w-64 h-64" fill="white" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
        </div>
      </button>

      <div className="space-y-8">
        <h3 className="text-xs font-bold text-emerald-900/30 uppercase tracking-[0.3em] ml-4">Kitchen Management</h3>
        <button 
          onClick={() => navigate('PANTRY')} 
          className="w-full bg-white p-10 rounded-[3rem] border border-emerald-50 shadow-md flex items-center justify-between group card-premium"
        >
          <div className="flex items-center gap-8">
            <div className="w-20 h-20 bg-emerald-50 rounded-[2rem] flex items-center justify-center text-emerald-700 group-hover:bg-[#064E3B] group-hover:text-white transition-all duration-500 shadow-inner">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-900 tracking-tight">Virtual Pantry</p>
              <p className="text-base text-emerald-900/40 font-medium">Monitoring {pantry.length} essentials</p>
            </div>
          </div>
          <div className="w-12 h-12 flex items-center justify-center text-emerald-200 group-hover:text-[#064E3B] group-hover:translate-x-2 transition-all duration-300">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
          </div>
        </button>
      </div>
    </div>
  );

  const renderWeeklyPlan = () => (
    <div className="min-h-screen p-6 pb-48 bg-[#FDFCF7] page-enter flex flex-col gap-8 no-scrollbar overflow-y-auto max-w-lg mx-auto">
      <Header title="Weekly Menu" onBack={() => navigate('DASHBOARD')} />
      <div className="space-y-6">
        {mealPlan.map((meal, idx) => (
          <div 
            key={idx} 
            onClick={() => setActiveMeal({ meal, index: idx })}
            className="bg-white p-10 rounded-[3rem] shadow-sm border border-emerald-50 flex gap-8 items-center group card-premium animate-in fade-in slide-in-from-bottom duration-700"
            style={{ animationDelay: `${idx * 120}ms` }}
          >
            <div className="flex-1 space-y-5">
              <div className="flex justify-between items-center">
                <p className="text-xs font-black text-[#D97706] uppercase tracking-[0.3em]">{meal.day}</p>
                {meal.time > 0 && <span className="text-[11px] font-bold bg-emerald-50 text-[#064E3B] px-4 py-1.5 rounded-full uppercase tracking-wider">{meal.time}m</span>}
              </div>
              <h3 className="text-3xl font-serif italic text-emerald-900 leading-tight tracking-tight">{meal.name}</h3>
              <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pt-2">
                {meal.isPantryFriendly && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-4 py-2 rounded-xl uppercase tracking-[0.1em] border border-emerald-100">Kitchen-Friendly</span>
                )}
                {meal.tags.slice(0, 2).map((tag, tIdx) => (
                  <span key={tIdx} className="text-[10px] font-bold text-emerald-900/40 border border-emerald-100 px-4 py-2 rounded-xl uppercase tracking-[0.1em]">{tag}</span>
                ))}
              </div>
            </div>
            <div className="w-14 h-14 rounded-[1.5rem] bg-emerald-50/50 flex items-center justify-center text-emerald-200 group-hover:bg-[#064E3B] group-hover:text-white transition-all shadow-sm">
               <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 5v.01M12 12v.01M12 19v.01" /></svg>
            </div>
          </div>
        ))}
      </div>
      <div className="fixed bottom-0 left-0 right-0 p-10 bg-[#FDFCF7]/90 backdrop-blur-2xl border-t border-emerald-50 z-50 flex justify-center">
        <div className="w-full max-w-lg">
          <Button onClick={() => showToast("Menu saved to your archives.")}>Finalize Week</Button>
        </div>
      </div>

      {activeMeal && (
        <div className="fixed inset-0 bg-[#064E3B]/30 backdrop-blur-xl z-[200] flex items-end justify-center p-6 md:p-10 animate-in fade-in duration-400">
          <div className="bg-white w-full max-w-lg rounded-[4rem] p-12 shadow-[0_25px_60px_-15px_rgba(6,78,59,0.3)] animate-in slide-in-from-bottom duration-600 max-h-[85vh] overflow-y-auto no-scrollbar">
            <div className="w-20 h-2 bg-emerald-50 rounded-full mx-auto mb-12" />
            <div className="mb-12 text-center">
              <p className="text-xs font-black text-[#D97706] uppercase mb-4 tracking-[0.4em]">{activeMeal.meal.day} selection</p>
              <h2 className="text-4xl font-serif italic text-emerald-900 leading-[1.2] tracking-tight">{activeMeal.meal.name}</h2>
            </div>
            
            <div className="space-y-12">
              <div className="space-y-6">
                <h3 className="text-xs font-bold text-emerald-900/30 uppercase tracking-[0.3em] ml-4">Consider an Alternative</h3>
                <div className="space-y-4">
                  {isLoadingSwaps ? (
                    <div className="space-y-4 animate-pulse">
                      {[1,2].map(i => <div key={i} className="h-28 bg-emerald-50/40 rounded-[2.5rem]" />)}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {swapOptions.map((opt, i) => (
                        <button 
                          key={i} 
                          onClick={() => {
                            const updated = [...mealPlan];
                            updated[activeMeal!.index] = { ...updated[activeMeal!.index], ...opt } as Meal;
                            setMealPlan(updated);
                            setActiveMeal(null);
                            showToast(`Swapped to ${opt.name}`);
                          }}
                          className="w-full p-8 bg-emerald-50/30 rounded-[2.5rem] text-left flex justify-between items-center hover:bg-emerald-50 transition-all border-2 border-transparent hover:border-emerald-100 group shadow-sm"
                        >
                          <div className="space-y-2">
                            <p className="text-xl font-bold text-emerald-900 tracking-tight">{opt.name}</p>
                            <p className="text-[11px] text-emerald-900/40 font-black uppercase tracking-[0.2em]">{opt.time}m • {opt.isPantryFriendly ? 'Kitchen-Friendly' : 'New List'}</p>
                          </div>
                          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                             <svg className="w-5 h-5 text-emerald-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <Button variant="secondary" className="!rounded-[2rem] !py-6 !text-xs !uppercase !tracking-[0.2em]" onClick={() => showToast("Function coming soon")}>Reschedule</Button>
                <Button variant="secondary" className="!rounded-[2rem] !py-6 !text-xs !uppercase !tracking-[0.2em]" onClick={() => {
                  const updated = [...mealPlan];
                  updated[activeMeal!.index].name = "Dining Out 🥂";
                  setMealPlan(updated);
                  setActiveMeal(null);
                  showToast("Strategic pivot: Dining out.");
                }}>Dine Out</Button>
              </div>
              <Button onClick={() => setActiveMeal(null)} className="!rounded-[2rem] !py-6 !bg-emerald-50 !text-emerald-900 !shadow-none !border-2 !border-emerald-100/50">Keep Selection</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderGenerateLoading = () => (
    <div className="min-h-screen p-12 bg-[#064E3B] text-white flex flex-col items-center justify-center text-center page-enter">
      <div className="relative mb-20">
        <svg viewBox="0 0 100 100" className="w-40 h-40">
          <circle cx="50" cy="50" r="45" fill="none" stroke="white" strokeWidth="1.5" strokeDasharray="6 8" className="animate-spin duration-[15s]" />
          <path d="M30 70 Q50 90 70 70 L75 30 Q50 10 25 30 Z" fill="white" className="animate-bounce" style={{ animationDuration: '2s' }} />
        </svg>
      </div>
      <h2 className="text-5xl font-serif italic mb-8 tracking-tight">Culinary Strategy...</h2>
      <p className="text-emerald-100/70 text-xl mb-16 font-medium max-w-xs leading-relaxed">Synthesizing your stock and preferences into a bespoke weekly menu.</p>
      
      <div className="h-10 overflow-hidden w-full max-w-[360px] bg-white/10 rounded-full px-10 border border-white/5 backdrop-blur-md">
        <div 
          className="transition-all duration-1000 cubic-bezier(0.16, 1, 0.3, 1)" 
          style={{ transform: `translateY(-${loadingHintIndex * 40}px)` }}
        >
          {loadingHints.map((hint, i) => (
            <p key={i} className="h-10 flex items-center justify-center text-emerald-300 font-bold text-xs uppercase tracking-[0.25em]">
              {hint}
            </p>
          ))}
        </div>
      </div>
    </div>
  );

  const renderPantry = () => (
    <div className="min-h-screen p-6 bg-[#FDFCF7] page-enter flex flex-col gap-10 overflow-hidden max-w-lg mx-auto">
      <Header title="Kitchen Stock" onBack={() => navigate('DASHBOARD')} />
      <div className="flex-1 space-y-12 overflow-y-auto no-scrollbar pb-48">
        <button 
          onClick={() => { setScreen('SCAN_CAMERA'); startCamera(); }}
          className="w-full bg-[#1A1C19] p-12 rounded-[4rem] flex flex-col items-center gap-8 shadow-2xl active:scale-95 transition-all group"
        >
          <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] flex items-center justify-center backdrop-blur-2xl border border-white/10 group-hover:bg-emerald-500/10 group-hover:border-emerald-500/20 transition-all duration-500">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <div className="text-center">
            <p className="text-3xl font-serif italic text-white tracking-tight">Visual Scan</p>
            <p className="text-emerald-100/50 text-xs font-bold uppercase tracking-[0.3em] mt-3">Identify ingredients instantly</p>
          </div>
        </button>

        <div className="relative group px-1">
          <input 
            className="w-full p-8 pl-20 bg-white rounded-[2.5rem] outline-none border-2 border-emerald-50 focus:border-emerald-200 transition-all font-bold text-lg placeholder:text-emerald-900/15 shadow-sm" 
            placeholder="Add item manually..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomPantryItem(searchQuery)}
          />
          <svg className="w-8 h-8 absolute left-8 top-1/2 -translate-y-1/2 text-emerald-100 group-focus-within:text-emerald-900 transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>

        <div className="space-y-8">
          <h3 className="text-[11px] font-black text-emerald-900/20 uppercase tracking-[0.4em] ml-4">Current Tracked ({pantry.length})</h3>
          {pantry.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 px-1">
              {pantry.map(item => (
                <div key={item.id} className="flex items-center justify-between p-8 bg-white rounded-[2.5rem] border border-emerald-50 shadow-sm animate-in slide-in-from-left duration-400">
                  <span className="font-bold text-emerald-900 text-xl capitalize tracking-tight">{item.name}</span>
                  <button onClick={() => togglePantryItem(item)} className="p-4 bg-emerald-50/40 hover:bg-rose-50 hover:text-rose-600 text-emerald-200 rounded-[1.5rem] transition-all duration-300">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" d="M6 18L18 6" /></svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
             <IllustrationEmpty />
          )}
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 p-10 bg-[#FDFCF7]/90 backdrop-blur-2xl border-t border-emerald-50 z-[90] flex justify-center">
        <div className="w-full max-w-lg">
          <Button onClick={() => navigate('DASHBOARD')}>Apply & Sync</Button>
        </div>
      </div>
    </div>
  );

  const renderWelcome = () => (
    <div className="min-h-screen flex flex-col p-12 bg-[#064E3B] text-white page-enter">
      <div className="flex-1 flex flex-col justify-center space-y-16">
        <div className="w-28 h-28 bg-white/5 rounded-[3rem] flex items-center justify-center shadow-[0_20px_40px_rgba(0,0,0,0.2)] border border-white/10">
          <svg className="w-14 h-14 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
        </div>
        <div className="space-y-8">
          <h2 className="text-6xl font-serif italic leading-[1.1] tracking-tight">Setting the stage.</h2>
          <p className="text-2xl text-emerald-100/60 font-medium leading-relaxed max-w-sm">Answer two foundational questions to begin your journey.</p>
        </div>
      </div>
      <div className="pb-12">
        <Button className="!bg-white !text-[#064E3B] !py-6" onClick={() => navigate('DIET')}>Commence</Button>
      </div>
    </div>
  );

  const renderDiet = () => (
    <div className="min-h-screen p-10 bg-[#FDFCF7] flex flex-col page-enter max-w-lg mx-auto">
      <div className="flex-1 space-y-20 mt-24">
        <div className="space-y-6 text-center">
          <h2 className="text-5xl font-serif italic text-emerald-900 leading-tight tracking-tight">Your preference?</h2>
          <p className="text-emerald-900/40 font-bold uppercase tracking-[0.3em] text-[11px]">Primary dietary lens</p>
        </div>
        <div className="grid grid-cols-1 gap-5">
          {(['Vegetarian', 'Non-veg', 'Egg-only', 'Vegan'] as DietType[]).map(type => (
            <button
              key={type}
              onClick={() => setPrefs(p => ({ ...p, diet: type }))}
              className={`p-10 rounded-[3rem] text-left font-bold tracking-tight border-2 transition-all duration-400 group active:scale-[0.98] ${
                prefs.diet === type ? 'border-[#064E3B] bg-[#064E3B] text-white shadow-2xl' : 'border-emerald-50 bg-white text-emerald-900/30 hover:border-emerald-100'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xl">{type}</span>
                {prefs.diet === type && <svg className="w-8 h-8 text-emerald-300 animate-in zoom-in duration-300" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>}
              </div>
            </button>
          ))}
        </div>
      </div>
      <div className="pb-16 pt-10">
        <Button onClick={() => navigate('TIME_SETUP')}>Continue</Button>
      </div>
    </div>
  );

  const renderTimeSetup = () => (
    <div className="min-h-screen p-10 bg-[#FDFCF7] flex flex-col page-enter max-w-lg mx-auto">
      <div className="flex-1 space-y-20 mt-24 overflow-y-auto no-scrollbar">
        <div className="space-y-6 text-center">
          <h2 className="text-5xl font-serif italic text-emerald-900 leading-tight tracking-tight">Available time?</h2>
          <p className="text-emerald-900/40 font-bold uppercase tracking-[0.3em] text-[11px]">Average nightly commitment</p>
        </div>
        
        <div className="space-y-16">
          <div className="flex gap-5">
            {[15, 30, 45].map(t => (
              <button
                key={t}
                onClick={() => setPrefs(p => ({ ...p, baseTime: t }))}
                className={`flex-1 py-10 px-6 rounded-[3rem] border-2 font-black text-[13px] tracking-[0.25em] transition-all duration-400 active:scale-[0.95] ${
                  prefs.baseTime === t ? 'bg-[#064E3B] border-[#064E3B] text-white shadow-2xl' : 'bg-white border-emerald-50 text-emerald-900/20'
                }`}
              >
                {t}{t === 45 ? '+' : ''} MIN
              </button>
            ))}
          </div>

          <div className="p-10 bg-white rounded-[3.5rem] flex items-center justify-between border border-emerald-50 shadow-md">
            <div>
              <p className="font-bold text-emerald-900 text-xl tracking-tight">Busy-day logic</p>
              <p className="text-[11px] text-emerald-900/30 font-black uppercase tracking-[0.3em] mt-2">Specific day overrides</p>
            </div>
            <button 
              onClick={() => setIsBusyToggle(!isBusyToggle)}
              className={`w-16 h-10 rounded-full transition-all duration-500 relative ${isBusyToggle ? 'bg-[#064E3B]' : 'bg-emerald-100'}`}
            >
              <div className={`absolute top-1.5 w-7 h-7 bg-white rounded-full transition-all duration-500 shadow-md ${isBusyToggle ? 'right-1.5' : 'left-1.5'}`} />
            </button>
          </div>

          {isBusyToggle && (
            <div className="space-y-5 pb-10 animate-in slide-in-from-top-6 fade-in duration-500">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(day => (
                <div key={day} className="flex items-center justify-between p-6 bg-emerald-50/20 rounded-[2.5rem] border border-emerald-50/50">
                  <span className="font-bold text-emerald-900/40 text-[11px] uppercase tracking-[0.4em] ml-6">{day}</span>
                  <div className="flex gap-3">
                    {[15, 30, 45].map(t => (
                      <button 
                        key={t}
                        onClick={() => setPrefs(p => ({ ...p, busyDays: { ...p.busyDays, [day]: t } }))}
                        className={`w-14 h-12 text-[10px] rounded-2xl font-black border-2 transition-all duration-300 ${
                          (prefs.busyDays[day] || prefs.baseTime) === t ? 'bg-[#064E3B] border-[#064E3B] text-white shadow-lg' : 'bg-white border-emerald-50 text-emerald-100'
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
      <div className="pb-16 pt-10">
        <Button onClick={() => navigate('DASHBOARD')}>Establish Profile</Button>
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="min-h-screen p-6 bg-[#FDFCF7] page-enter flex flex-col gap-12 overflow-y-auto no-scrollbar pb-32 max-w-lg mx-auto">
      <Header title="Account" onBack={() => navigate('DASHBOARD')} />
      
      <div className="bg-white p-12 rounded-[4rem] border border-emerald-50 shadow-sm flex items-center gap-10">
        <div className="w-28 h-28 bg-[#064E3B] rounded-[3rem] flex items-center justify-center text-white text-5xl font-serif italic shadow-2xl">
          {prefs.name[0]}
        </div>
        <div>
          <h2 className="text-4xl font-serif italic text-emerald-900 leading-none">{prefs.name}</h2>
          <p className="text-emerald-900/30 font-bold text-[11px] uppercase tracking-[0.4em] mt-5">Member Tier: Prime</p>
        </div>
      </div>

      <div className="space-y-6">
        <h3 className="text-[11px] font-black text-emerald-900/20 uppercase tracking-[0.4em] ml-4">Strategic Tuning</h3>
        <div className="bg-white rounded-[3rem] border border-emerald-50 shadow-md overflow-hidden">
          {[
            { label: 'Dietary Selection', val: prefs.diet, screen: 'DIET' },
            { label: 'Standard Prep', val: `${prefs.baseTime}m`, screen: 'TIME_SETUP' },
            { label: 'Logic pattern', val: Object.keys(prefs.busyDays).length > 0 ? 'Custom' : 'Standard', screen: 'TIME_SETUP' }
          ].map((item, i) => (
            <button key={i} onClick={() => navigate(item.screen as any)} className="w-full p-10 flex items-center justify-between hover:bg-emerald-50/30 transition-all border-b last:border-0 border-emerald-50 text-left group">
              <span className="font-bold text-emerald-900 text-lg tracking-tight group-hover:translate-x-1 transition-transform">{item.label}</span>
              <span className="text-[#064E3B] font-black text-[11px] uppercase bg-emerald-50 px-5 py-2.5 rounded-xl tracking-[0.2em]">{item.val}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[#1A1C19] p-12 rounded-[4rem] text-white space-y-12 shadow-2xl relative overflow-hidden">
        <div className="relative z-10">
          <h4 className="font-serif italic text-3xl mb-8 text-emerald-300">Strategic Insights</h4>
          <div className="space-y-10">
            <div className="space-y-4">
               <p className="text-[11px] font-black text-emerald-400 uppercase tracking-[0.3em]">Temporal Efficiency</p>
               <p className="text-base font-medium opacity-60 leading-relaxed italic">Prep times under 30m offer the optimal balance between culinary variety and weekly sustainability.</p>
            </div>
            <div className="space-y-4">
               <p className="text-[11px] font-black text-emerald-400 uppercase tracking-[0.3em]">Inventory Health</p>
               <p className="text-base font-medium opacity-60 leading-relaxed italic">Active tracking of 5+ staple ingredients improves AI accuracy by approximately 40%.</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-10 opacity-5">
           <svg className="w-48 h-48" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
        </div>
      </div>

      <div className="mt-8">
        <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full p-10 text-emerald-900/30 font-black text-[11px] uppercase tracking-[0.5em] hover:text-rose-600 transition-colors duration-300 active:scale-95">
          Purge Data & Reset
        </button>
      </div>
    </div>
  );

  const renderScanCamera = () => (
    <div className="min-h-screen bg-black flex flex-col relative page-enter">
      <video ref={videoRef} autoPlay playsInline className="flex-1 object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      
      <div className="absolute top-0 left-0 right-0 p-12 flex justify-between items-center bg-gradient-to-b from-black/90 to-transparent">
        <button onClick={() => navigate('PANTRY')} className="w-14 h-14 flex items-center justify-center bg-white/10 backdrop-blur-2xl rounded-2xl text-white border border-white/20 hover:bg-white/20 active:scale-90 transition-all">
           <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className="text-white font-black text-[11px] uppercase tracking-[0.5em]">Inventory Analysis</span>
        <div className="w-14" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-72 h-96 border-2 border-white/10 rounded-[4rem] relative shadow-[0_0_100px_rgba(255,255,255,0.05)]">
          <div className="absolute -top-1.5 -left-1.5 w-14 h-14 border-t-4 border-l-4 border-emerald-400 rounded-tl-[1.5rem]" />
          <div className="absolute -top-1.5 -right-1.5 w-14 h-14 border-t-4 border-r-4 border-emerald-400 rounded-tr-[1.5rem]" />
          <div className="absolute -bottom-1.5 -left-1.5 w-14 h-14 border-b-4 border-l-4 border-emerald-400 rounded-bl-[1.5rem]" />
          <div className="absolute -bottom-1.5 -right-1.5 w-14 h-14 border-b-4 border-r-4 border-emerald-400 rounded-br-[1.5rem]" />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-20 bg-gradient-to-t from-black/90 to-transparent flex flex-col items-center gap-12">
        <button 
          onClick={captureAndScan}
          className="w-28 h-28 bg-white rounded-full border-[10px] border-white/20 flex items-center justify-center active:scale-75 transition-all shadow-[0_0_50px_rgba(255,255,255,0.3)] group"
        >
          <div className="w-20 h-20 bg-white rounded-full border-[3px] border-[#1A1C19] group-hover:scale-90 transition-transform" />
        </button>
        <p className="text-white/40 text-[11px] font-black uppercase tracking-[0.4em]">Align contents within the frame</p>
      </div>
    </div>
  );

  const renderScanReview = () => (
    <div className="min-h-screen p-10 bg-[#FDFCF7] flex flex-col page-enter max-w-lg mx-auto">
      <Header title="Identified Stock" />
      <div className="flex-1 space-y-12 overflow-y-auto no-scrollbar mt-8 pb-48">
        <div className="p-10 bg-white rounded-[3.5rem] border border-emerald-50 flex items-center gap-8 shadow-md">
           <div className="w-20 h-20 bg-[#064E3B] rounded-[2rem] flex items-center justify-center text-white shadow-lg">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
           </div>
           <div>
             <p className="text-2xl font-bold text-emerald-900 tracking-tight leading-none">Indexing Complete</p>
             <p className="text-[11px] text-emerald-900/40 font-black uppercase tracking-[0.3em] mt-3">{detectedIngredients.length} Items Detected</p>
           </div>
        </div>

        <div className="space-y-6">
          {detectedIngredients.map((name, i) => (
            <div key={i} className="flex items-center justify-between p-8 bg-white rounded-[2.5rem] border border-emerald-50 shadow-sm transition-all hover:translate-x-1">
              <span className="font-bold text-emerald-900 text-xl capitalize tracking-tight">{name}</span>
              <button 
                onClick={() => { togglePantryItem({ name }); setDetectedIngredients(prev => prev.filter(item => item !== name)); }}
                className="bg-[#064E3B] text-white px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all"
              >
                Add
              </button>
            </div>
          ))}
        </div>
        {detectedIngredients.length === 0 && <IllustrationEmpty />}
      </div>
      <div className="fixed bottom-0 left-0 right-0 p-10 bg-[#FDFCF7]/90 backdrop-blur-2xl border-t border-emerald-50 z-[90] flex justify-center">
        <div className="w-full max-w-lg">
          <Button onClick={() => navigate('PANTRY')}>Finalize Stock</Button>
        </div>
      </div>
    </div>
  );

  // --- Router ---

  return (
    <div className="min-h-screen bg-[#F1F3EF] flex items-center justify-center">
      <div className="w-full max-w-lg bg-white shadow-2xl relative min-h-screen flex flex-col overflow-hidden transition-all duration-700">
        <div className="flex-1 h-full no-scrollbar">
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
    </div>
  );
}
