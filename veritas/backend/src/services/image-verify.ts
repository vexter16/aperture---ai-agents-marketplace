/**
 * Multimodal Evidence Verification Service
 * 
 * Uses Gemini 2.5 Flash multimodal API to intelligently verify whether
 * a submitted image matches the text claim, domain, and geographic location.
 * 
 * Three verification vectors:
 *   1. TEXT COHERENCE  — Does the image support the text claim?
 *   2. DOMAIN MATCH    — Does the image fit the intelligence domain?
 *   3. LOCATION MATCH  — Do visual features match the submitted lat/lon?
 * 
 * Location verification modes (automatic selection):
 *   - 360° STREET VIEW: Fetches 4 panoramic angles (N/E/S/W) from Google
 *     Street View and asks Gemini to compare the user's photo against all
 *     four directions. Solves the "wrong direction" problem.
 *   - ZERO-SHOT FALLBACK: When Street View has no coverage (rural, indoor,
 *     ocean, etc.), Gemini uses its own geographic knowledge to evaluate
 *     whether the image's visual features are plausible for the coordinates.
 * 
 * Edge case handling:
 *   - Indoor/close-up photos are detected and location check is made lenient
 *   - Night photos vs daytime Street View are handled gracefully
 *   - Temporal differences (new buildings vs old SV data) are accounted for
 *   - All failures are "fail-open" — API errors never block submissions
 * 
 * Token-saving optimizations:
 *   1. Images are resized to max 512px before base64 encoding
 *   2. Street View images are fetched at 400x300 (small but sufficient)
 *   3. All 4 SV requests run in parallel (Promise.all) for speed
 *   4. Response is constrained to JSON-only output
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Ordered list of models to try. If the primary is rate-limited (429),
// we automatically fall back to the next one. Each model has its own
// separate quota, effectively multiplying your free-tier capacity.
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-flash-latest',
];

function getGeminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

// Max dimension (width or height) for the image before sending to Gemini.
// 512px is more than enough for semantic understanding and saves ~75% tokens
// compared to a full-resolution phone photo.
const MAX_IMAGE_DIMENSION = 512;

// Street View image dimensions (small to save bandwidth & Gemini tokens)
const STREET_VIEW_SIZE = '400x300';

// The 4 cardinal directions for 360° coverage
const STREET_VIEW_HEADINGS = [
  { heading: 0,   label: 'North' },
  { heading: 90,  label: 'East'  },
  { heading: 180, label: 'South' },
  { heading: 270, label: 'West'  },
];

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface CoherenceResult {
  coherent: boolean;       // Overall pass/fail
  confidence: number;      // 0.0 to 1.0
  reasoning: string;       // Brief explanation of the verdict
  text_match: boolean;     // Does the image match the text claim?
  domain_match: boolean;   // Does the image fit the domain?
  location_plausible: boolean; // Do visual features match the coordinates?
  verification_mode: 'streetview-360' | 'zero-shot' | 'skipped'; // Which location method was used
  // Transparency fields (for frontend Verification Viewer)
  streetViewUrls?: string[];     // Public Google Maps Static API URLs for the 4 SV directions
  geminiReasoning?: string;      // The full reasoning text from Gemini
  geminiModel?: string;          // Which model was used (e.g. 'gemini-2.5-flash')
  latencyMs?: number;            // API call latency in milliseconds
}

interface StreetViewImage {
  base64: string;
  mimeType: string;
  heading: number;
  label: string;
}

// ─────────────────────────────────────────────
// IMAGE OPTIMIZATION (Token Saving)
// ─────────────────────────────────────────────

/**
 * Resize an image to a maximum dimension using macOS `sips` (no dependencies needed).
 * Falls back to the original image if resizing fails.
 * Returns the path to the (possibly resized) image.
 */
