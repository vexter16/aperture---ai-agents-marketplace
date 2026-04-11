"use client";
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Fact {
  id: string;
  text_claim: string;
  domain: string;
  credibility_score: number;
  latitude: number;
  longitude: number;
  price_usdc: number;
}

interface MapProps {
  onSelectFact: (id: string, claim: string) => void;
}

function getMarkerColor(score: number): string {
  if (score >= 0.7) return '#10b981';
  if (score >= 0.5) return '#f59e0b';
  return '#ef4444';
}

export default function ActualMap({ onSelectFact }: MapProps) {
  const [facts, setFacts] = useState<Fact[]>([]);

  useEffect(() => {
    const fetchFacts = async () => {
      try {
        const res = await fetch(`${API}/facts`);
        const data = await res.json();
        setFacts(data.facts || []);
      } catch (err) {
        console.error("Failed to fetch facts:", err);
      }
    };
    fetchFacts();
    const interval = setInterval(fetchFacts, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <MapContainer 
      center={[12.9716, 77.5946]}
      zoom={11} 
      className="w-full h-full rounded-xl z-0"
      zoomControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      
      {facts.map((fact) => {
        if (!fact.latitude || !fact.longitude) return null;
        const color = getMarkerColor(fact.credibility_score || 0);
        
        return (
          <CircleMarker 
            key={fact.id}
            center={[fact.latitude, fact.longitude]} 
            pathOptions={{ 
              color,
              fillColor: color,
              fillOpacity: 0.5,
              weight: 2,
            }} 
            radius={9}
            eventHandlers={{ click: () => onSelectFact(fact.id, fact.text_claim) }}
          >
            <Popup>
              <div className="text-slate-200 min-w-[180px]">
                <p className="text-xs font-bold text-cyan-400 mb-1">{fact.domain?.toUpperCase()}</p>
                <p className="text-xs mb-2">&quot;{fact.text_claim}&quot;</p>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Score: {((fact.credibility_score || 0) * 100).toFixed(0)}%</span>
                  <span>${fact.price_usdc} USDC</span>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}