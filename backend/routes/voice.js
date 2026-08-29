const express = require('express');
const router = express.Router();
const config = require('../config');

/**
 * 1. Speech-to-Text: /api/voice/transcribe
 * Receives base64-encoded audio bytes and sends them to Whisper API.
 */
router.post('/transcribe', async (req, res) => {
  const { audio } = req.body; // base64 string
  if (!audio) {
    return res.status(400).json({ error: "Missing audio payload." });
  }

  if (!config.openaiApiKey) {
    return res.json({
      text: "OpenAI credentials missing. Transcription fell back to text-recognition stub.",
      mock: true
    });
  }

  try {
    const buffer = Buffer.from(audio, 'base64');
    const formData = new FormData();
    // Convert buffer to file blob representation
    const blob = new Blob([buffer], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', 'whisper-1');

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openaiApiKey}`
      },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || "Transcription failed.");
    }

    return res.json({ text: data.text });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

/**
 * 2. Text-to-Speech: /api/voice/speak
 * Receives text and returns audio bytes of generated speech.
 */
router.post('/speak', async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Missing text payload." });
  }

  if (!config.openaiApiKey) {
    return res.json({
      audio: "",
      mock: true,
      message: "OpenAI keys missing. Fallback to client browser speech synthesis."
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: "alloy"
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`TTS generation failed: ${response.status} - ${errText}`);
    }

    // Pipe audio buffer directly back
    const buffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    return res.send(Buffer.from(buffer));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
