import { useRef, useState, useEffect } from 'react';

export function useSpeechEngine() {
  const synthRef = useRef(window.speechSynthesis);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const queueRef = useRef([]);

  // Load voices once
  const loadVoices = () =>
    new Promise((resolve) => {
      const voices = synthRef.current.getVoices();
      if (voices.length) return resolve(voices);
      window.speechSynthesis.onvoiceschanged = () => {
        resolve(synthRef.current.getVoices());
      };
    });

  const speakText = async (text) => {
    if (!text?.trim()) return;
    const cleanText = text.replace(/[\u{1F300}-\u{1F6FF}]/gu, '').trim();

    queueRef.current.push(cleanText);
    if (!isSpeaking) processQueue();
  };

  const processQueue = async () => {
    if (queueRef.current.length === 0 || isSpeaking) return;

    const text = queueRef.current.shift();
    const voices = await loadVoices();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voices.find(v => v.lang.startsWith("en")) || voices[0];
    utterance.rate = 0.9;
    utterance.volume = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      setTimeout(processQueue, 200); // Process next item after short delay
    };
    utterance.onerror = (e) => {
      console.error("Speech synthesis error:", e);
      setIsSpeaking(false);
    };

    console.log("🔊 Speaking:", text);
    synthRef.current.speak(utterance);
  };

  return { speakText, isSpeaking };
}
