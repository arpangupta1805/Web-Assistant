// Speech Recognition utility functions and polyfills

export const checkSpeechRecognitionSupport = () => {
  const isSecureContext = window.isSecureContext || 
                         location.protocol === 'https:' || 
                         location.hostname === 'localhost' ||
                         location.hostname === '127.0.0.1';
  
  const hasSpeechRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  
  console.log('Speech Recognition Support Check:', {
    isSecureContext,
    hasSpeechRecognition,
    protocol: location.protocol,
    hostname: location.hostname,
    userAgent: navigator.userAgent,
    isWebKit: !!window.webkitSpeechRecognition,
    isNative: !!window.SpeechRecognition
  });
  
  return {
    isSupported: hasSpeechRecognition && isSecureContext,
    isSecureContext,
    hasSpeechRecognition,
    error: !isSecureContext ? 'HTTPS_REQUIRED' : 
           !hasSpeechRecognition ? 'NOT_SUPPORTED' : null
  };
};

export const requestMicrophonePermission = async () => {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('MediaDevices API not supported');
    }
    
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Stop the stream immediately as we just needed permission
    stream.getTracks().forEach(track => track.stop());
    
    console.log('Microphone permission granted');
    return { success: true };
  } catch (error) {
    console.error('Microphone permission error:', error);
    
    let message = 'Microphone access denied';
    if (error.name === 'NotFoundError') {
      message = 'No microphone found. Please connect a microphone.';
    } else if (error.name === 'NotAllowedError') {
      message = 'Microphone permission denied. Please allow access and try again.';
    } else if (error.name === 'NotSupportedError') {
      message = 'Microphone not supported in this browser.';
    }
    
    return { success: false, error: message };
  }
};

export const initializeSpeechRecognition = () => {
  // Polyfill for webkit browsers
  if (!window.SpeechRecognition && window.webkitSpeechRecognition) {
    window.SpeechRecognition = window.webkitSpeechRecognition;
  }
  
  const support = checkSpeechRecognitionSupport();
  
  if (!support.isSupported) {
    console.warn('Speech Recognition not supported:', support.error);
    return { success: false, error: support.error };
  }
  
  return { success: true };
};