function resizeImageForVerification(imagePath: string): string {
  const ext = path.extname(imagePath).toLowerCase();
  
  // Only process common image formats
  if (!['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(ext)) {
    return imagePath;
  }

  const resizedPath = imagePath.replace(/(\.[^.]+)$/, `-resized$1`);

  try {
    // Copy original to resized path first
    fs.copyFileSync(imagePath, resizedPath);
    
    // Use macOS sips to resize (zero dependencies, built into every Mac)
    // --resampleHeightWidthMax resizes the longest edge to MAX_IMAGE_DIMENSION
    // while preserving aspect ratio
    execSync(
      `sips --resampleHeightWidthMax ${MAX_IMAGE_DIMENSION} "${resizedPath}" 2>/dev/null`,
      { stdio: 'pipe' }
    );

    const originalSize = fs.statSync(imagePath).size;
    const resizedSize = fs.statSync(resizedPath).size;
    const savings = ((1 - resizedSize / originalSize) * 100).toFixed(0);
    
    console.log(`📐 [ImageVerify] Resized: ${(originalSize/1024).toFixed(0)}KB → ${(resizedSize/1024).toFixed(0)}KB (${savings}% smaller)`);
    
    return resizedPath;
  } catch (err) {
    // If sips fails (e.g., on Linux), use the original image
    console.warn('⚠️ [ImageVerify] Image resize failed, using original:', err);
    // Clean up failed resize attempt
    try { fs.unlinkSync(resizedPath); } catch {}
    return imagePath;
  }
}

/**
 * Clean up resized temporary image after verification.
 */
function cleanupResizedImage(originalPath: string, usedPath: string): void {
  if (usedPath !== originalPath) {
    try { fs.unlinkSync(usedPath); } catch {}
  }
}

// ─────────────────────────────────────────────
// GOOGLE STREET VIEW — 360° PANORAMIC FETCH
// ─────────────────────────────────────────────

/**
 * Check if Google Street View has coverage at the given coordinates.
 * Uses the metadata endpoint which is FREE (not billed by Google).
 * Returns true if coverage exists, false otherwise.
 */
async function checkStreetViewCoverage(
  latitude: number,
  longitude: number
): Promise<boolean> {
  if (!GOOGLE_MAPS_API_KEY) {
    return false;
  }

  try {
    const metadataUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
    const metaResponse = await fetch(metadataUrl);
    const metaData = await metaResponse.json() as any;
    return metaData.status === 'OK';
  } catch {
    return false;
  }
}

/**
 * Fetch a single Street View image at a given heading.
 * Returns the image data or null on failure.
 */
async function fetchSingleStreetView(
  latitude: number,
  longitude: number,
  heading: number,
  label: string
): Promise<StreetViewImage | null> {
  try {
    const imageUrl = `https://maps.googleapis.com/maps/api/streetview?size=${STREET_VIEW_SIZE}&location=${latitude},${longitude}&fov=90&heading=${heading}&pitch=0&key=${GOOGLE_MAPS_API_KEY}`;
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      console.warn(`⚠️ [StreetView] ${label} image fetch failed: HTTP ${imageResponse.status}`);
      return null;
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return { base64, mimeType: 'image/jpeg', heading, label };
  } catch (err: any) {
    console.warn(`⚠️ [StreetView] ${label} fetch error: ${err.message}`);
    return null;
  }
}

/**
 * Fetch 360° Street View panorama (4 cardinal directions) in parallel.
 * 
 * Process:
 *   1. Check metadata first (FREE — prevents wasting billed requests)
 *   2. If coverage exists, download 4 images at 0°, 90°, 180°, 270° simultaneously
 *   3. Filter out any failed downloads
 *   4. Return the successfully downloaded images
 * 
 * Returns an array of StreetViewImage objects, or empty array if no coverage.
 * Uses Promise.all for parallel downloads — same speed as a single image.
 */
async function fetch360StreetView(
  latitude: number,
  longitude: number
): Promise<StreetViewImage[]> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.log('📍 [StreetView] No GOOGLE_MAPS_API_KEY set — skipping Street View');
    return [];
  }

  try {
    // Step 1: Check metadata first (FREE — not billed by Google)
    const hasCoverage = await checkStreetViewCoverage(latitude, longitude);
    if (!hasCoverage) {
      console.log(`📍 [StreetView] No coverage at (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) — falling back to zero-shot`);
      return [];
    }

    console.log(`📍 [StreetView] Coverage found at (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) — fetching 360° panorama...`);

    // Step 2: Download all 4 directions in parallel (same speed as 1 image)
    const startTime = Date.now();
    const promises = STREET_VIEW_HEADINGS.map(({ heading, label }) =>
      fetchSingleStreetView(latitude, longitude, heading, label)
    );

    const results = await Promise.all(promises);
    
    // Step 3: Filter out any failed downloads
    const successfulImages = results.filter((img): img is StreetViewImage => img !== null);
    
    const elapsed = Date.now() - startTime;
    const totalSizeKB = successfulImages.reduce((sum, img) => 
      sum + Buffer.from(img.base64, 'base64').length / 1024, 0
    ).toFixed(0);
    
    console.log(`📍 [StreetView] Downloaded ${successfulImages.length}/4 images (${totalSizeKB}KB total, ${elapsed}ms)`);
    console.log(`   🧭 Directions: ${successfulImages.map(i => i.label).join(', ')}`);

    return successfulImages;
  } catch (err: any) {
    console.warn(`⚠️ [StreetView] 360° fetch failed: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────
// GEMINI MULTIMODAL VERIFICATION
// ─────────────────────────────────────────────

/**
 * Build the Gemini prompt and image parts for verification.
 * 
 * Two modes:
 *   A) WITH 360° Street View  → Compare user photo against 4 directional panoramas
 *   B) WITHOUT Street View    → Zero-shot spatial reasoning from visual cues
 * 
 * Edge cases handled in prompt:
 *   - Indoor/close-up photos: AI is instructed to detect and be lenient
 *   - Night photos vs daytime SV: Temporal visual differences acknowledged
 *   - Construction/demolition: New structures vs old SV data
 *   - Weather differences: Rain/fog/snow vs clear SV images
 */
function buildVerificationRequest(
  base64Image: string,
  mimeType: string,
  textClaim: string,
  domain: string,
  latitude: number,
  longitude: number,
  streetViewImages: StreetViewImage[]
): any {
  const locationContext = `Latitude: ${latitude.toFixed(5)}, Longitude: ${longitude.toFixed(5)}`;
  
  // Build image parts array — user's image is always first
  const imageParts: any[] = [
    {
      inlineData: {
        mimeType,
        data: base64Image
      }
    }
  ];

  let locationInstruction: string;

  if (streetViewImages.length > 0) {
    // ── MODE A: 360° Street View Comparison ──
    // Add all Street View images after the user's image
    for (const svImage of streetViewImages) {
      imageParts.push({
        inlineData: {
          mimeType: svImage.mimeType,
          data: svImage.base64
        }
      });
    }

    const directionList = streetViewImages.map(i => i.label).join(', ');
    const imageCount = streetViewImages.length;

    locationInstruction = `3. LOCATION MATCH: The FIRST image is the user's submitted photo. The next ${imageCount} images are Google Street View panoramas captured at the submitted coordinates (${locationContext}), facing: ${directionList}. 
   
   Compare the user's photo against ALL ${imageCount} Street View angles. The user's photo only needs to match ANY ONE of the ${imageCount} directions — they could be facing any way.
   
   Look for: matching buildings, road types, terrain, vegetation, signage, architectural style, infrastructure, urban/rural character, and general environment.

   CRITICAL EDGE CASES — handle these gracefully:
   a) INDOOR/CLOSE-UP PHOTOS: If the user's photo appears to be taken INDOORS (inside a building, warehouse, factory, office) or is a CLOSE-UP of an object (equipment, damage, document, screen), then Street View CANNOT verify location because Street View only shows outdoor street-level views. In this case, set "location_plausible" to TRUE and note in reasoning that the photo appears to be indoor/close-up so street-level comparison is not applicable.
   b) NIGHT vs DAY: If the user's photo is taken at night/dusk/dawn but Street View is daytime (or vice versa), focus on permanent structures (buildings, roads, terrain shape) rather than lighting, sky color, or shadows.
   c) WEATHER DIFFERENCES: The user's photo may show rain, fog, snow, or overcast skies while Street View shows clear weather. Ignore weather and focus on permanent features.
   d) TEMPORAL CHANGES: Street View data may be months or years old. New construction, demolished buildings, changed signage, or seasonal vegetation changes should NOT cause a rejection. Only reject if the fundamental geography/terrain is wrong (e.g., mountains vs flat desert).
   e) DIFFERENT ZOOM/ANGLE: The user may be photographing something from very close or from an elevated/lowered position compared to Street View's car-mounted camera. Focus on background context, not exact perspective match.`;
  } else {
    // ── MODE B: Zero-Shot Spatial Reasoning ──
    // No Street View available — Gemini uses its own geographic knowledge.
    locationInstruction = `3. LOCATION PLAUSIBILITY: The user claims this photo was taken at ${locationContext}. Based on your geographic knowledge, assess whether the visual features in the image are plausible for that region of the world.

   Look for: terrain type, climate indicators, architectural style, vegetation, road markings, signage language/script, vehicle types, urban vs rural character.

   CRITICAL EDGE CASES — handle these gracefully:
   a) INDOOR/CLOSE-UP PHOTOS: If the photo is taken indoors or is a close-up of an object, you CANNOT determine location from the image alone. Set "location_plausible" to TRUE and note that indoor/close-up photos cannot be geographically verified.
   b) GENERIC SCENES: If the photo shows something that could exist anywhere (e.g., a computer screen, a document, a generic office), set "location_plausible" to TRUE — don't reject just because the scene is not geographically distinctive.
   c) Be reasonable — only reject when there is an OBVIOUS mismatch (e.g., a snowy mountain photo with coordinates in the Sahara Desert, or tropical palm trees with coordinates in Scandinavia).`;
  }

  const prompt = `You are an evidence verification system for the "${domain}" intelligence domain.

Analyze this submitted evidence across THREE dimensions:

1. TEXT COHERENCE (STRICT — this is the most important check): Does the image reasonably support the following claim? The image MUST be semantically related to the claim.
   CLAIM: "${textClaim}"
   
   CRITICAL: If the image is COMPLETELY UNRELATED to the claim, you MUST set "text_match" to false with HIGH confidence (>0.85). Examples of CLEAR mismatches that MUST be rejected:
   - Claim mentions "fire" but image shows a laptop, desk, or any non-fire scene
   - Claim mentions "flood" but image shows a sunny park
   - Claim mentions "crop failure" but image shows a shopping mall
   - Claim mentions infrastructure damage but image shows a pet or food
   The image does not need to be a perfect literal match, but it MUST be plausible evidence for the claim. A photo of a laptop is NOT evidence of a fire. A photo of a library is NOT evidence of a flood.

2. DOMAIN MATCH: Does this image make sense as evidence for the "${domain}" intelligence domain? 
   Examples of VALID matches: damaged roads → infrastructure, dried crops → agricultural, shipping containers → logistics, oil rig → energy, stock chart → financial.
   Examples of INVALID matches: a selfie at a restaurant → energy, a pet photo → infrastructure.
   Be reasonable about borderline cases — real-world evidence is messy.

${locationInstruction}

Respond with ONLY this JSON (no markdown, no code fences):
{"text_match": true/false, "domain_match": true/false, "location_plausible": true/false, "overall_coherent": true/false, "confidence": 0.0-1.0, "reasoning": "one sentence explaining the verdict, mentioning any edge cases detected (indoor, night, close-up, etc.)"}

RULES:
- "overall_coherent" should be true ONLY if ALL THREE checks pass.
- If any single check fails, set "overall_coherent" to false.
- TEXT COHERENCE is a HARD CHECK: if the image is clearly unrelated to the claim, reject with confidence > 0.85. Do NOT give the benefit of the doubt for obviously irrelevant images.
- For DOMAIN and LOCATION checks: when in doubt, PASS. It is far worse to reject legitimate evidence than to accept borderline evidence.
- Be intelligent and contextual — not overly strict or literal on domain and location, but BE STRICT on text coherence.`;

  return {
    contents: [{
      parts: [
        { text: prompt },
        ...imageParts
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          text_match: { type: "BOOLEAN" },
          domain_match: { type: "BOOLEAN" },
          location_plausible: { type: "BOOLEAN" },
          overall_coherent: { type: "BOOLEAN" },
          confidence: { type: "NUMBER" },
          reasoning: { type: "STRING" }
        },
        required: ["text_match", "domain_match", "location_plausible", "overall_coherent", "confidence", "reasoning"]
      }
    }
  };
}

