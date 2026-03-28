"use client";
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

// Dynamically import the actual map so it only renders on the client side
const DynamicMap = dynamic(() => import('./ActualMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-500 animate-pulse">
      Initializing Satellite Feed...
    </div>
  ),
});

// Notice how we added the prop here and passed it into DynamicMap
export default function MapWrapper({ onSelectFact }: { onSelectFact: (fact: any) => void }) {
  return <DynamicMap onSelectFact={onSelectFact} />;
}