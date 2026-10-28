const fsp = require('fs/promises');

// Video Studio: model inputs, request validation and the generate, list and
// delete handlers. Provider calls and file helpers come from main.js.
const VIDEO_MODEL_CONFIGS = {
  'pruna-p-video': {
    id: 'pruna-p-video',
    label: 'Pruna P-Video',
    modelPath: 'prunaai/p-video',
    priceLabel: '720p $0.02/sec, 1080p $0.04/sec, draft 4x cheaper',
    buildInput: ({ prompt, image, duration, aspectRatio, resolution, fps, draft, promptUpsampling, saveAudio, seed }) => {
      const input = {
        prompt,
        duration: Math.max(1, Math.min(20, Number(duration) || 5)),
        aspect_ratio: aspectRatio || '9:16',
        resolution: resolution === '1080p' ? '1080p' : '720p',
        fps: Number(fps) === 48 ? 48 : 24,
        draft: Boolean(draft),
        prompt_upsampling: Boolean(promptUpsampling),
        disable_safety_filter: false,
        save_audio: Boolean(saveAudio)
      };
      if (image) {
        input.image = image;
        delete input.aspect_ratio;
      }
      if (seed !== undefined && seed !== '' && !Number.isNaN(Number(seed))) input.seed = Number(seed);
      return input;
    }
  },
  'seedance-1-lite': {
    id: 'seedance-1-lite',
    label: 'Seedance 1 Lite',
    modelPath: 'bytedance/seedance-1-lite',
    priceLabel: 'est. ~$0.08 5s 480p, ~$0.18 5s 720p',
    buildInput: ({ prompt, image, duration, aspectRatio, resolution, fps, seed }) => {
      const input = {
        prompt,
        duration: Math.max(3, Math.min(12, Number(duration) || 5)),
        resolution: resolution === '480p' ? '480p' : '720p',
        aspect_ratio: aspectRatio || '9:16',
        fps: Math.max(8, Math.min(30, Number(fps) || 24)),
        camera_fixed: false
      };
      if (image) {
        input.image = image;
        delete input.aspect_ratio;
      }
      if (seed !== undefined && seed !== '' && !Number.isNaN(Number(seed))) input.seed = Number(seed);
      return input;
    }
  },
  'seedance-1-pro-fast': {
    id: 'seedance-1-pro-fast',
    label: 'Seedance 1 Pro Fast',
    modelPath: 'bytedance/seedance-1-pro-fast',
    priceLabel: 'faster, ~60% lower compute than Pro',
    buildInput: ({ prompt, image, duration, aspectRatio, resolution, fps, seed }) => {
      const input = {
        prompt,
        duration: Math.max(2, Math.min(12, Number(duration) || 5)),
        resolution: resolution === '1080p' ? '1080p' : '480p',
        aspect_ratio: aspectRatio || '9:16',
        fps: Math.max(8, Math.min(30, Number(fps) || 24)),
        camera_fixed: false
      };
      if (image) {
        input.image = image;
        delete input.aspect_ratio;
      }
      if (seed !== undefined && seed !== '' && !Number.isNaN(Number(seed))) input.seed = Number(seed);
      return input;
    }
  },
  'seedance-1-pro': {
    id: 'seedance-1-pro',
    label: 'Seedance 1 Pro',
    modelPath: 'bytedance/seedance-1-pro',
    priceLabel: 'higher quality, higher cost than Pro Fast',
    buildInput: ({ prompt, image, duration, aspectRatio, resolution, fps, seed }) => {
      const input = {
        prompt,
        duration: Math.max(2, Math.min(12, Number(duration) || 5)),
        resolution: resolution === '1080p' ? '1080p' : '480p',
        aspect_ratio: aspectRatio || '9:16',
        fps: Math.max(8, Math.min(30, Number(fps) || 24)),
        camera_fixed: false
      };
      if (image) {
        input.image = image;
        delete input.aspect_ratio;
      }
      if (seed !== undefined && seed !== '' && !Number.isNaN(Number(seed))) input.seed = Number(seed);
      return input;
    }
  },
  'hailuo-02': {
    id: 'hailuo-02',
    label: 'MiniMax Hailuo 02',
    modelPath: 'minimax/hailuo-02',
    priceLabel: 'est. ~$0.45/generation',
    buildInput: ({ prompt, image, duration, resolution, promptUpsampling }) => {
      const input = {
        prompt,
        duration: Number(duration) >= 10 ? 10 : 6,
        resolution: resolution === '1080p' ? '1080p' : '768p',
        prompt_optimizer: Boolean(promptUpsampling)
      };
      if (input.duration === 10) input.resolution = '768p';
      if (image) input.first_frame_image = image;
      return input;
    }
  }
};

// Ratios each video model accepts, matching the model registry shown in Video Studio.
const VIDEO_MODEL_RATIOS = Object.freeze({
  'pruna-p-video': ['1:1', '16:9', '9:16'],
  'seedance-1-lite': ['1:1', '16:9', '9:16'],
  'seedance-1-pro-fast': ['1:1', '16:9', '9:16'],
  'seedance-1-pro': ['1:1', '16:9', '9:16']
});

