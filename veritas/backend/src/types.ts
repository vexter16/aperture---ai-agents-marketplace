export interface Fact {
  id: string;
  submitter_id: string;
  text_claim: string;
  domain: 'financial' | 'logistics' | 'agricultural';
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  clip_score: number | null;
  stake_amount: number;
  stake_status: 'locked' | 'released' | 'frozen' | 'slashed';
  credibility_score: number | null;
  credibility_mode: 'bootstrap' | 'full';
  embedding: number[] | null;
  dispute_flag: boolean;
  consumed_count: number;
  price_usdc: number;
  submitted_at: string;
}

export interface CredibilitySignals {
  s_rep: number;
  s_stake: number;
  s_geo: number;
  s_temporal: number;
  s_agent: number;
  s_semantic: number;
}