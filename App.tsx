import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MEDICATIONS, TIME_SLOT_CONFIG, SYMPTOMS, SLOT_HOURS } from './constants';
import { AppState, TimeSlot, HealthReport, AIAnalysisResult } from './types';
import { analyzeHealthStatus } from './services/geminiService';
import { speakText, stopSpeech } from './services/audioService';
import { syncPatientData, requestNotificationPermission, listenForNotifications, listenToPatient } from './services/firebaseService';
import { 
  Heart, 
  Activity, 
  ClipboardList, 
  AlertTriangle, 
  CheckCircle, 
  BrainCircuit, 
  RefreshCw,
  Star,
  History,
  Settings,
  X,
  PlusCircle,
  VolumeX,
  Moon,
  UtensilsCrossed,
  UserPlus,
  Camera,
  Pill,
  Droplets,
  Zap,
  ShieldPlus,
  Thermometer,
  Syringe,
  MapPin,
  Bell,
  BellOff,
  UserCog,
  Copy,
  ChevronLeft,
  Info
} from 'lucide-react';

const PRESET_ICONS = [
  { name: 'Pill', icon: <Pill className="w-6 h-6" /> },
  { name: 'Droplets', icon: <Droplets className="w-6 h-6" /> },
  { name: 'Zap', icon: <Zap className="w-6 h-6" /> },
  { name: 'ShieldPlus', icon: <ShieldPlus className="w-6 h-6" /> },
  { name: 'Thermometer', icon: <Thermometer className="w-6 h-6" /> },
  { name: 'Syringe', icon: <Syringe className="w-6 h-6" /> },
  { name: 'Activity', icon: <Activity className="w-6 h-6" /> },
];

const generateId = () => Math.random().toString(36).substr(2, 6).toUpperCase();

