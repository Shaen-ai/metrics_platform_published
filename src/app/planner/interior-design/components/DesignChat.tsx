"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Loader2, ImagePlus, X, GripHorizontal, MessageSquare, Pencil } from "lucide-react";
import { useInteriorDesignStore, type ChatMessage, type GeneratedImage } from "../store";
import { useResolvedAdmin } from "@/contexts/PublishedTenantProvider";
import { normalizeRoomAnalysisOpenings } from "@/lib/interiorDesignPrompts";
import { compressImageBase64 } from "@/lib/compressImageBase64";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function DesignChat() {
  const {
    sessionId,
    chatMessages,
    addChatMessage,
    truncateDesignChatFromUserMessage,
    setCurrentPrompt,
    generatedImages,
    appendGeneratedImages,
    phase,
    setPhase,
    setError,
    roomAnalysis,
    clarifiedAnalysis,
  } = useInteriorDesignStore();

  const [isOpen, setIsOpen] = useState(true);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [attachedImage, setAttachedImage] = useState<{
    base64: string;
    mimeType: string;
    preview: string;
  } | null>(null);
  const [chatHeight, setChatHeight] = useState(320);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const admin = useResolvedAdmin();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const startY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const startHeight = chatRef.current?.offsetHeight ?? chatHeight;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      const currentY = "touches" in ev ? ev.touches[0].clientY : ev.clientY;
      const delta = startY - currentY;
      const maxH = Math.min(window.innerHeight - 32, window.innerHeight * 0.85);
      const newHeight = Math.max(120, Math.min(startHeight + delta, maxH));
      setChatHeight(newHeight);
    };

    const onEnd = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onEnd);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onEnd);
    document.addEventListener("touchmove", onMove);
    document.addEventListener("touchend", onEnd);
  }, [chatHeight]);

  const handleImageSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    try {
      const prevPreview = attachedImage?.preview;
      if (prevPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(prevPreview);
      }
      const preview = URL.createObjectURL(file);
      const raw = await fileToBase64(file);
      const compressed = await compressImageBase64(raw, file.type);
      setAttachedImage({
        base64: compressed.base64,
        mimeType: compressed.mimeType,
        preview,
      });
    } catch (err) {
      console.error("Failed to attach image:", err);
    }
  }, [attachedImage]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleImageSelect(file);
    },
    [handleImageSelect],
  );

  const clearAttachment = useCallback((revokeUrl = true) => {
    if (revokeUrl && attachedImage?.preview?.startsWith("blob:")) {
      URL.revokeObjectURL(attachedImage.preview);
    }
    setAttachedImage(null);
  }, [attachedImage]);

  const cancelEditingMessage = useCallback(() => {
    setEditingMessageId(null);
    setInput("");
    clearAttachment();
  }, [clearAttachment]);

  const startEditingMessage = useCallback(
    (msg: ChatMessage) => {
      if (msg.role !== "user" || phase === "editing") return;
      clearAttachment();
      setEditingMessageId(msg.id);
      const placeholder = "(annotated image attached)";
      const textOnly =
        msg.content === placeholder ? "" : msg.content.replace(/\s*\(annotated image attached\)\s*$/, "").trim();
      setInput(textOnly);
      if (msg.attachedImageBase64 && msg.attachedImageMimeType) {
        setAttachedImage({
          base64: msg.attachedImageBase64,
          mimeType: msg.attachedImageMimeType,
          preview: `data:${msg.attachedImageMimeType};base64,${msg.attachedImageBase64}`,
        });
      }
      inputRef.current?.focus();
    },
    [clearAttachment, phase],
  );

  if (!sessionId || generatedImages.length === 0) return null;

  if (!isOpen) {
    return (
      <button
        className="id-chat__reopen"
        onClick={() => setIsOpen(true)}
        aria-label="Open Design Chat"
      >
        <MessageSquare className="h-4 w-4" />
        <span>Design Chat</span>
      </button>
    );
  }

  const busy = phase === "editing";

  async function handleSend() {
    const text = input.trim();
    if ((!text && !attachedImage) || busy) return;

    const sentImage = attachedImage;
    const replayId = editingMessageId;

    if (replayId) {
      truncateDesignChatFromUserMessage(replayId);
      setEditingMessageId(null);
    }

    const chatHistory = useInteriorDesignStore.getState().chatMessages.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: "user",
      content: text || (sentImage ? "(annotated image attached)" : ""),
      attachedImagePreview: sentImage?.preview,
      attachedImageBase64: sentImage?.base64,
      attachedImageMimeType: sentImage?.mimeType,
      timestamp: Date.now(),
    };
    addChatMessage(userMsg);

    setInput("");
    clearAttachment(false);
    setPhase("editing");

    try {
      const st = useInteriorDesignStore.getState();
      const currentImage = st.generatedImages[st.selectedImageIndex];
      const compressed = currentImage
        ? await compressImageBase64(currentImage.base64, currentImage.mimeType)
        : undefined;
      const analysisPayload = clarifiedAnalysis ?? roomAnalysis;
      const response = await fetch("/api/interior-design/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          editMessage: text,
          previousPrompt: st.currentPrompt,
          currentImageBase64: compressed?.base64,
          annotatedImageBase64: sentImage?.base64,
          annotatedImageMimeType: sentImage?.mimeType,
          chatHistory,
          roomAnalysis: analysisPayload ? normalizeRoomAnalysisOpenings(analysisPayload) : undefined,
          adminSlug: admin?.slug || "demo",
          catalogAnchorIds: st.designBrief?.selectedCatalogIds ?? [],
          preferredCatalogIds: [...new Set(st.preferredCatalogIdsForAi ?? [])],
        }),
      });

      const json = await response.json();

      if (!response.ok || json.error) {
        throw new Error(json.error || "Edit failed.");
      }

      const newImages: GeneratedImage[] = json.data.images ?? [];
      if (newImages.length > 0) {
        appendGeneratedImages(newImages);
      }

      if (json.data.updatedPrompt) {
        setCurrentPrompt(json.data.updatedPrompt);
      }

      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}-a`,
        role: "assistant",
        content: json.data.message || "Design updated.",
        images: newImages,
        timestamp: Date.now(),
      };
      addChatMessage(assistantMsg);
      setPhase("idle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}-e`,
        role: "assistant",
        content: `Error: ${msg}`,
        timestamp: Date.now(),
      };
      addChatMessage(errorMsg);
      setError(msg);
    }
  }

  return (
    <div
      ref={chatRef}
      className="id-chat"
      style={{ height: chatHeight }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div
        className="id-chat__resize-handle"
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeStart}
      >
        <GripHorizontal className="h-4 w-4" />
      </div>
      <div className="id-chat__header">
        <Bot className="h-4 w-4" />
        <span>Design Chat</span>
        <button
          className="id-chat__close"
          onClick={() => setIsOpen(false)}
          aria-label="Close chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="id-chat__messages">
        {chatMessages.length === 0 && (
          <p className="id-chat__empty">
            Tell me what to change — or upload an annotated screenshot to point out exactly what to
            fix. For example: &quot;Make the walls a lighter shade&quot; or circle an area and say
            &quot;Remove this lamp.&quot;
          </p>
        )}
        {chatMessages.map((msg) => (
          <div key={msg.id} className={`id-chat__msg id-chat__msg--${msg.role}`}>
            <div className="id-chat__avatar">
              {msg.role === "assistant" ? (
                <Bot className="h-3.5 w-3.5" />
              ) : (
                <User className="h-3.5 w-3.5" />
              )}
            </div>
            {msg.role === "user" ? (
              <div className="id-chat__user-column">
                <div className="id-chat__bubble">
                  {msg.content ? <p>{msg.content}</p> : null}
                  {msg.attachedImagePreview && (
                    <div className="id-chat__inline-images">
                      <img
                        src={msg.attachedImagePreview}
                        alt="Annotated reference"
                        className="id-chat__inline-img id-chat__inline-img--annotation"
                      />
                    </div>
                  )}
                </div>
                {!busy && (
                  <button
                    type="button"
                    className="id-chat__edit-msg"
                    onClick={() => startEditingMessage(msg)}
                    aria-label="Edit message"
                  >
                    <Pencil className="h-3 w-3" />
                    <span>Edit</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="id-chat__bubble">
                <p>{msg.content}</p>
                {msg.images && msg.images.length > 0 && (
                  <div className="id-chat__inline-images">
                    {msg.images.map((img) => (
                      <img
                        key={img.id}
                        src={`data:${img.mimeType};base64,${img.base64}`}
                        alt="Updated design"
                        className="id-chat__inline-img"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="id-chat__msg id-chat__msg--assistant">
            <div className="id-chat__avatar">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="id-chat__bubble">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {editingMessageId && (
        <div className="id-chat__edit-banner">
          <span>Editing a previous message — sending removes later replies and newer gallery images.</span>
          <button type="button" className="id-chat__edit-banner-cancel" onClick={cancelEditingMessage}>
            Cancel
          </button>
        </div>
      )}

      {attachedImage && (
        <div className="id-chat__attachment-bar">
          <img src={attachedImage.preview} alt="Attached" className="id-chat__attachment-thumb" />
          <span className="id-chat__attachment-label">Annotated image attached</span>
          <button
            className="id-chat__attachment-remove"
            onClick={() => clearAttachment()}
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="id-chat__input-row">
        <input type="hidden" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="id-chat__file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleImageSelect(file).finally(() => {
                if (fileInputRef.current) fileInputRef.current.value = "";
              });
            }
          }}
        />
        <button
          className="id-chat__attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          type="button"
          title="Attach annotated image"
        >
          <ImagePlus className="h-4 w-4" />
        </button>
        <input
          ref={inputRef}
          type="text"
          className="id-chat__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={attachedImage ? "What should I change in the marked area?" : "Describe what to change..."}
          disabled={busy}
        />
        <button
          className="id-chat__send"
          onClick={handleSend}
          disabled={(!input.trim() && !attachedImage) || busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