/**
 * Verify whether an image matches the text claim, domain, and location.
 * 
 * Uses Gemini 2.5 Flash's multimodal understanding to perform
 * intelligent (not literal) matching across three vectors:
 *   ✅ TEXT:     "Crop failure in region" + photo of dried-out farmland
 *   ✅ DOMAIN:   "infrastructure" + photo of a collapsed bridge
 *   ✅ LOCATION: Photo of tropical vegetation + coordinates in Kerala, India
 *   ❌ TEXT:     "Oil pipeline leak" + photo of a cat
 *   ❌ DOMAIN:   "energy" + selfie at a restaurant  
 *   ❌ LOCATION: Photo of snowy mountains + coordinates in the Sahara
 * 
 * Edge cases that are handled gracefully (pass, not reject):
 *   📷 Indoor/close-up photos → location check auto-passes
 *   🌙 Night photos vs daytime Street View → focus on structures only
 *   🏗️ New construction vs old SV data → only reject if terrain is wrong
 *   🌧️ Weather differences → ignored, focus on permanent features
 *   🔍 Close-up/macro shots → location check auto-passes
 */
export async function verifyImageTextCoherence(
  imagePath: string,
  textClaim: string,
  domain: string,
  latitude?: number,
  longitude?: number
): Promise<CoherenceResult> {
  // Default result for skip cases
  const skipResult: CoherenceResult = {
    coherent: true, confidence: 0, reasoning: 'Verification skipped',
    text_match: true, domain_match: true, location_plausible: true,
    verification_mode: 'skipped',
    streetViewUrls: [], geminiReasoning: undefined, geminiModel: undefined, latencyMs: undefined
  };

  // Guard: No API key configured
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your-gemini-key') {
    console.warn('⚠️ [ImageVerify] GEMINI_API_KEY not set — skipping image verification');
    skipResult.reasoning = 'Verification skipped (API key not configured)';
    return skipResult;
  }

  // Guard: Image file doesn't exist
  if (!fs.existsSync(imagePath)) {
    console.warn(`⚠️ [ImageVerify] Image file not found: ${imagePath}`);
    skipResult.reasoning = 'Verification skipped (image file not found)';
    return skipResult;
  }

  // Default lat/lon to 0,0 if not provided (location check will be lenient)
  const lat = latitude ?? 0;
  const lon = longitude ?? 0;
  const hasCoordinates = latitude !== undefined && longitude !== undefined && 
                          !(latitude === 0 && longitude === 0);

  // Step 1: Resize user's image to save tokens
  const optimizedPath = resizeImageForVerification(imagePath);

  try {
    // Step 2: Read image as base64
    const imageBuffer = fs.readFileSync(optimizedPath);
    const base64Image = imageBuffer.toString('base64');
    
    // Detect MIME type from extension
    const ext = path.extname(optimizedPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.webp': 'image/webp',
      '.heic': 'image/heic',
    };
    const mimeType = mimeMap[ext] || 'image/jpeg';

    // Step 3: Attempt to fetch 360° Street View panorama
    let streetViewImages: StreetViewImage[] = [];
    let verificationMode: 'streetview-360' | 'zero-shot' | 'skipped' = 'zero-shot';
    let streetViewUrls: string[] = [];

    if (hasCoordinates) {
      streetViewImages = await fetch360StreetView(lat, lon);
      if (streetViewImages.length > 0) {
        verificationMode = 'streetview-360';
        // Build public URLs for frontend rendering (these are the same URLs Google serves)
        streetViewUrls = STREET_VIEW_HEADINGS.map(({ heading }) =>
          `https://maps.googleapis.com/maps/api/streetview?size=${STREET_VIEW_SIZE}&location=${lat},${lon}&fov=90&heading=${heading}&pitch=0&key=${GOOGLE_MAPS_API_KEY}`
        );
        console.log(`🗺️  [ImageVerify] Using 360° Street View comparison mode (${streetViewImages.length} angles)`);
      } else {
        console.log(`🧠 [ImageVerify] Using zero-shot spatial reasoning mode`);
      }
    } else {
      console.log(`📍 [ImageVerify] No valid coordinates — location check will be lenient`);
    }

    // Step 4: Build the Gemini API request
    const requestBody = buildVerificationRequest(
      base64Image, mimeType, textClaim, domain, lat, lon, streetViewImages
    );

    // Step 5: Call Gemini API (with model fallback on rate limits)
    const startTime = Date.now();
    let response: Response | null = null;
    let usedModel = GEMINI_MODELS[0];

    for (const model of GEMINI_MODELS) {
      usedModel = model;
      const apiUrl = getGeminiUrl(model);
      
      response = await fetch(`${apiUrl}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 429 || response.status === 503) {
        console.warn(`⚠️ [ImageVerify] Model ${model} unavailable (${response.status}), trying next...`);
        continue; // Try the next model in the fallback chain
      }
      
      break; // Success or unrecoverable error — stop trying
    }

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : 'All models exhausted';
      const status = response?.status || 0;
      console.error(`❌ [ImageVerify] Gemini API error (${status}):`, errorText);
      // Fail open — don't block submissions if the API is down
      skipResult.reasoning = `Verification unavailable (API error ${status})`;
      return skipResult;
    }

    const data = await response.json() as any;
    const latency = Date.now() - startTime;

    // Step 6: Parse the structured response
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Extract JSON from the response (handle cases where model wraps in markdown)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('⚠️ [ImageVerify] Could not parse Gemini response:', rawText);
      skipResult.reasoning = 'Verification inconclusive (parse error)';
      return skipResult;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Map parsed response to our CoherenceResult type
    const result: CoherenceResult = {
      coherent: parsed.overall_coherent ?? true,
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0)),
      reasoning: parsed.reasoning ?? '',
      text_match: parsed.text_match ?? true,
      domain_match: parsed.domain_match ?? true,
      location_plausible: parsed.location_plausible ?? true,
      verification_mode: verificationMode,
      // Transparency fields for frontend
      streetViewUrls,
      geminiReasoning: parsed.reasoning ?? '',
      geminiModel: usedModel,
      latencyMs: latency,
    };

    // If we don't have valid coordinates, force location_plausible to true
    if (!hasCoordinates) {
      result.location_plausible = true;
    }

    // Recompute overall_coherent based on individual checks
    result.coherent = result.text_match && result.domain_match && result.location_plausible;

    // Logging
    const checks = [
      result.text_match ? '✅ Text' : '❌ Text',
      result.domain_match ? '✅ Domain' : '❌ Domain',
      result.location_plausible ? '✅ Location' : '❌ Location',
    ].join(' | ');
    
    const svInfo = verificationMode === 'streetview-360' 
      ? `streetview-360 (${streetViewImages.length} angles)` 
      : verificationMode;
    const emoji = result.coherent ? '✅' : '❌';
    console.log(`${emoji} [ImageVerify] ${result.coherent ? 'PASS' : 'FAIL'} [${checks}] (${(result.confidence * 100).toFixed(0)}% confidence, ${latency}ms, ${usedModel}, ${svInfo}) — ${result.reasoning}`);

    // Log token usage if available
    const usage = data?.usageMetadata;
    if (usage) {
      console.log(`   📊 Tokens: ${usage.promptTokenCount || '?'} prompt + ${usage.candidatesTokenCount || '?'} response = ${usage.totalTokenCount || '?'} total`);
    }

    return result;

  } catch (err: any) {
    console.error('❌ [ImageVerify] Verification failed:', err.message);
    // Fail open — never block a submission due to a verification system error
    skipResult.reasoning = `Verification error: ${err.message}`;
    return skipResult;
  } finally {
    // Always clean up the resized temp file
    cleanupResizedImage(imagePath, optimizedPath);
  }
}
