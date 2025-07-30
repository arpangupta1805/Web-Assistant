import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Send, 
  Cloud, 
  Clock,
  Zap,
  MessageCircle,
  Settings,
  Youtube,
  Globe,
  Sun,
  Loader,
  ExternalLink
} from 'lucide-react';
import axios from 'axios';
import io from 'socket.io-client';


const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

function App() {
  // State management
  const [textInput, setTextInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [currentWeather, setCurrentWeather] = useState(null);
  const [notifications, setNotifications] = useState([]);
  
  // Refs
  const messagesEndRef = useRef(null);
  const socketRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Initialize components
  useEffect(() => {
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

    socketRef.current.on('open_url', (data) => {
      // Handle URL opening requests from backend
      handleOpenUrl(data);
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
      } else if (lastAiMessage) {
        // Update existing AI message
        if (data.complete_text) {
          lastAiMessage.text = data.complete_text;
        } else if (data.chunk) {
          lastAiMessage.text = (lastAiMessage.text || '') + data.chunk;
        }
        
        // Update streaming status
        lastAiMessage.isStreaming = !data.is_complete;
      }
      
      return newMessages;
    });
    
    // Save to localStorage after updating messages
    setTimeout(() => {
      saveMessagesToLocalStorage();
    }, 100);
  }, []);

  // Function to speak any message
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

  const handleOpenUrl = (data) => {
    console.log('Received open_url event:', data);
    
    if (data.url) {
      // Automatically open URL in a new tab
      window.open(data.url, '_blank');
      
      // Add a notification
      const notificationMessage = data.type === 'music' 
        ? `🎵 Opening music: ${data.url}` 
        : data.type === 'website'
        ? `🌐 Opening website: ${data.url}`
        : `🔗 Opening: ${data.url}`;
      
      addNotification(notificationMessage, 'success');
      console.log(notificationMessage);
    }
  };

  const addNotification = (message, type = 'info') => {
    const notification = {
      id: Date.now(),
      message,
      type,
      timestamp: new Date()
    };
    
    setNotifications(prev => [...prev, notification]);
    
    // Auto-remove notification after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, 5000);
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
    // Audio functionality removed
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
    // Audio functionality removed
  };

  const stopListening = () => {
    // Audio functionality removed
  };

  const toggleMute = () => {
    // Audio functionality removed
  };

  const handleVolumeChange = (newVolume) => {
    // Audio functionality removed
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageWithLinks = (text) => {
    // URL detection regex that matches http/https URLs
    const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
    
    const parts = text.split(urlRegex);
    
    return parts.map((part, index) => {
      if (urlRegex.test(part)) {
        // Determine the type of URL for appropriate styling
        const isYouTube = part.includes('youtube.com') || part.includes('youtu.be');
        const isMusic = isYouTube || part.includes('spotify.com') || part.includes('soundcloud.com');
        
        return (
          <span key={index} className="inline-flex items-center gap-1">
            <a
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className={`${
                isMusic 
                  ? 'text-red-400 hover:text-red-300' 
                  : 'text-blue-400 hover:text-blue-300'
              } underline transition-colors duration-200 break-all inline-flex items-center gap-1`}
              onClick={(e) => {
                e.stopPropagation();
                console.log('User clicked URL:', part);
              }}
            >
              {isYouTube && <Youtube className="w-4 h-4 inline" />}
              {!isMusic && <ExternalLink className="w-3 h-3 inline" />}
              {part}
            </a>
          </span>
        );
      }
      return part;
    });
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
                {isConnected ? '🟢 Connected' : '� Connecting...'}
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

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="fixed top-20 right-4 z-50 space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`glass border border-white/10 rounded-lg p-3 max-w-sm transform transition-all duration-300 ${
                notification.type === 'success' 
                  ? 'border-green-500/30 bg-green-500/10' 
                  : notification.type === 'error'
                  ? 'border-red-500/30 bg-red-500/10'
                  : 'border-blue-500/30 bg-blue-500/10'
              }`}
            >
              <p className="text-sm text-white">{notification.message}</p>
            </div>
          ))}
        </div>
      )}

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
                  Your intelligent voice assistant for music, weather, and queries to solve!
                </p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
                  <div className="glass p-4 rounded-lg text-center">
                    <Youtube className="w-8 h-8 text-red-500 mx-auto mb-2" />
                    <h3 className="font-semibold mb-1">Music & Videos</h3>
                    <p className="text-sm text-gray-400">"Play some jazz music"</p>
                  </div>
                  <div className="glass p-4 rounded-lg text-center">
                    <Globe className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                    <h3 className="font-semibold mb-1">Clear Queries: By Asking AI</h3>
                    <p className="text-sm text-gray-400">"What is force?"</p>
                  </div>
                  <div className="glass p-4 rounded-lg text-center">
                    <Globe className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                    <h3 className="font-semibold mb-1">Web Browsing</h3>
                    <p className="text-sm text-gray-400">"Open Youtube"</p>
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
                      {renderMessageWithLinks(message.text)}
                      {message.isStreaming && (
                        <span className="inline-block w-2 h-4 bg-primary-500 ml-1 animate-pulse"></span>
                      )}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs opacity-60">
                        {formatTime(message.timestamp)}
                      </span>
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
            {/* Text Input */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleCommand(textInput)}
                placeholder="Type your message..."
                className="input-field w-full pr-12"
                disabled={isLoading}
              />
              
              {/* Send Button */}
              <button
                onClick={() => handleCommand(textInput)}
                disabled={!textInput.trim() || isLoading}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 btn-primary p-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
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
