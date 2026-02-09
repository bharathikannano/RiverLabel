import React, { useState, useMemo, useDeferredValue } from 'react';
import { SAMPLE_RIVERS } from './constants';
import { calculateLabelPlacement } from './services/labelingEngine';
import RiverVisualizer from './components/RiverVisualizer';
import { Info, Settings, Map as MapIcon, RotateCcw, Layout, Maximize2, Type, Activity } from 'lucide-react';
import { LabelBounds } from './types';

const App: React.FC = () => {
  const [selectedRiverId, setSelectedRiverId] = useState('meander'); 
  const [showCandidates, setShowCandidates] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [curveTension, setCurveTension] = useState(0.8);
  
  // Defer heavy calculation parameters to keep UI responsive
  const deferredFontSize = useDeferredValue(fontSize);
  const deferredTension = useDeferredValue(curveTension);
  const isStale = fontSize !== deferredFontSize || curveTension !== deferredTension;

  const currentRiver = useMemo(() => 
    SAMPLE_RIVERS.find(r => r.id === selectedRiverId) || SAMPLE_RIVERS[0]
  , [selectedRiverId]);

  const existingLabels: LabelBounds[] = [];

  const result = useMemo(() => 
    calculateLabelPlacement(currentRiver.polygon, currentRiver.label, deferredFontSize, deferredTension, existingLabels)
  , [currentRiver, deferredFontSize, deferredTension]);

  // Robust formatting for stats to prevent 'undefined' display
  const clearanceVal = useMemo(() => {
    if (result.placed && typeof result.placed.clearance === 'number') {
      return `${result.placed.clearance.toFixed(1)} px`;
    }
    return '0.0 px';
  }, [result.placed]);

  const orientationVal = useMemo(() => {
    if (result.placed && typeof result.placed.angle === 'number') {
      const deg = Math.abs((result.placed.angle * 180) / Math.PI) % 360;
      return `${deg.toFixed(0)}°`;
    }
    return '0°';
  }, [result.placed]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between z-50 sticky top-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg shadow-sm">
            <Layout className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-xl tracking-tight text-slate-900 flex items-center gap-1">
              RiverLabel <span className="text-blue-600 font-bold uppercase tracking-tight">PRO</span>
            </h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest leading-none mt-0.5">Advanced Label Placement Engine</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button className="text-slate-400 hover:text-slate-600 transition-colors">
            <Info className="w-5 h-5" />
          </button>
          <button className="bg-[#1e293b] text-white px-6 py-2.5 rounded-lg text-sm font-bold border border-slate-700 hover:bg-slate-800 transition-all shadow-md active:scale-95">
            Documentation
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full p-8 space-y-6">
        
        {/* Reset Bar */}
        <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200">
          <button 
            onClick={() => { setShowCandidates(false); setFontSize(16); setCurveTension(0.8); }}
            className="w-full flex items-center justify-center gap-2 py-2 text-slate-500 text-sm font-bold hover:bg-slate-50 transition-colors rounded-xl"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Engine
          </button>
        </div>

        {/* Algorithm Note with Glow */}
        <div className="relative group">
          <div className="absolute -inset-1 bg-blue-600 rounded-2xl blur-xl opacity-30 group-hover:opacity-50 transition duration-1000"></div>
          <div className="relative bg-blue-600 text-white p-6 rounded-2xl border border-blue-400 shadow-2xl overflow-hidden">
             <div className="absolute -top-10 -right-10 opacity-10 pointer-events-none">
               <Activity className="w-48 h-48" />
             </div>
             <h3 className="font-bold text-xl mb-2 relative z-10">Algorithm Note</h3>
             <p className="text-blue-50 text-sm leading-relaxed max-w-4xl relative z-10 font-medium">
               The engine uses <strong>Spine Tracing</strong> with <strong>Curvature Rejection</strong>. It evaluates potential locations not just by clearance, but by local angular deviation, ensuring text stays legible even in complex high-resolution geometries.
             </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Visualization Area */}
          <section className="lg:col-span-8 space-y-6">
            <div className={`bg-[#0c121e] p-1 rounded-3xl shadow-2xl border border-slate-800 overflow-hidden ring-1 ring-slate-800/50 transition-opacity duration-200 ${isStale ? 'opacity-70' : 'opacity-100'}`}>
              <RiverVisualizer 
                river={currentRiver} 
                result={result} 
                showCandidates={showCandidates} 
                fontSize={deferredFontSize}
              />
            </div>

            {/* Analysis Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm group hover:border-blue-200 transition-colors">
                <div className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                  <Maximize2 className="w-3 h-3 text-blue-500" />
                  Clearance Score
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight">{clearanceVal}</div>
              </div>
              
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm group hover:border-blue-200 transition-colors">
                <div className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                  <RotateCcw className="w-3 h-3 text-indigo-500" />
                  Orientation
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight">{orientationVal}</div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm group hover:border-blue-200 transition-colors">
                <div className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                  <Activity className="w-3 h-3 text-green-500" />
                  Candidate Count
                </div>
                <div className="text-3xl font-black text-slate-900 tracking-tight">{result.candidates.length}</div>
              </div>
            </div>
          </section>

          {/* Controls Sidebar */}
          <aside className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-5 flex items-center gap-2">
                <MapIcon className="w-4 h-4 text-blue-500" /> Geometry Input
              </h2>
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                {SAMPLE_RIVERS.map((river) => (
                  <button
                    key={river.id}
                    onClick={() => setSelectedRiverId(river.id)}
                    className={`w-full text-left px-5 py-4 rounded-2xl border transition-all duration-200 ${
                      selectedRiverId === river.id 
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg translate-x-1' 
                        : 'bg-white border-slate-100 hover:border-slate-200 text-slate-900'
                    }`}
                  >
                    <div className={`font-bold ${selectedRiverId === river.id ? 'text-white' : 'text-slate-900'}`}>{river.name}</div>
                    <div className={`text-[10px] mt-1 font-bold uppercase tracking-widest ${selectedRiverId === river.id ? 'text-blue-100' : 'text-slate-400'}`}>
                      Label: <span className={selectedRiverId === river.id ? 'text-white' : 'text-blue-600'}>{river.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-6 flex items-center gap-2">
                <Settings className="w-4 h-4 text-indigo-500" /> Placement Engine
              </h2>
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Font Size</span>
                    <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md">{fontSize}px</span>
                  </div>
                  <input 
                    type="range" min="8" max="48" step="1" 
                    value={fontSize} 
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Curve Tension</span>
                    <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md">{(curveTension * 100).toFixed(0)}%</span>
                  </div>
                  <input 
                    type="range" min="0" max="1" step="0.05" 
                    value={curveTension} 
                    onChange={(e) => setCurveTension(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <label className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50 cursor-pointer hover:border-slate-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <Type className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Visualize Search Candidates</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={showCandidates} 
                    onChange={(e) => setShowCandidates(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </label>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default App;