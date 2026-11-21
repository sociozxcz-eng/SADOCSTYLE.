import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/dist/transformers.min.js';
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let generator;
self.onmessage = async ({ data }) => {
  try {
    generator ??= await pipeline('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', {
      device: 'wasm', dtype: 'q4',
      progress_callback(event) {
        if (event.status === 'progress' && event.file?.endsWith('.onnx'))
          self.postMessage({ progress: Math.round(event.progress) });
      }
    });
    self.postMessage({ thinking: true });
    const [result] = await generator(data, { max_new_tokens: 130, do_sample: false, return_full_text: false });
    const output = result.generated_text;
    const reply = typeof output === 'string' ? output : output.at(-1)?.content;
    if (!reply?.trim()) throw new Error();
    self.postMessage({ reply });
  } catch {
    self.postMessage({ error: true });
  }
};
