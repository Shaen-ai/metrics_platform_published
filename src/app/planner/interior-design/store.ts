import { create } from "zustand";
import type { RoomAnalysis, DesignBrief } from "@/lib/interiorDesignPrompts";

export interface GeneratedImage {
  id: string;
  base64: string;
  mimeType: string;
  prompt: string;
}

export interface UploadedRoomImage {
  id: string;
  base64: string;
  mimeType: string;
  isPrimary: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: GeneratedImage[];
  attachedImagePreview?: string;
  /** Persisted so an edited message can resend the same annotation. */
  attachedImageBase64?: string;
  attachedImageMimeType?: string;
  timestamp: number;
}

export interface SelectedCatalogProduct {
  id: string;
  name: string;
  image: string;
  price: number;
  currency: string;
}

type Phase = "idle" | "uploading" | "analyzing" | "clarifying" | "generating" | "editing" | "extracting";

const MAX_ROOM_IMAGES = 4;

interface InteriorDesignState {
  /* Session */
  sessionId: string | null;
  phase: Phase;
  error: string | null;

  /* Inputs — multi-image */
  uploadedImages: UploadedRoomImage[];
  textPrompt: string;

  /** Derived single-image accessors for backward compat (primary image or first). */
  readonly uploadedImageBase64: string | null;
  readonly uploadedImageMimeType: string | null;

  /* Analysis */
  roomAnalysis: RoomAnalysis | null;
  clarifiedAnalysis: RoomAnalysis | null;

  /* Generation */
  designBrief: DesignBrief | null;
  generatedImages: GeneratedImage[];
  selectedImageIndex: number;

  /* Chat */
  chatMessages: ChatMessage[];
  currentPrompt: string | null;

  /** Optional SKU ids to pin into AI Creative Director retrieval (comma / JSON parsed client-side). */
  preferredCatalogIdsForAi: string[];

  /** Lightweight product summaries for the selected catalog items (drives chip display in sidebar). */
  selectedCatalogProducts: SelectedCatalogProduct[];

  /* Actions */
  setPhase: (phase: Phase) => void;
  setError: (error: string | null) => void;
  /** @deprecated Use addUploadedImage / removeUploadedImage instead. */
  setUploadedImage: (base64: string | null, mimeType: string | null) => void;
  addUploadedImage: (base64: string, mimeType: string) => void;
  removeUploadedImage: (id: string) => void;
  setPrimaryImage: (id: string) => void;
  setTextPrompt: (text: string) => void;
  setRoomAnalysis: (analysis: RoomAnalysis | null) => void;
  setClarifiedAnalysis: (analysis: RoomAnalysis | null) => void;
  setDesignBrief: (brief: DesignBrief | null) => void;
  setGeneratedImages: (images: GeneratedImage[]) => void;
  setSelectedImageIndex: (index: number) => void;
  setSessionId: (id: string | null) => void;
  setCurrentPrompt: (prompt: string | null) => void;
  setPreferredCatalogIdsForAi: (ids: string[]) => void;
  setSelectedCatalogProducts: (products: SelectedCatalogProduct[]) => void;
  addChatMessage: (msg: ChatMessage) => void;
  /** Removes this user message and all messages after it; drops gallery images produced in those turns. */
  truncateDesignChatFromUserMessage: (userMessageId: string) => void;
  appendGeneratedImages: (images: GeneratedImage[]) => void;
  resetSession: () => void;
}

function primaryImage(images: UploadedRoomImage[]): UploadedRoomImage | undefined {
  return images.find((i) => i.isPrimary) ?? images[0];
}

const initialState = {
  sessionId: null as string | null,
  phase: "idle" as Phase,
  error: null as string | null,
  uploadedImages: [] as UploadedRoomImage[],
  uploadedImageBase64: null as string | null,
  uploadedImageMimeType: null as string | null,
  textPrompt: "",
  roomAnalysis: null as RoomAnalysis | null,
  clarifiedAnalysis: null as RoomAnalysis | null,
  designBrief: null as DesignBrief | null,
  generatedImages: [] as GeneratedImage[],
  selectedImageIndex: 0,
  chatMessages: [] as ChatMessage[],
  currentPrompt: null as string | null,
  preferredCatalogIdsForAi: [] as string[],
  selectedCatalogProducts: [] as SelectedCatalogProduct[],
};