function videoRatioProblem(model, aspectRatio, image) {
  const allowed = VIDEO_MODEL_RATIOS[model];
  if (!allowed || String(image || '').trim() || allowed.includes(aspectRatio)) return '';
  return `This model accepts ${allowed.join(', ')}. Choose one of those ratios; nothing was generated.`;
}

function registerVideoIpc({
  handle, store, log, activeJobs, resolveReplicateApiToken, replicateRequest, pollReplicate,
  emitProgress, extractReplicateOutputUrl, downloadVideo, logProviderError, videoRecordWithDisplay
}) {
  handle('generate-video', async (e, {
    model = 'pruna-p-video',
    prompt = '',
    image = '',
    duration = 5,
    aspectRatio = '9:16',
    resolution = '720p',
    fps = 24,
    draft = false,
    promptUpsampling = true,
    saveAudio = true,
    seed,
    settings = {},
    jobKey
  } = {}) => {
    const apiToken = resolveReplicateApiToken(settings);
    if (!apiToken) return { success: false, error: 'Replicate API token is missing. Add it in Settings first.' };
    if (!String(prompt || '').trim()) return { success: false, error: 'Enter a video prompt first.' };
    const modelConfig = VIDEO_MODEL_CONFIGS[model];
    if (!modelConfig) return { success: false, error: `Unknown video model "${String(model).slice(0, 60)}". Choose a model from the list.` };
    const ratioProblem = videoRatioProblem(model, aspectRatio, image);
    if (ratioProblem) return { success: false, error: ratioProblem };
    if (String(image || '').trim() && !/^https:\/\//i.test(String(image).trim())) {
      return { success: false, error: 'The starting image must be a public https:// address. Local files are not uploaded for video, so nothing was generated.' };
    }

    const controller = new AbortController();
    if (jobKey) activeJobs.set(jobKey, controller);

    const cleanImage = image && /^https?:\/\//i.test(String(image)) ? String(image).trim() : '';
    const input = modelConfig.buildInput({
      prompt: String(prompt).trim(),
      image: cleanImage,
      duration,
      aspectRatio,
      resolution,
      fps,
      draft,
      promptUpsampling,
      saveAudio,
      seed
    });

    try {
      const res = await replicateRequest(`https://api.replicate.com/v1/models/${modelConfig.modelPath}/predictions`, { input }, apiToken, { signal: controller.signal, predictionDeadlineSeconds: 660 });
      if (!res.data.id) throw new Error('Failed to start video generation.');
      const predictionId = res.data.id;
      const maxAttempts = 120;
      const output = await pollReplicate(predictionId, apiToken, {
        maxAttempts, intervalMs: 5000, signal: controller.signal, preserveOutput: true,
        onProgress: (progress) => emitProgress('video-generation-progress', progress)
      });
          const remoteVideoUrl = extractReplicateOutputUrl(output);
          if (!remoteVideoUrl) throw new Error('Video generated, but Replicate did not return a downloadable URL.');
          // The prediction is already paid for: keep the provider URL even when the local copy fails.
          let localPath = '';
          let downloadError = '';
          try { localPath = await downloadVideo(remoteVideoUrl, prompt); }
          catch (error) {
            downloadError = `Saved the provider link, but the local copy failed: ${error.message || 'download error'}. Provider links expire; download it soon.`;
            logProviderError('Video download failed:', error);
          }
          const record = videoRecordWithDisplay({
            downloadError,
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            prompt: input.prompt,
            image: input.image || input.first_frame_image || '',
            duration: input.duration || duration,
            aspectRatio: input.image || input.first_frame_image ? 'from image' : input.aspect_ratio || aspectRatio,
            resolution: input.resolution || resolution,
            fps: input.fps || fps,
            draft: Boolean(input.draft),
            remoteVideoUrl,
            videoUrl: remoteVideoUrl,
            localPath,
            createdAt: new Date().toISOString(),
            provider: 'Replicate',
            model: modelConfig.modelPath,
            modelLabel: modelConfig.label,
            priceLabel: modelConfig.priceLabel
          });
          const existing = store.get('generatedVideos', []);
          store.set('generatedVideos', [record, ...existing].slice(0, 200));
          return { success: true, video: record, warning: downloadError, videos: store.get('generatedVideos', []).map(videoRecordWithDisplay) };
    } catch (err) {
      if (err.message === 'Cancelled by user') return { success: false, error: 'Cancelled', cancelled: true };
      logProviderError('Video generation failed:', err);
      return { success: false, error: err.message || 'Video generation failed.' };
    } finally {
      if (jobKey) activeJobs.delete(jobKey);
    }
  });

  handle('get-generated-videos', async () => {
    return { success: true, videos: store.get('generatedVideos', []).map(videoRecordWithDisplay) };
  });

  handle('delete-generated-video', async (e, videoId) => {
    const videos = store.get('generatedVideos', []);
    const target = videos.find((video) => video.id === videoId);
    if (target?.localPath) {
      try { await fsp.unlink(target.localPath); }
      catch (err) { if (err.code !== 'ENOENT') log.warn('Failed to delete video file:', err.message); }
    }
    const next = videos.filter((video) => video.id !== videoId);
    store.set('generatedVideos', next);
    return { success: true, videos: next.map(videoRecordWithDisplay) };
  });
}

module.exports = { VIDEO_MODEL_CONFIGS, VIDEO_MODEL_RATIOS, videoRatioProblem, registerVideoIpc };
