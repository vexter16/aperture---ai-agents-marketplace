import { embedText } from '../src/services/embeddings';
import { pool, upsertSubmitter, insertFact, semanticSearch } from '../src/db/index';

async function runTest() {
  try {
    console.log('1. Creating a test submitter...');
    const submitter = await upsertSubmitter('0xTESTWALLET123');

    console.log('2. Vectorizing a fact with AI...');
    const textClaim = "Massive fire at the Koramangala commercial complex.";
    const vector = await embedText(textClaim);
    
    console.log('3. Saving fact and vector to PostgreSQL...');
    await insertFact({
      submitter_id: submitter.id,
      text_claim: textClaim,
      domain: 'logistics',
      stake_amount: 2.00,
      embedding: vector
    });

    console.log('4. Performing Semantic Search for "emergency blaze"...');
    // Notice we search for "emergency blaze", not the word "fire"
    const searchVector = await embedText("emergency blaze");
    const results = await semanticSearch(searchVector, 0.2, 3);
    
    console.log('\n✅ TEST SUCCESSFUL! Search Results:');
    results.forEach(r => {
      console.log(`- Fact: "${r.text_claim}"`);
      console.log(`- Semantic Match: ${(r.similarity * 100).toFixed(1)}%`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

runTest();