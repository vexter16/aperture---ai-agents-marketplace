import { pipeline, env } from '@xenova/transformers';

// Cache model in memory
let embedder: any = null;
env.cacheDir = './model-cache';

async function getEmbedder() {
  if (!embedder) {
    console.log('Loading local AI embedding model (first time takes ~30s)...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('✅ AI Model loaded.');
  }
  return embedder;
}

export async function embedText(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}