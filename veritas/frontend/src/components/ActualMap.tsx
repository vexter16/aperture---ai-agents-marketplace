"use client";
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';

export default function ActualMap({ onSelectFact }: { onSelectFact: (fact: any) => void }) {
  const [facts, setFacts] = useState([]);

  useEffect(() => {
    const fetchFacts = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/facts`);
        const data = await res.json();
        setFacts(data.facts || []);
      } catch (err) {
        console.error("Failed to fetch facts:", err);
      }
    };
    fetchFacts();
    // Poll every 5 seconds for new intelligence
    const interval = setInterval(fetchFacts, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <MapContainer 
      center={[12.9716, 77.5946]} // Default to Bengaluru
      zoom={11} 
      className="w-full h-full rounded-xl z-0"
      zoomControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      
      {facts.map((fact: any) => (
        <CircleMarker 
          key={fact.id}
          center={[fact.latitude || 12.935, fact.longitude || 77.624]} 
          pathOptions={{ 
            color: fact.credibility_score > 0.7 ? '#10b981' : '#f59e0b', 
            fillColor: fact.credibility_score > 0.7 ? '#10b981' : '#f59e0b', 
            fillOpacity: 0.6 
          }} 
          radius={10}
          eventHandlers={{
            click: () => onSelectFact(fact),
          }}
        >
          <Popup className="text-slate-900">
            <strong className="block text-sm">Fact ID: {fact.id.substring(0,8)}</strong>
            <p className="text-xs mt-1">"{fact.text_claim}"</p>
            <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-tighter">Click to inspect credibility</p>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}