function derivedImageFields(images: UploadedRoomImage[]) {
  const p = primaryImage(images);
  return {
    uploadedImageBase64: p?.base64 ?? null,
    uploadedImageMimeType: p?.mimeType ?? null,
  };
}

export const useInteriorDesignStore = create<InteriorDesignState>((set) => ({
  ...initialState,

  setPhase: (phase) => set({ phase, error: phase === "idle" ? null : undefined }),
  setError: (error) => set({ error, phase: "idle" }),

  setUploadedImage: (base64, mimeType) => {
    if (!base64 || !mimeType) {
      set({ uploadedImages: [], uploadedImageBase64: null, uploadedImageMimeType: null });
    } else {
      const img: UploadedRoomImage = {
        id: `img-${Date.now()}`,
        base64,
        mimeType,
        isPrimary: true,
      };
      set({
        uploadedImages: [img],
        ...derivedImageFields([img]),
      });
    }
  },

  addUploadedImage: (base64, mimeType) =>
    set((s) => {
      if (s.uploadedImages.length >= MAX_ROOM_IMAGES) return s;
      const isFirst = s.uploadedImages.length === 0;
      const img: UploadedRoomImage = {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        base64,
        mimeType,
        isPrimary: isFirst,
      };
      const next = [...s.uploadedImages, img];
      return { uploadedImages: next, ...derivedImageFields(next) };
    }),

  removeUploadedImage: (id) =>
    set((s) => {
      const next = s.uploadedImages.filter((i) => i.id !== id);
      if (next.length > 0 && !next.some((i) => i.isPrimary)) {
        next[0]!.isPrimary = true;
      }
      return {
        uploadedImages: next,
        ...derivedImageFields(next),
        roomAnalysis: null,
        clarifiedAnalysis: null,
      };
    }),

  setPrimaryImage: (id) =>
    set((s) => {
      const next = s.uploadedImages.map((i) => ({ ...i, isPrimary: i.id === id }));
      return { uploadedImages: next, ...derivedImageFields(next) };
    }),

  setTextPrompt: (text) => set({ textPrompt: text }),
  setRoomAnalysis: (analysis) => set({ roomAnalysis: analysis }),
  setClarifiedAnalysis: (analysis) => set({ clarifiedAnalysis: analysis }),
  setDesignBrief: (brief) => set({ designBrief: brief }),
  setGeneratedImages: (images) => set({ generatedImages: images, selectedImageIndex: 0 }),
  setSelectedImageIndex: (index) => set({ selectedImageIndex: index }),
  setSessionId: (id) => set({ sessionId: id }),
  setCurrentPrompt: (prompt) => set({ currentPrompt: prompt }),
  setPreferredCatalogIdsForAi: (ids) => set({ preferredCatalogIdsForAi: ids }),
  setSelectedCatalogProducts: (products) =>
    set({ selectedCatalogProducts: products, preferredCatalogIdsForAi: products.map((p) => p.id) }),
  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),
  truncateDesignChatFromUserMessage: (userMessageId) =>
    set((s) => {
      const idx = s.chatMessages.findIndex((m) => m.id === userMessageId && m.role === "user");
      if (idx < 0) return s;

      const suffix = s.chatMessages.slice(idx);
      const removedIds = new Set<string>();
      for (const m of suffix) {
        if (m.role === "assistant" && m.images?.length) {
          for (const img of m.images) removedIds.add(img.id);
        }
      }

      const newGenerated = s.generatedImages.filter((img) => !removedIds.has(img.id));
      const lastImg = newGenerated[newGenerated.length - 1];
      const nextPrompt = lastImg?.prompt ?? s.currentPrompt;

      return {
        chatMessages: s.chatMessages.slice(0, idx),
        generatedImages: newGenerated,
        selectedImageIndex: Math.max(0, newGenerated.length - 1),
        currentPrompt: nextPrompt ?? null,
      };
    }),
  appendGeneratedImages: (images) =>
    set((s) => ({
      generatedImages: [...s.generatedImages, ...images],
      selectedImageIndex: s.generatedImages.length,
    })),
  resetSession: () => set(initialState),
}));
