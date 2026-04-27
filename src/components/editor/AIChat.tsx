"use client";

import { useState, useRef, useEffect } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { MessageSquare, Send, X, Bot, User, Loader2 } from "lucide-react";
import { CanvasObject } from "@/lib/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AIChatProps {
  onAction: (action: {
    type: "create" | "modify" | "delete" | "clear";
    objects?: Partial<CanvasObject>[];
    message?: string;
  }) => void;
  currentObjects: CanvasObject[];
  dimensionUnit: "cm" | "in";
  adminSlug: string;
}

export default function AIChat({ onAction, currentObjects, dimensionUnit, adminSlug }: AIChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hello! I'm your AI design assistant. I can help you create furniture designs. Try saying things like 'Create a blue rectangle 100cm wide and 50cm tall' or 'Add a circular table with 60cm diameter'.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          adminSlug,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          currentObjects: currentObjects.map((obj) => ({
            id: obj.id,
            name: obj.name,
            type: obj.type,
            width: obj.width,
            height: obj.height,
            depth: obj.depth,
            color: obj.color,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP ${response.status}: ${response.statusText}` }));
        const errorMessage: ChatMessage = {
          role: "assistant",
          content: errorData.message || `Error: ${response.status} ${response.statusText}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
        return;
      }

      const data = await response.json();

      // Add AI response to messages
      const aiMessage: ChatMessage = {
        role: "assistant",
        content: data.message || "I've processed your request.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiMessage]);

      // If API key is not configured, don't try to process actions
      if (data.action === "info" && data.message?.includes("API key")) {
        return;
      }

      // Process the action
      if (data.action && data.objects) {
        if (data.action === "create") {
          // Create new objects
          data.objects.forEach((obj: any) => {
            const canvasObj: Partial<CanvasObject> = {
              type: obj.type || "rect",
              furnitureType: obj.type === "circle" ? "custom-circle" : "custom-rect",
              name: obj.name || "AI Created",
              width: obj.width || 50,
              height: obj.height || 30,
              depth: obj.depth || 30,
              color: obj.color || "#3b82f6",
              x: obj.x || 200,
              y: obj.y || 200,
              rotation: 0,
            };
            onAction({ type: "create", objects: [canvasObj] });
          });
        } else if (data.action === "modify") {
          // Modify existing objects (simplified - would need object IDs)
          onAction({ type: "modify", objects: data.objects });
        } else if (data.action === "delete") {
          onAction({ type: "delete", objects: data.objects });
        } else if (data.action === "clear") {
          onAction({ type: "clear" });
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: error instanceof Error 
          ? `Sorry, I encountered an error: ${error.message}. Please check your API configuration and try again.`
          : "Sorry, I encountered an error. Please check your API configuration and try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[var(--primary)] text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-50 hover:scale-110"
        aria-label="Open AI Chat"
      >
        <MessageSquare className="w-6 h-6" />
      </button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 w-96 h-[600px] shadow-2xl z-50 flex flex-col border-2 border-[var(--primary)]/20">
      <CardHeader className="pb-3 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="w-5 h-5 text-[var(--primary)]" />
            AI Design Assistant
          </CardTitle>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 hover:bg-[var(--muted)] rounded transition-colors"
            aria-label="Close chat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-[var(--primary)]/10 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-[var(--primary)]" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === "user"
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--muted)] text-[var(--foreground)]"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p className="text-xs mt-1 opacity-70">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              {message.role === "user" && (
                <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-[var(--primary)]" />
              </div>
              <div className="bg-[var(--muted)] rounded-lg px-4 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[var(--border)] p-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me to create furniture..."
              className="flex-1 px-3 py-2 text-sm bg-[var(--background)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              size="sm"
              className="px-4"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mt-2">
            Try: "Create a blue table 120cm wide" or "Add a circular coffee table"
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