const App: React.FC = () => {
  const [state, setState] = useState<AppState & { customSymptoms: string[] }>(() => {
    const saved = localStorage.getItem('healthTrackData_v12');
    const today = new Date().toISOString().split('T')[0];
    if (saved) {
      const parsed = JSON.parse(saved);
      const baseState = parsed.currentReport.date === today ? parsed : {
        ...parsed,
        dailyReports: { ...parsed.dailyReports, [parsed.currentReport.date]: parsed.currentReport },
        takenMedications: {},
        sentNotifications: [],
        currentReport: {
          date: today, healthRating: 0, painLevel: 0, painLocation: '', sleepQuality: '', appetite: '', symptoms: [], notes: ''
        }
      };
      return {
        ...baseState,
        patientId: baseState.patientId || generateId(),
        customSymptoms: baseState.customSymptoms || [],
        medicationCustomizations: baseState.medicationCustomizations || {},
        notificationsEnabled: baseState.notificationsEnabled ?? false,
        caregiverMode: baseState.caregiverMode ?? false,
        caregiverTargetId: baseState.caregiverTargetId ?? null
      };
    }
    return {
      patientName: "الوالد العزيز",
      patientAge: 65,
      patientId: generateId(),
      caregiverMode: false,
      caregiverTargetId: null,
      takenMedications: {},
      notificationsEnabled: false,
      sentNotifications: [],
      customReminderTimes: {},
      medicationCustomizations: {},
      customSymptoms: [],
      history: [],
      dailyReports: {},
      currentReport: {
        date: today, healthRating: 0, painLevel: 0, painLocation: '', sleepQuality: '', appetite: '', symptoms: [], notes: ''
      }
    };
  });

  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingIconMedId, setEditingIconMedId] = useState<string | null>(null);
  const [newSymptomInput, setNewSymptomInput] = useState("");

  useEffect(() => {
    localStorage.setItem('healthTrackData_v12', JSON.stringify(state));
    if (!state.caregiverMode) {
      syncPatientData(state.patientId, state);
    }
  }, [state]);

  useEffect(() => {
    if (state.caregiverMode && state.caregiverTargetId) {
      const unsubPatient = listenToPatient(state.caregiverTargetId, (data) => {
        if (data) setState(prev => ({ ...prev, ...data, caregiverMode: true, caregiverTargetId: prev.caregiverTargetId }));
      });
      const unsubNotifications = listenForNotifications(state.patientId, (notif) => {
        if (window.Notification && Notification.permission === 'granted') {
          new Notification(notif.title, { body: notif.body });
        }
      });
      return () => { unsubPatient(); unsubNotifications(); };
    }
  }, [state.caregiverMode, state.caregiverTargetId, state.patientId]);

  const toggleMedication = (id: string) => {
    if (state.caregiverMode) return;
    setState(prev => {
      const isTaken = !prev.takenMedications[id];
      const med = MEDICATIONS.find(m => m.id === id);
      const entry = {
        date: new Date().toLocaleDateString('ar-EG'),
        action: isTaken ? '✅ تم التناول' : '🔄 إلغاء التناول',
        details: med?.name || id,
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
      };
      return {
        ...prev,
        takenMedications: { ...prev.takenMedications, [id]: isTaken },
        history: [entry, ...prev.history].slice(0, 50)
      };
    });
  };

  const updateReport = (updates: Partial<HealthReport>) => {
    if (state.caregiverMode) return;
    setState(prev => ({
      ...prev,
      currentReport: { ...prev.currentReport, ...updates }
    }));
  };

  const toggleSymptom = (symptom: string) => {
    if (state.caregiverMode) return;
    const current = state.currentReport.symptoms;
    const next = current.includes(symptom) ? current.filter(s => s !== symptom) : [...current, symptom];
    updateReport({ symptoms: next });
  };

  const handleAddCustomSymptom = () => {
    if (newSymptomInput.trim()) {
      setState(prev => ({
        ...prev,
        customSymptoms: [...prev.customSymptoms, newSymptomInput.trim()]
      }));
      setNewSymptomInput("");
    }
  };

  const setMedicationIcon = (medId: string, iconSource: string) => {
    setState(prev => ({
      ...prev,
      medicationCustomizations: {
        ...prev.medicationCustomizations,
        [medId]: { icon: iconSource }
      }
    }));
    setEditingIconMedId(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, medId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setMedicationIcon(medId, reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const renderMedicationIcon = (medId: string) => {
    const custom = state.medicationCustomizations[medId];
    if (custom?.icon) {
      if (custom.icon.startsWith('data:image')) {
        return <img src={custom.icon} className="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-200" alt="med icon" />;
      }
      const Preset = PRESET_ICONS.find(p => p.name === custom.icon);
      return Preset ? React.cloneElement(Preset.icon as React.ReactElement<any>, { className: "w-8 h-8" }) : <Pill className="w-8 h-8" />;
    }
    return <Pill className="w-8 h-8 opacity-30" />;
  };

  const handleAIAnalysis = async () => {
    setIsAnalyzing(true);
    setAiResult(null);
    try {
      const result = await analyzeHealthStatus(state);
      setAiResult(result);
      if (result.summary) await speakText(result.summary);
    } catch (error) {
      alert("حدث خطأ أثناء تحليل البيانات بالذكاء الاصطناعي.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const allSymptoms = useMemo(() => [...SYMPTOMS, ...state.customSymptoms], [state.customSymptoms]);
  const takenCount = useMemo(() => Object.values(state.takenMedications).filter(Boolean).length, [state.takenMedications]);
  const progress = (takenCount / MEDICATIONS.length) * 100;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-10 space-y-16 pb-40">
      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md transition-all">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl relative max-h-[90vh] overflow-y-auto custom-scrollbar border border-slate-100">
            <button 
              onClick={() => setIsSettingsOpen(false)} 
              className="absolute top-8 left-8 p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="flex items-center gap-4 mb-10 border-b border-slate-100 pb-6">
              <div className="bg-blue-50 p-3 rounded-2xl">
                <Settings className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-3xl font-black text-slate-800">إعدادات النظام</h2>
            </div>

            <div className="space-y-10">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-sm uppercase tracking-wider">
                  <Activity className="w-4 h-4" />
                  <span>المعلومات الأساسية</span>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 mr-2">اسم المريض:</label>
                  <input 
                    type="text" 
                    value={state.patientName} 
                    onChange={(e) => setState(prev => ({ ...prev, patientName: e.target.value }))} 
                    className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-2xl font-black text-slate-700 focus:border-blue-400 focus:bg-white outline-none transition-all" 
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-sm uppercase tracking-wider">
                  <UserPlus className="w-4 h-4" />
                  <span>معرف النظام الخاص بك</span>
                </div>
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex items-center justify-between group">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">شارك هذا الرمز مع مراقبك</p>
                    <span className="text-3xl font-black tracking-[0.2em] text-blue-900">{state.patientId}</span>
                  </div>
                  <button 
                    onClick={() => { 
                      navigator.clipboard.writeText(state.patientId); 
                      alert('تم نسخ المعرف بنجاح'); 
                    }} 
                    className="bg-white hover:bg-blue-600 hover:text-white text-blue-600 p-3 px-6 rounded-2xl shadow-sm font-bold text-sm transition-all flex items-center gap-2 border border-blue-100 active:scale-95"
                  >
                    <Copy className="w-4 h-4" />
                    نسخ الرمز
                  </button>
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-slate-50">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-sm uppercase tracking-wider">
                  <UserCog className="w-4 h-4 text-purple-600" />
                  <span>وضع المراقب (Caregiver)</span>
                </div>
                
                <div className="flex items-center justify-between p-6 bg-purple-50 rounded-3xl border border-purple-100">
                  <div className="space-y-1">
                    <p className="font-black text-purple-900 text-lg">تفعيل المتابعة</p>
                    <p className="text-xs text-purple-600 font-bold">لمتابعة حالة مريض آخر عن بعد</p>
                  </div>
                  <button 
                    onClick={() => setState(prev => ({ ...prev, caregiverMode: !prev.caregiverMode }))}
                    className={`w-14 h-8 rounded-full transition-all relative ${state.caregiverMode ? 'bg-purple-600' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-1.5 w-5 h-5 bg-white rounded-full transition-all ${state.caregiverMode ? 'right-7.5 translate-x-6' : 'right-1.5'}`} />
                  </button>
                </div>

                {state.caregiverMode && (
                  <div className="animate-in slide-in-from-top-4 duration-300 space-y-3">
                    <label className="text-xs font-bold text-slate-400 mr-2">أدخل معرف المريض:</label>
                    <input 
                      type="text" 
                      value={state.caregiverTargetId || ''} 
                      onChange={(e) => setState(prev => ({ ...prev, caregiverTargetId: e.target.value.toUpperCase() }))} 
                      placeholder="مثال: X1Y2Z3"
                      className="w-full p-5 bg-purple-50/30 border-2 border-purple-100 rounded-2xl font-black text-purple-900 placeholder:text-purple-200 focus:border-purple-400 outline-none transition-all uppercase" 
                    />
                  </div>
                )}
              </div>

              <div className="space-y-4 pt-6 border-t border-slate-50">
                <div className="flex items-center gap-2 text-slate-500 font-bold text-sm uppercase tracking-wider">
                  <Bell className="w-4 h-4 text-orange-600" />
                  <span>التنبيهات</span>
                </div>
                
                <div className="flex items-center justify-between p-6 bg-orange-50 rounded-3xl border border-orange-100">
                  <div className="space-y-1">
                    <p className="font-black text-orange-900 text-lg">إشعارات المتصفح</p>
                    <p className="text-xs text-orange-600 font-bold">تنبيهات فورية لتناول الأدوية</p>
                  </div>
                  <button 
                    onClick={async () => {
                      const newValue = !state.notificationsEnabled;
                      if (newValue) {
                        await requestNotificationPermission();
                      }
                      setState(prev => ({ ...prev, notificationsEnabled: newValue }));
                    }}
                    className={`w-14 h-8 rounded-full transition-all relative ${state.notificationsEnabled ? 'bg-orange-600' : 'bg-slate-300'}`}
                  >
                    <div className={`absolute top-1.5 w-5 h-5 bg-white rounded-full transition-all ${state.notificationsEnabled ? 'right-7.5 translate-x-6' : 'right-1.5'}`} />
                  </button>
                </div>
              </div>

              <button 
                onClick={() => setIsSettingsOpen(false)} 
                className="w-full py-6 bg-slate-900 hover:bg-slate-800 text-white rounded-[2rem] font-black text-xl shadow-xl transition-all active:scale-[0.98] mt-6"
              >
                حفظ الإعدادات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Medication Icon Picker Modal */}
      {editingIconMedId && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white w-full max-w-xl rounded-[3rem] p-10 shadow-2xl relative border border-slate-100">
            <button onClick={() => setEditingIconMedId(null)} className="absolute top-8 left-8 p-3 hover:bg-slate-100 rounded-full transition-colors"><X /></button>
            <h2 className="text-2xl font-black text-slate-800 mb-10 flex items-center gap-3">
              <Camera className="text-blue-500" /> تخصيص أيقونة الدواء
            </h2>
            
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-5 mb-10">
              {PRESET_ICONS.map(p => (
                <button 
                  key={p.name} 
                  onClick={() => setMedicationIcon(editingIconMedId, p.name)}
                  className="p-5 bg-slate-50 rounded-3xl border-2 border-transparent hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center justify-center shadow-sm active:scale-90"
                >
                  {p.icon}
                </button>
              ))}
            </div>

            <div className="relative group">
              <label className="flex flex-col items-center justify-center w-full h-44 border-3 border-dashed border-slate-200 rounded-[2.5rem] bg-slate-50 hover:bg-slate-100 hover:border-blue-300 transition-all cursor-pointer">
                <div className="bg-white p-4 rounded-full shadow-md mb-4 group-hover:scale-110 transition-transform">
                   <Camera className="w-8 h-8 text-blue-500" />
                </div>
                <p className="text-lg text-slate-600 font-black">التقاط صورة أو رفع ملف</p>
                <p className="text-xs text-slate-400 font-bold mt-1">يُفضل استخدام صورة واضحة لعلبة الدواء</p>
                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, editingIconMedId)} />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Header Section */}
      <header className="bg-white rounded-[3rem] p-10 md:p-14 shadow-2xl border-b-[16px] border-blue-600 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full -mr-32 -mt-32 opacity-50 group-hover:scale-110 transition-transform duration-700"></div>
        <div className="flex flex-col lg:flex-row items-center justify-between gap-12 relative z-10">
          <div className="text-center lg:text-right space-y-4">
            <h1 className="text-5xl md:text-7xl font-black text-slate-900 flex items-center gap-6 justify-center lg:justify-start">
              <div className="bg-red-500 p-5 rounded-[2rem] shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
                <Heart className="w-14 h-14 text-white fill-white" />
              </div>
              مساعدي الصحي
            </h1>
            <p className="text-slate-500 text-2xl md:text-3xl font-bold flex items-center justify-center lg:justify-start gap-3">
              {state.caregiverMode ? (
                <>
                  <UserCog className="text-purple-500" />
                  تراقب حالة: <span className="text-purple-600 underline decoration-purple-200">{state.patientName}</span>
                </>
              ) : (
                <>مرحباً بك، <span className="text-blue-600">{state.patientName}</span></>
              )}
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full lg:w-auto">
            <QuickStat icon={<Activity className="text-blue-500 w-8 h-8" />} label="الحالة" value={state.currentReport.healthRating > 3 ? "مستقرة" : "تحت المتابعة"} />
            <QuickStat icon={<Star className="text-yellow-500 w-8 h-8" />} label="الإنجاز" value={`${Math.round(progress)}%`} />
            <QuickStat icon={<ClipboardList className="text-purple-500 w-8 h-8" />} label="أدوية" value={`${takenCount}/${MEDICATIONS.length}`} />
            <QuickStat icon={<MapPin className="text-red-500 w-8 h-8" />} label="الألم" value={state.currentReport.painLevel > 0 ? `${state.currentReport.painLevel}/10` : "لا يوجد"} />
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="grid grid-cols-1 xl:grid-cols-12 gap-14">
        {/* Left Column: Medication List */}
        <div className="xl:col-span-7 space-y-12">
          <section className="bg-white rounded-[3.5rem] p-10 md:p-14 shadow-2xl border border-slate-100">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8 mb-16">
              <div className="space-y-2">
                <h2 className="text-4xl font-black text-slate-800 flex items-center gap-4">
                  <ClipboardList className="text-blue-600 w-12 h-12" /> جدول الأدوية
                </h2>
                <p className="text-slate-400 font-bold mr-16">التزم بمواعيدك لصحة أفضل دائماً</p>
              </div>
              <div className="flex flex-col items-center gap-3">
                <div className="w-56 h-6 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-50 relative">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-blue-700 transition-all duration-1000" style={{ width: `${progress}%` }}></div>
                </div>
                <span className="text-sm font-black text-blue-600">اكتمل بنسبة {Math.round(progress)}%</span>
              </div>
            </div>

            <div className="space-y-20">
              {(Object.keys(TIME_SLOT_CONFIG) as TimeSlot[]).map(slot => {
                const meds = MEDICATIONS.filter(m => m.timeSlot === slot);
                if (meds.length === 0) return null;
                const config = TIME_SLOT_CONFIG[slot];
                return (
                  <div key={slot} className="group/slot space-y-8">
                    <div className="flex items-center gap-6">
                      <div className={`p-5 rounded-[1.8rem] text-slate-700 shadow-lg shadow-slate-200/50 transition-transform group-hover/slot:scale-110 duration-500 ${config.color} border-2`}>
                        {config.icon}
                      </div>
                      <h3 className="text-3xl font-black text-slate-800 tracking-tight">{config.label}</h3>
                      <div className="h-px bg-slate-100 flex-1 ml-4"></div>
                    </div>
                    
                    <div className="grid gap-8">
                      {meds.map(med => (
                        <div key={med.id} className={`group relative flex items-center gap-8 p-8 rounded-[2.8rem] border-3 transition-all duration-300 ${state.takenMedications[med.id] ? 'bg-slate-50/80 border-slate-100 opacity-60' : 'bg-white border-white hover:border-blue-100 hover:shadow-xl hover:-translate-y-1'}`}>
                          <button
                            onClick={() => toggleMedication(med.id)}
                            className="flex items-center gap-8 text-right flex-1"
                          >
                            <div className={`w-20 h-20 rounded-[2rem] flex items-center justify-center transition-all duration-500 ${state.takenMedications[med.id] ? 'bg-green-500 text-white shadow-xl shadow-green-200 rotate-12' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 shadow-sm'}`}>
                              {state.takenMedications[med.id] ? <CheckCircle className="w-12 h-12" /> : renderMedicationIcon(med.id)}
                            </div>
                            <div className="flex-1 space-y-1">
                              <p className={`font-black text-3xl leading-tight transition-all ${state.takenMedications[med.id] ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                {med.name}
                              </p>
                              <div className="flex items-center gap-3">
                                <span className={`px-4 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest ${state.takenMedications[med.id] ? 'bg-slate-200 text-slate-400' : 'bg-blue-100 text-blue-600'}`}>
                                  {med.dosage}
                                </span>
                                <p className="text-sm text-slate-400 font-bold truncate max-w-xs">{med.notes}</p>
                              </div>
                            </div>
                          </button>
                          
                          {!state.caregiverMode && (
                            <button 
                              onClick={() => setEditingIconMedId(med.id)}
                              className="p-4 opacity-0 group-hover:opacity-100 bg-slate-50 hover:bg-white text-slate-400 hover:text-blue-500 rounded-2xl transition-all shadow-sm border border-slate-100 active:scale-90"
                              title="تخصيص الأيقونة"
                            >
                              <Camera className="w-7 h-7" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Column: Health Report & Activity */}
        <div className="xl:col-span-5 space-y-12">
          {/* Health Report Section */}
          <section className="bg-white rounded-[3.5rem] p-10 md:p-14 shadow-2xl border-t-[20px] border-indigo-600 space-y-14 sticky top-10">
            <div className="space-y-2">
              <h2 className="text-4xl font-black text-slate-800 flex items-center gap-4">
                <Activity className="text-indigo-600 w-12 h-12" /> التقرير الصحي
              </h2>
              <p className="text-slate-400 font-bold">حدث حالتك ليتمكن الذكاء الاصطناعي من مساعدتك</p>
            </div>
            
            {/* General Feeling */}
            <div className="space-y-6">
              <label className="text-xl font-black text-slate-700 block px-2">كيف تشعر اليوم؟</label>
              <div className="flex justify-between bg-slate-50 p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-inner">
                {[1, 2, 3, 4, 5].map(star => (
                  <button 
                    key={star} 
                    onClick={() => updateReport({ healthRating: star })}
                    className={`p-2 transition-all transform hover:scale-125 duration-300 ${state.currentReport.healthRating >= star ? 'text-yellow-500 filter drop-shadow-lg' : 'text-slate-200'}`}
                  >
                    <Star className={`w-14 h-14 ${state.currentReport.healthRating >= star ? 'fill-yellow-500' : ''}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Pain Tracking Section */}
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                 <label className="text-xl font-black text-slate-700 flex items-center gap-3">
                   <MapPin className="w-7 h-7 text-red-500" /> مستوى الألم
                 </label>
                 <span className={`px-4 py-1 rounded-full text-xs font-black ${state.currentReport.painLevel > 0 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-400'}`}>
                   {state.currentReport.painLevel > 0 ? 'يوجد ألم' : 'لا يوجد ألم'}
                 </span>
              </div>
              <div className="bg-red-50/40 p-10 rounded-[3rem] border-2 border-red-100/50 space-y-10">
                <div className="space-y-6">
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                      <p className="text-3xl font-black text-red-600">{state.currentReport.painLevel}</p>
                      <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">مقياس الشدة 0-10</p>
                    </div>
                    <div className="text-left">
                       <p className="text-xs font-black text-slate-400">حرك المؤشر للتحديد</p>
                    </div>
                  </div>
                  <input 
                    type="range" min="0" max="10" 
                    value={state.currentReport.painLevel} 
                    onChange={(e) => updateReport({ painLevel: parseInt(e.target.value) })}
                    className="w-full h-4 bg-red-100 rounded-full appearance-none cursor-pointer outline-none transition-all"
                  />
                  <div className="flex justify-between text-[11px] font-black text-red-300 px-1 uppercase tracking-tighter">
                    <span>مرتاح</span>
                    <span>ألم محتمل</span>
                    <span>ألم شديد جداً</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <label className="text-sm font-bold text-slate-600 mr-2 flex items-center gap-2">
                    <Info className="w-4 h-4 text-slate-400" /> مكان الألم:
                  </label>
                  <input 
                    type="text"
                    value={state.currentReport.painLocation}
                    onChange={(e) => updateReport({ painLocation: e.target.value })}
                    placeholder="مثل: الركبة، الظهر، الرأس..."
                    className="w-full p-6 bg-white border-2 border-slate-100 rounded-[2rem] font-black text-slate-700 focus:border-red-400 outline-none transition-all placeholder:text-slate-300 text-lg shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Quality Metrics: Sleep & Appetite */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-6">
                <label className="text-lg font-black text-slate-700 flex items-center gap-3 px-2">
                  <Moon className="w-6 h-6 text-indigo-500" /> جودة النوم
                </label>
                <div className="grid gap-3">
                  {([['good', 'جيد جداً'], ['fair', 'مقبول'], ['poor', 'سيء']] as const).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => updateReport({ sleepQuality: id })}
                      className={`group py-5 rounded-[2rem] font-black text-xl border-3 transition-all duration-300 flex items-center justify-center gap-4 ${state.currentReport.sleepQuality === id ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl translate-x-1' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-indigo-200 hover:bg-white'}`}
                    >
                      {label}
                      <CheckCircle className={`w-5 h-5 transition-opacity ${state.currentReport.sleepQuality === id ? 'opacity-100' : 'opacity-0'}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <label className="text-lg font-black text-slate-700 flex items-center gap-3 px-2">
                  <UtensilsCrossed className="w-6 h-6 text-orange-500" /> الشهية
                </label>
                <div className="grid gap-3">
                  {([['good', 'مفتوحة'], ['fair', 'عادية'], ['poor', 'ضعيفة']] as const).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => updateReport({ appetite: id })}
                      className={`group py-5 rounded-[2rem] font-black text-xl border-3 transition-all duration-300 flex items-center justify-center gap-4 ${state.currentReport.appetite === id ? 'bg-orange-500 border-orange-500 text-white shadow-xl translate-x-1' : 'bg-slate-50 border-slate-100 text-slate-500 hover:border-orange-200 hover:bg-white'}`}
                    >
                      {label}
                      <CheckCircle className={`w-5 h-5 transition-opacity ${state.currentReport.appetite === id ? 'opacity-100' : 'opacity-0'}`} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Symptoms Tags */}
            <div className="space-y-6">
              <label className="text-xl font-black text-slate-700 block px-2">هل تشعر بأي أعراض أخرى؟</label>
              <div className="flex flex-wrap gap-4">
                {allSymptoms.map(s => (
                  <button
                    key={s}
                    onClick={() => toggleSymptom(s)}
                    className={`px-7 py-4 rounded-[1.8rem] text-lg font-black border-3 transition-all duration-300 ${state.currentReport.symptoms.includes(s) ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl scale-105' : 'bg-slate-50 border-slate-100 text-slate-500 hover:bg-white hover:border-indigo-200 hover:shadow-md'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex gap-5 mt-4">
                <input 
                  type="text" 
                  value={newSymptomInput}
                  onChange={(e) => setNewSymptomInput(e.target.value)}
                  placeholder="أضف عرضاً آخر..."
                  className="flex-1 p-6 bg-slate-50 border-2 border-slate-100 rounded-[2rem] outline-none focus:border-indigo-400 focus:bg-white text-lg font-black placeholder:text-slate-300 shadow-sm transition-all"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCustomSymptom()}
                />
                <button 
                  onClick={handleAddCustomSymptom} 
                  className="p-6 bg-indigo-100 text-indigo-600 rounded-[2rem] hover:bg-indigo-200 transition-all shadow-md active:scale-90"
                >
                  <PlusCircle className="w-9 h-9" />
                </button>
              </div>
            </div>

            {/* AI Analysis Interaction */}
            <div className="pt-12 border-t border-slate-100">
              <button 
                onClick={handleAIAnalysis} 
                disabled={isAnalyzing}
                className="w-full py-8 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white rounded-[2.5rem] font-black text-3xl shadow-2xl shadow-indigo-200 flex items-center justify-center gap-6 disabled:opacity-50 hover:scale-[1.03] active:scale-95 transition-all group"
              >
                {isAnalyzing ? (
                  <RefreshCw className="w-10 h-10 animate-spin" />
                ) : (
                  <BrainCircuit className="w-10 h-10 group-hover:rotate-12 transition-transform" />
                )}
                ابدأ التحليل الذكي
              </button>
            </div>

            {aiResult && (
              <div className="bg-slate-900 rounded-[3rem] p-10 text-white space-y-12 animate-in fade-in slide-in-from-top-10 duration-700 shadow-2xl relative overflow-hidden">
                 <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500"></div>
                 <div className="space-y-4">
                   <p className="text-sm font-black text-blue-400 uppercase tracking-[0.2em] flex items-center gap-2">
                     <BrainCircuit className="w-4 h-4" /> تقرير الذكاء الاصطناعي
                   </p>
                   <p className="text-2xl leading-relaxed font-bold border-b border-white/10 pb-10">{aiResult.summary}</p>
                 </div>
                 
                 <div className="grid gap-10">
                    <AISection title="توصيات الخبراء" items={aiResult.recommendations} icon={<CheckCircle className="text-green-400 w-8 h-8" />} />
                    {aiResult.warnings.length > 0 && (
                      <AISection title="تنبيهات عاجلة" items={aiResult.warnings} icon={<AlertTriangle className="text-red-400 w-8 h-8" />} variant="danger" />
                    )}
                    <AISection title="مؤشرات إيجابية" items={aiResult.positivePoints} icon={<Star className="text-yellow-400 w-8 h-8" />} />
                 </div>
              </div>
            )}
          </section>

          {/* Recent Activity Log */}
          <section className="bg-white rounded-[3.5rem] p-10 md:p-14 shadow-2xl border border-slate-50 group">
            <h2 className="text-2xl font-black text-slate-800 flex items-center gap-4 mb-12">
              <History className="text-slate-300 w-9 h-9 group-hover:rotate-[-45deg] transition-transform duration-500" /> 
              سجل النشاط اليومي
            </h2>
            <div className="space-y-8 max-h-[40rem] overflow-y-auto px-4 custom-scrollbar">
              {state.history.length > 0 ? state.history.map((h, i) => (
                <div key={i} className="flex items-center justify-between p-7 bg-slate-50 rounded-[2.2rem] border-2 border-slate-100 group/item hover:bg-white hover:border-blue-200 transition-all duration-300 shadow-sm">
                  <div className="text-right space-y-1">
                    <p className="font-black text-slate-800 text-xl">{h.action}</p>
                    <p className="text-sm text-slate-400 font-bold">{h.details}</p>
                  </div>
                  <div className="text-left">
                    <div className="bg-blue-50 text-blue-600 px-4 py-2 rounded-2xl text-sm font-black border border-blue-100">
                      {h.timestamp}
                    </div>
                  </div>
                </div>
              )) : (
                <div className="py-20 text-center space-y-4">
                  <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <Activity className="text-slate-200 w-12 h-12" />
                  </div>
                  <p className="text-slate-300 font-black text-2xl">لا يوجد نشاط مسجل حتى الآن</p>
                  <p className="text-slate-200 font-bold">بادر بتناول أدويتك وتحديث حالتك</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Modern Floating Footer */}
      <footer className="fixed bottom-10 left-1/2 -translate-x-1/2 w-[92%] max-w-3xl bg-white/95 backdrop-blur-3xl border-3 border-slate-200/50 p-6 rounded-[4rem] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] z-[100] flex justify-around items-center transition-transform hover:scale-[1.01]">
          <FooterBtn onClick={() => setIsSettingsOpen(true)} icon={<Settings className="w-8 h-8" />} label="الإعدادات" color="text-slate-500 hover:text-blue-600" />
          <FooterBtn onClick={() => stopSpeech()} icon={<VolumeX className="w-8 h-8" />} label="إسكات" color="text-red-500 hover:bg-red-50" />
          
          <div className="h-14 w-px bg-slate-200 mx-4"></div>
          
          {state.caregiverMode ? (
            <FooterBtn 
              onClick={() => setState(prev => ({ ...prev, caregiverMode: false, caregiverTargetId: null }))} 
              icon={<ChevronLeft className="w-8 h-8" />} 
              label="العودة لنفسي" 
              color="text-purple-600 hover:bg-purple-50" 
            />
          ) : (
            <FooterBtn 
              onClick={() => { if(confirm('هل تريد مسح بيانات اليوم والبدء من جديد؟')) window.location.reload(); }} 
              icon={<RefreshCw className="w-8 h-8" />} 
              label="يوم جديد" 
              color="text-green-600 hover:bg-green-50" 
            />
          )}
      </footer>
    </div>
  );
};

// Internal Components with enhanced UI
const QuickStat: React.FC<{ icon: React.ReactNode, label: string, value: string }> = ({ icon, label, value }) => (
  <div className="bg-white p-7 rounded-[2.5rem] border-2 border-slate-100 shadow-xl flex flex-col items-center justify-center text-center transform transition-all duration-500 hover:scale-105 hover:shadow-blue-100/50">
    <div className="mb-4 scale-125 filter drop-shadow-md">{icon}</div>
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{label}</p>
    <p className="text-lg font-black text-slate-900 truncate w-full">{value}</p>
  </div>
);

const AISection: React.FC<{ title: string, items: string[], icon: React.ReactNode, variant?: 'normal' | 'danger' }> = ({ title, items, icon, variant = 'normal' }) => (
  <div className={`p-10 rounded-[3rem] border-3 transition-all duration-500 ${variant === 'danger' ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}>
    <div className="flex items-center gap-6 mb-8">
       <div className="bg-white/10 p-3 rounded-2xl shadow-inner">{icon}</div>
       <h4 className="font-black text-2xl tracking-tight">{title}</h4>
    </div>
    <ul className="space-y-6">
      {items.map((it, i) => (
        <li key={i} className="text-xl opacity-90 leading-relaxed font-medium flex gap-5 group/li">
          <span className="text-blue-400 group-hover/li:scale-125 transition-transform">•</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  </div>
);

const FooterBtn: React.FC<{ onClick: () => void, icon: React.ReactNode, label: string, color: string }> = ({ onClick, icon, label, color }) => (
  <button 
    onClick={onClick} 
    className={`flex flex-col items-center gap-2 p-4 px-10 rounded-[2.5rem] transition-all duration-300 group active:scale-90 ${color}`}
  >
    <div className="group-hover:scale-125 transition-transform duration-300 group-hover:rotate-3">{icon}</div>
    <span className="text-xs font-black uppercase tracking-widest">{label}</span>
  </button>
);

export default App;