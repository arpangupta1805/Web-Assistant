import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, 
  MicOff, 
  Send, 
  Volume2, 
  VolumeX, 
  Play, 
  Pause,
  Cloud, 
  Clock,
  Zap,
  MessageCircle,
  Settings,
  Youtube,
  Globe,
  Sun,
  Loader
} from 'lucide-react';
import axios from 'axios';
import io from 'socket.io-client';

const API_BASE_URL = 'http://localhost:8000';

function App() {
  // State management
  const [isListening, setIsListening] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentVolume, setCurrentVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [currentWeather, setCurrentWeather] = useState(null);
  
  // Refs
  const recognitionRef = useRef(null);
  const synthRef = useRef(null);
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Initialize speech recognition and synthesis
  useEffect(() => {
    initializeSpeechRecognition();
    initializeSpeechSynthesis();
    initializeSocketConnection();
    loadMessagesFromLocalStorage();
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // LocalStorage management functions
  const getStorageSize = () => {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length + key.length;
      }
    }
    return total;
  };

  const saveMessagesToLocalStorage = () => {
    try {
      const chatData = {
        messages: messages.map(msg => ({
          ...msg,
          timestamp: msg.timestamp.toISOString()
        })),
        lastSaved: new Date().toISOString()
      };
      
      const chatDataString = JSON.stringify(chatData);
      const currentSize = getStorageSize();
      const newDataSize = chatDataString.length + 'dhanush_chat_history'.length;
      
      // 4.6MB limit (4.6 * 1024 * 1024 bytes)
      const MAX_STORAGE_SIZE = 4.6 * 1024 * 1024;
      
      if (currentSize + newDataSize > MAX_STORAGE_SIZE) {
        // Clear old messages to make space
        const messagesToKeep = Math.floor(messages.length * 0.7); // Keep 70% of messages
        const trimmedData = {
          messages: messages.slice(-messagesToKeep).map(msg => ({
            ...msg,
            timestamp: msg.timestamp.toISOString()
          })),
          lastSaved: new Date().toISOString(),
          trimmed: true,
          trimmedAt: new Date().toISOString()
        };
        localStorage.setItem('dhanush_chat_history', JSON.stringify(trimmedData));
        console.log(`Chat history trimmed to ${messagesToKeep} messages due to storage limit`);
      } else {
        localStorage.setItem('dhanush_chat_history', chatDataString);
      }
    } catch (error) {
      console.error('Error saving messages to localStorage:', error);
      // If storage is full, try to clear some space
      try {
        const trimmedMessages = messages.slice(-50); // Keep only last 50 messages
        const trimmedData = {
          messages: trimmedMessages.map(msg => ({
            ...msg,
            timestamp: msg.timestamp.toISOString()
          })),
          lastSaved: new Date().toISOString(),
          emergency_trim: true
        };
        localStorage.setItem('dhanush_chat_history', JSON.stringify(trimmedData));
      } catch (e) {
        console.error('Failed to save even trimmed messages:', e);
      }
    }
  };

  const loadMessagesFromLocalStorage = () => {
    try {
      const savedData = localStorage.getItem('dhanush_chat_history');
      if (savedData) {
        const chatData = JSON.parse(savedData);
        const loadedMessages = chatData.messages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
        setMessages(loadedMessages);
        console.log(`Loaded ${loadedMessages.length} messages from localStorage`);
        
        if (chatData.trimmed) {
          console.log(`Chat history was previously trimmed on ${chatData.trimmedAt}`);
        }
      }
    } catch (error) {
      console.error('Error loading messages from localStorage:', error);
    }
  };

  const clearChatHistory = () => {
    setMessages([]);
    localStorage.removeItem('dhanush_chat_history');
    console.log('Chat history cleared');
  };

  const initializeSpeechRecognition = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        setIsListening(true);
      };

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setTextInput(transcript);
        handleCommand(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  };

  const initializeSpeechSynthesis = () => {
    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
  };

  const initializeSocketConnection = () => {
    socketRef.current = io(API_BASE_URL);
    
    socketRef.current.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to server');
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from server');
    });

    socketRef.current.on('ai_response_chunk', (data) => {
      // Handle real-time AI response chunks
      updateMessageInRealTime(data);
    });

    socketRef.current.on('action_completed', (data) => {
      // Handle completed actions (like opening websites, playing music)
      handleActionCompleted(data);
    });
  };

  const updateMessageInRealTime = useCallback((data) => {
    setMessages(prev => {
      const newMessages = [...prev];
      
      // Find the last AI message that might be streaming or empty
      let lastAiMessageIndex = -1;
      for (let i = newMessages.length - 1; i >= 0; i--) {
        if (newMessages[i].type === 'ai') {
          lastAiMessageIndex = i;
          break;
        }
      }
      
      const lastAiMessage = lastAiMessageIndex >= 0 ? newMessages[lastAiMessageIndex] : null;
      
      if (data.is_new_message || !lastAiMessage) {
        // Create new AI message only when explicitly marked as new or no AI message exists
        const newMessage = {
          id: Date.now() + Math.random(), // Ensure unique ID
          type: 'ai',
          text: data.chunk || data.complete_text || '',
          isStreaming: !data.is_complete,
          timestamp: new Date()
        };
        newMessages.push(newMessage);
        
        // If it's a complete message, speak it after a longer delay to ensure UI is updated
        if (data.is_complete && (data.complete_text || data.chunk) && audioEnabled) {
          setTimeout(() => {
            const textToSpeak = data.complete_text || data.chunk;
            console.log('Speaking new complete message:', textToSpeak);
            speakText(textToSpeak);
          }, 200);
        }
      } else if (lastAiMessage) {
        // Update existing AI message
        if (data.complete_text) {
          lastAiMessage.text = data.complete_text;
        } else if (data.chunk) {
          lastAiMessage.text = (lastAiMessage.text || '') + data.chunk;
        }
        
        // Update streaming status
        lastAiMessage.isStreaming = !data.is_complete;
        
        // Speak when streaming is complete and we have the full text
        if (data.is_complete && audioEnabled && lastAiMessage.text.trim()) {
          setTimeout(() => {
            console.log('Speaking complete streamed message:', lastAiMessage.text);
            speakText(lastAiMessage.text);
          }, 200);
        }
      }
      
      return newMessages;
    });
    
    // Save to localStorage after updating messages
    setTimeout(() => {
      saveMessagesToLocalStorage();
    }, 100);
  }, [audioEnabled]);

  // Function to speak any message
  const speakMessage = (text) => {
    if (!synthRef.current || isMuted) return;
    
    // Cancel any ongoing speech
    synthRef.current.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = currentVolume / 100;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    synthRef.current.speak(utterance);
  };

  const handleActionCompleted = (data) => {
    console.log('Action completed:', data);
    if (data.type === 'website_opened') {
      // Don't add message or speak, it's already handled in the main response
    } else if (data.type === 'music_playing') {
      // Don't add message or speak, it's already handled in the main response
    } else if (data.type === 'weather_fetched') {
      setCurrentWeather(data.weather);
      // Weather response is already handled in the main response
    }
  };

  const addMessage = (type, text, data = null) => {
    const message = {
      id: Date.now(),
      type,
      text,
      data,
      timestamp: new Date(),
      isStreaming: false
    };
    
    setMessages(prev => {
      const newMessages = [...prev, message];
      // Save to localStorage after state update
      setTimeout(() => {
        try {
          const chatData = {
            messages: newMessages.map(msg => ({
              ...msg,
              timestamp: msg.timestamp.toISOString()
            })),
            lastSaved: new Date().toISOString()
          };
          
          const chatDataString = JSON.stringify(chatData);
          const currentSize = getStorageSize();
          const newDataSize = chatDataString.length + 'dhanush_chat_history'.length;
          
          // 4.6MB limit
          const MAX_STORAGE_SIZE = 4.6 * 1024 * 1024;
          
          if (currentSize + newDataSize > MAX_STORAGE_SIZE) {
            const messagesToKeep = Math.floor(newMessages.length * 0.7);
            const trimmedData = {
              messages: newMessages.slice(-messagesToKeep).map(msg => ({
                ...msg,
                timestamp: msg.timestamp.toISOString()
              })),
              lastSaved: new Date().toISOString(),
              trimmed: true,
              trimmedAt: new Date().toISOString()
            };
            localStorage.setItem('dhanush_chat_history', JSON.stringify(trimmedData));
          } else {
            localStorage.setItem('dhanush_chat_history', chatDataString);
          }
        } catch (error) {
          console.error('Error saving to localStorage:', error);
        }
      }, 100);
      
      return newMessages;
    });
    
    // Auto-scroll to bottom
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  const speakText = (text) => {
    if (!synthRef.current || !audioEnabled || isMuted || !text || !text.trim()) {
      console.log('Speech cancelled:', { 
        hassynth: !!synthRef.current, 
        audioEnabled, 
        isMuted, 
        hasText: !!text?.trim() 
      });
      return;
    }
    
    // Cancel any ongoing speech
    synthRef.current.cancel();
    
    // Clean the text for better speech
    const cleanText = text.replace(/[🎵🌐🌤️]/g, '').trim();
    
    console.log('Starting speech synthesis for:', cleanText);
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = currentVolume / 100;
    
    utterance.onstart = () => {
      console.log('Speech started');
      setIsSpeaking(true);
    };
    
    utterance.onend = () => {
      console.log('Speech ended');
      setIsSpeaking(false);
    };
    
    utterance.onerror = (e) => {
      console.error('Speech error:', e);
      setIsSpeaking(false);
    };
    
    // Add a small delay to ensure the speech synthesis engine is ready
    setTimeout(() => {
      synthRef.current.speak(utterance);
    }, 50);
  };

  const handleCommand = async (command) => {
    if (!command.trim()) return;
    
    setIsLoading(true);
    addMessage('user', command);
    
    try {
      if (isConnected && socketRef.current) {
        // Use Socket.IO for real-time processing
        // Don't create initial message here - let updateMessageInRealTime handle it
        socketRef.current.emit('process_command', {
          command: command,
          timestamp: new Date()
        });
      } else {
        // Fallback to REST API if socket is not connected
        const response = await axios.post(`${API_BASE_URL}/api/command`, {
          command: command,
          type: 'text'
        });

        if (response.data.success) {
          addMessage('ai', response.data.response, response.data.data);
          
          // Speak the response if audio is enabled
          if (audioEnabled) {
            speakText(response.data.response);
          }
        } else {
          addMessage('ai', response.data.response || 'Sorry, I encountered an error.');
        }
      }
    } catch (error) {
      console.error('Error processing command:', error);
      addMessage('ai', 'Sorry, I encountered an error processing your request.');
    } finally {
      setIsLoading(false);
      setTextInput('');
    }
  };

  const startListening = () => {
    if (recognitionRef.current && !isListening) {
      recognitionRef.current.start();
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (synthRef.current) {
      if (!isMuted) {
        synthRef.current.cancel();
        setIsSpeaking(false);
      }
    }
  };

  const handleVolumeChange = (newVolume) => {
    setCurrentVolume(newVolume);
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-white/10 p-4 backdrop-blur-md bg-slate-900/80">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Dhanush AI Assistant</h1>
              <p className="text-sm text-gray-400">
                {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Weather Display */}
            {currentWeather && (
              <div className="glass px-3 py-2 rounded-lg flex items-center space-x-2">
                <Sun className="w-4 h-4 text-yellow-400" />
                <span className="text-sm">{currentWeather.temp}°C</span>
                <span className="text-xs text-gray-400">• {currentWeather.location}</span>
              </div>
            )}
            
            {/* Storage Info */}
            <div className="glass px-3 py-2 rounded-lg flex items-center space-x-2">
              <MessageCircle className="w-4 h-4 text-blue-400" />
              <span className="text-xs">{messages.length} msgs</span>
            </div>
            
            {/* Audio Controls */}
            <div className="flex items-center space-x-2">
              <button
                onClick={toggleMute}
                className="btn-secondary p-2"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              
              <input
                type="range"
                min="0"
                max="100"
                value={currentVolume}
                onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                className="w-20 accent-primary-600"
                title="Volume"
              />
            </div>
            
            {/* Clear Chat Button */}
            <button 
              onClick={clearChatHistory}
              className="btn-secondary p-2"
              title="Clear Chat History"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            
            {/* Settings */}
            <button className="btn-secondary p-2">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full p-4">
        {/* Chat Messages */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0"
        >
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-20 h-20 bg-primary-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-10 h-10 text-primary-400" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Welcome to Dhanush AI</h2>
                <p className="text-gray-400 mb-6">
                  Your intelligent voice assistant for web browsing, music, weather, and more!
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
                  <div className="glass p-4 rounded-lg text-center">
                    <Youtube className="w-8 h-8 text-red-500 mx-auto mb-2" />
                    <h3 className="font-semibold mb-1">Music & Videos</h3>
                    <p className="text-sm text-gray-400">"Play some jazz music"</p>
                  </div>
                  <div className="glass p-4 rounded-lg text-center">
                    <Globe className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                    <h3 className="font-semibold mb-1">Web Browsing</h3>
                    <p className="text-sm text-gray-400">"Open YouTube"</p>
                  </div>
                  <div className="glass p-4 rounded-lg text-center">
                    <Cloud className="w-8 h-8 text-green-500 mx-auto mb-2" />
                    <h3 className="font-semibold mb-1">Weather</h3>
                    <p className="text-sm text-gray-400">"What's the weather like?"</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex items-start space-x-3 max-w-2xl ${message.type === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.type === 'user' ? 'bg-primary-600' : 'bg-dark-700'
                  }`}>
                    {message.type === 'user' ? (
                      <span className="text-sm font-bold">U</span>
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                  </div>
                  
                  <div className={`${
                    message.type === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'
                  } relative group`}>
                    <p className="text-sm leading-relaxed">
                      {message.text}
                      {message.isStreaming && (
                        <span className="inline-block w-2 h-4 bg-primary-500 ml-1 animate-pulse"></span>
                      )}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs opacity-60">
                        {formatTime(message.timestamp)}
                      </span>
                      {/* Speaker button for all messages */}
                      {message.text.trim() && !message.isStreaming && (
                        <button
                          onClick={() => speakMessage(message.text)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded hover:bg-white/10"
                          title="Speak this message"
                        >
                          <Volume2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex items-start space-x-3 max-w-2xl">
                <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center">
                  <Loader className="w-4 h-4 animate-spin" />
                </div>
                <div className="chat-bubble-ai">
                  <p className="text-sm">Thinking...</p>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="glass rounded-xl p-4 border border-white/10">
          <div className="flex items-center space-x-4">
            {/* Voice Button */}
            <button
              onClick={isListening ? stopListening : startListening}
              className={`p-4 rounded-xl transition-all duration-200 ${
                isListening 
                  ? 'bg-red-600 hover:bg-red-700 listening-animation' 
                  : 'btn-primary'
              }`}
              disabled={isLoading}
            >
              {isListening ? (
                <>
                  <MicOff className="w-6 h-6" />
                  <div className="flex items-center space-x-1 mt-1">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="w-1 h-4 bg-white voice-wave rounded-full"></div>
                    ))}
                  </div>
                </>
              ) : (
                <Mic className="w-6 h-6" />
              )}
            </button>
            
            {/* Text Input */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleCommand(textInput)}
                placeholder="Type your message or use voice..."
                className="input-field w-full pr-12"
                disabled={isLoading || isListening}
              />
              
              {/* Send Button */}
              <button
                onClick={() => handleCommand(textInput)}
                disabled={!textInput.trim() || isLoading || isListening}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 btn-primary p-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            
            {/* Status Indicators */}
            <div className="flex items-center space-x-2">
              {isSpeaking && (
                <div className="flex items-center space-x-1 text-primary-400">
                  <Volume2 className="w-4 h-4" />
                  <span className="text-xs">Speaking</span>
                </div>
              )}
              
              {audioEnabled && (
                <div className="text-green-400 text-xs">
                  🎵 Audio On
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="glass border-t border-white/10 p-4 mt-auto">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm text-gray-400">
            Made with ❤️ by <span className="text-blue-400 font-semibold">Arpan Gupta</span>
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
