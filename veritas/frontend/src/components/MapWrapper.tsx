"use client";
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

const DynamicMap = dynamic(() => import('./ActualMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-500 animate-pulse">
      Initializing Satellite Feed...
    </div>
  ),
});

export default function MapWrapper({ onSelectFact }: { onSelectFact: (id: string, claim: string) => void }) {
  return <DynamicMap onSelectFact={onSelectFact} />;
}