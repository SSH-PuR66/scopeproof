import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const modelId = 'Xenova/all-MiniLM-L6-v2';
export const revision = '751bff37182d3f1213fa05d7196b954e230abad9';
let instance;
let ready = false;
export const aiStatus = () => ({modelId, revision, ready});
export async function embed(texts) {
  if (!instance) {
    instance = (async () => {
      const {pipeline, env} = await import('@huggingface/transformers');
      env.cacheDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.cache');
      return pipeline('feature-extraction', modelId, {revision, dtype: 'q8', device: 'cpu'});
    })().catch(error => {instance = null; throw error;});
  }
  const extractor = await instance;
  // Short excerpts only. Tokenizer truncation is documented and is never a completion verdict.
  const output = await extractor(texts, {pooling: 'mean', normalize: true, truncation: true});
  ready = true;
  return output.tolist();
}
