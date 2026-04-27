"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useStore } from "@/lib/store";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { formatPrice } from "@/lib/utils";
import {
  ArrowLeft,
  Square,
  Circle,
  Trash2,
  RotateCw,
  Palette,
  Box,
  Plus,
  Ruler,
  Package,
  Layers,
  X,
  Home,
  Settings,
  Search,
  Save,
  Camera,
  ZoomIn,
  ZoomOut,
  List,
  Heart,
  ChevronDown,
  Info,
  Layout,
} from "lucide-react";

// Dynamically import Three.js components to avoid SSR issues
const Viewer3D = dynamic(() => import("@/components/editor/Viewer3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[var(--muted)]">
      Loading 3D Viewer...
    </div>
  ),
});

// Dynamically import AI Chat component
const AIChat = dynamic(() => import("@/components/editor/AIChat"), {
  ssr: false,
});

export function EditorWorkspace({
  embeddedInPlanner = false,
}: {
  embeddedInPlanner?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<any>(null);
  const [activeTab, setActiveTab] = useState<"2d" | "3d">("3d");
  const [selectedObject, setSelectedObject] = useState<any>(null);
  const [showModules, setShowModules] = useState(false);
  const [dimensionUnit, setDimensionUnit] = useState<"cm" | "in">("cm");
  const [roomSettings, setRoomSettings] = useState({
    width: 400, // cm
    height: 300, // cm
    roomType: "living-room" as "bedroom" | "living-room" | "kitchen" | "bathroom" | "office" | "custom",
  });
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [showRoomSetup, setShowRoomSetup] = useState(false);
  const [catalogTab, setCatalogTab] = useState<"add" | "list" | "favorites">("add");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"dollhouse" | "top" | "side">("dollhouse");
  const [designName, setDesignName] = useState("Untitled Design");
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);

  const {
    canvasObjects,
    materials,
    modules,
    catalogItems,
    addCanvasObject,
    updateCanvasObject,
    removeCanvasObject,
    clearCanvas,
    admin,
    initializeStore,
  } = useStore();

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const designTotal = canvasObjects.reduce((total, obj) => {
    // Calculate price based on dimensions (simplified pricing)
    const basePrice = 50; // Base price per object
    const volumePrice = (obj.width * obj.height * obj.depth) / 1000; // Volume-based pricing
    return total + basePrice + volumePrice;
  }, 0);

  // Filter products based on search
  const filteredProducts = [...modules, ...catalogItems].filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      ("description" in item && item.description.toLowerCase().includes(query))
    );
  });

  // Canvas dimensions and adaptive scale - ensures room always fits on screen
  const CANVAS_WIDTH = 800;
  const CANVAS_HEIGHT = 600;
  const CANVAS_PADDING = 80;
  const getRoomScale = () => {
    const baseScale = dimensionUnit === "cm" ? 2 : 5;
    const maxW = (CANVAS_WIDTH - CANVAS_PADDING * 2) / roomSettings.width;
    const maxH = (CANVAS_HEIGHT - CANVAS_PADDING * 2) / roomSettings.height;
    return Math.min(baseScale, maxW, maxH);
  };

  // Room templates (IKEA style - standard room sizes)
  const roomTemplates = {
    bedroom: { width: 400, height: 350 },
    "living-room": { width: 500, height: 400 },
    kitchen: { width: 350, height: 300 },
    bathroom: { width: 250, height: 300 },
    office: { width: 400, height: 300 },
  };

  // Update room visualization
  const updateRoomVisualization = async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const { Rect, Pattern } = await import("fabric");
    
    // Remove existing room elements
    const objectsToRemove = canvas.getObjects().filter((obj: any) => 
      obj.isRoomWall || obj.isRoomGrid || obj.isRoomFloor
    );
    objectsToRemove.forEach((obj: any) => canvas.remove(obj));

    const scale = getRoomScale();
    const roomWidth = roomSettings.width * scale;
    const roomHeight = roomSettings.height * scale;
    const offsetX = (CANVAS_WIDTH - roomWidth) / 2;
    const offsetY = (CANVAS_HEIGHT - roomHeight) / 2 + 35; // Slightly lower for better visual balance

    // Set canvas background (IKEA style - light gray)
    canvas.backgroundColor = "#f8f9fa";
    canvas.renderAll();

    // Draw grid (always visible, IKEA style)
    const gridSize = 25;
    for (let x = 0; x <= CANVAS_WIDTH; x += gridSize) {
      const line = new Rect({
        left: x,
        top: 0,
        width: 1,
        height: CANVAS_HEIGHT,
        fill: "rgba(0, 0, 0, 0.03)",
        selectable: false,
        evented: false,
      });
      (line as any).isRoomGrid = true;
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }
    for (let y = 0; y <= CANVAS_HEIGHT; y += gridSize) {
      const line = new Rect({
        left: 0,
        top: y,
        width: CANVAS_WIDTH,
        height: 1,
        fill: "rgba(0, 0, 0, 0.03)",
        selectable: false,
        evented: false,
      });
      (line as any).isRoomGrid = true;
      canvas.add(line);
      canvas.sendObjectToBack(line);
    }

    // Draw room floor (parquet style)
    const parquetCanvas = document.createElement("canvas");
    parquetCanvas.width = 48;
    parquetCanvas.height = 24;
    const pctx = parquetCanvas.getContext("2d")!;
    const tileW = 24;
    const tileH = 12;
    const grout = "#d4cfc4";
    const tileColors = ["#e8e4dc", "#ddd9d0", "#e2ded6"];
    pctx.fillStyle = grout;
    pctx.fillRect(0, 0, 48, 24);
    for (let row = -1; row < 3; row++) {
      for (let col = -1; col < 3; col++) {
        const offsetX = (row % 2) * (tileW / 2);
        const x = col * tileW + offsetX;
        const y = row * tileH;
        pctx.save();
        pctx.translate(x + tileW / 2, y + tileH / 2);
        pctx.rotate((row % 2 === 0 ? 1 : -1) * 0.46);
        pctx.fillStyle = tileColors[(row + col + 2) % 3];
        pctx.fillRect(-tileW / 2 + 1, -tileH / 2 + 1, tileW - 2, tileH - 2);
        pctx.restore();
      }
    }
    const parquetPattern = new Pattern({
      source: parquetCanvas,
      repeat: "repeat",
    });

    const roomFloor = new Rect({
      left: offsetX,
      top: offsetY,
      width: roomWidth,
      height: roomHeight,
      fill: parquetPattern,
      stroke: "#d1d5db",
      strokeWidth: 2,
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
      lockRotation: true,
      lockUniScaling: false,
    });
    (roomFloor as any).isRoomFloor = true;
    (roomFloor as any).roomId = "room-floor";
    canvas.add(roomFloor);
    canvas.sendObjectToBack(roomFloor);

    // Draw walls (IKEA style - clean gray walls)
    const wallThickness = 17;
    const walls = [
      { left: offsetX - wallThickness, top: offsetY - wallThickness, width: roomWidth + wallThickness * 2, height: wallThickness, side: "top" },
      { left: offsetX - wallThickness, top: offsetY + roomHeight, width: roomWidth + wallThickness * 2, height: wallThickness, side: "bottom" },
      { left: offsetX - wallThickness, top: offsetY - wallThickness, width: wallThickness, height: roomHeight + wallThickness * 2, side: "left" },
      { left: offsetX + roomWidth, top: offsetY - wallThickness, width: wallThickness, height: roomHeight + wallThickness * 2, side: "right" },
    ];

    walls.forEach((wall) => {
      const wallRect = new Rect({
        left: wall.left,
        top: wall.top,
        width: wall.width,
        height: wall.height,
        fill: "#e5e7eb",
        stroke: "#9ca3af",
        strokeWidth: 1,
        selectable: false,
        evented: false,
      });
      (wallRect as any).isRoomWall = true;
      (wallRect as any).wallSide = wall.side;
      (wallRect as any).roomId = "room-wall";
      canvas.add(wallRect);
      canvas.sendObjectToBack(wallRect);
    });

    // Ensure room elements stay in background
    canvas.getObjects().forEach((obj: any) => {
      if (obj.isRoomWall || obj.isRoomGrid || obj.isRoomFloor) {
        canvas.sendObjectToBack(obj);
      }
    });

    canvas.renderAll();
  };

  const applyRoomTemplate = (template: keyof typeof roomTemplates) => {
    const templateData = roomTemplates[template];
    setRoomSettings({
      ...roomSettings,
      width: templateData.width,
      height: templateData.height,
      roomType: template,
    });
  };

  // Initialize Fabric.js
  useEffect(() => {
    if (!canvasRef.current) return;

    const initFabric = async () => {
      // Dispose existing canvas if it exists
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }

      const { Canvas, Rect, Circle, Pattern } = await import("fabric");
      const canvasElement = canvasRef.current;
      if (!canvasElement) return;

      // Check if canvas element already has a Fabric instance
      if ((canvasElement as any).__canvas) {
        (canvasElement as any).__canvas.dispose();
      }

      const canvas = new Canvas(canvasElement, {
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        backgroundColor: "#f5f5f5",
        selection: true,
      });

      fabricRef.current = canvas;

      // Adaptive scale - ensures room always fits on screen
      const scale = getRoomScale();

      // IKEA-style room definition: Always show room with clear boundaries
      const roomWidth = roomSettings.width * scale;
      const roomHeight = roomSettings.height * scale;
      const offsetX = (CANVAS_WIDTH - roomWidth) / 2;
      const offsetY = (CANVAS_HEIGHT - roomHeight) / 2 + 35; // Slightly lower for better visual balance

      // Set canvas background to light gray (IKEA style)
      canvas.backgroundColor = "#f8f9fa";

      // Draw grid (always visible, IKEA style)
      const gridSize = 25; // Smaller grid for precision
      for (let x = 0; x <= CANVAS_WIDTH; x += gridSize) {
        const line = new Rect({
          left: x,
          top: 0,
          width: 1,
          height: CANVAS_HEIGHT,
          fill: "rgba(0, 0, 0, 0.03)",
          selectable: false,
          evented: false,
        });
        (line as any).isRoomGrid = true;
        canvas.add(line);
        canvas.sendObjectToBack(line);
      }
      for (let y = 0; y <= CANVAS_HEIGHT; y += gridSize) {
        const line = new Rect({
          left: 0,
          top: y,
          width: CANVAS_WIDTH,
          height: 1,
          fill: "rgba(0, 0, 0, 0.03)",
          selectable: false,
          evented: false,
        });
        (line as any).isRoomGrid = true;
        canvas.add(line);
        canvas.sendObjectToBack(line);
      }

      // Draw room floor (parquet style)
      const parquetCanvas = document.createElement("canvas");
      parquetCanvas.width = 48;
      parquetCanvas.height = 24;
      const pctx = parquetCanvas.getContext("2d")!;
      const tileW = 24;
      const tileH = 12;
      const grout = "#d4cfc4";
      const tileColors = ["#e8e4dc", "#ddd9d0", "#e2ded6"];
      pctx.fillStyle = grout;
      pctx.fillRect(0, 0, 48, 24);
      for (let row = -1; row < 3; row++) {
        for (let col = -1; col < 3; col++) {
          const offsetX = (row % 2) * (tileW / 2);
          const x = col * tileW + offsetX;
          const y = row * tileH;
          pctx.save();
          pctx.translate(x + tileW / 2, y + tileH / 2);
          pctx.rotate((row % 2 === 0 ? 1 : -1) * 0.46);
          pctx.fillStyle = tileColors[(row + col + 2) % 3];
          pctx.fillRect(-tileW / 2 + 1, -tileH / 2 + 1, tileW - 2, tileH - 2);
          pctx.restore();
        }
      }
      const parquetPattern = new Pattern({
        source: parquetCanvas,
        repeat: "repeat",
      });

      const roomFloor = new Rect({
        left: offsetX,
        top: offsetY,
        width: roomWidth,
        height: roomHeight,
        fill: parquetPattern,
        stroke: "#d1d5db",
        strokeWidth: 2,
        selectable: true,
        evented: true,
        hasControls: true,
        hasBorders: true,
        lockRotation: true,
        lockUniScaling: false,
      });
      (roomFloor as any).isRoomFloor = true;
      (roomFloor as any).roomId = "room-floor";
      canvas.add(roomFloor);
      canvas.sendObjectToBack(roomFloor);

      // Draw walls (IKEA style - clean gray walls with thickness)
      const wallThickness = 17;
      const walls = [
        { left: offsetX - wallThickness, top: offsetY - wallThickness, width: roomWidth + wallThickness * 2, height: wallThickness, side: "top" },
        { left: offsetX - wallThickness, top: offsetY + roomHeight, width: roomWidth + wallThickness * 2, height: wallThickness, side: "bottom" },
        { left: offsetX - wallThickness, top: offsetY - wallThickness, width: wallThickness, height: roomHeight + wallThickness * 2, side: "left" },
        { left: offsetX + roomWidth, top: offsetY - wallThickness, width: wallThickness, height: roomHeight + wallThickness * 2, side: "right" },
      ];

      walls.forEach((wall) => {
        const wallRect = new Rect({
          left: wall.left,
          top: wall.top,
          width: wall.width,
          height: wall.height,
          fill: "#e5e7eb",
          stroke: "#9ca3af",
          strokeWidth: 1,
          selectable: false,
          evented: false,
        });
        (wallRect as any).isRoomWall = true;
        (wallRect as any).wallSide = wall.side;
        (wallRect as any).roomId = "room-wall";
        canvas.add(wallRect);
        canvas.sendObjectToBack(wallRect);
      });

      // Handle selection
      canvas.on("selection:created", (e: any) => {
        const obj = e.selected?.[0];
        if (obj) {
          // Don't select room floor/walls as regular objects
          if (!obj.isRoomFloor && !obj.isRoomWall) {
            setSelectedObject(obj);
          } else {
            // Room floor/wall selected - show room properties
            setSelectedObject(obj);
          }
        }
      });

      canvas.on("selection:updated", (e: any) => {
        const obj = e.selected?.[0];
        if (obj) {
          if (!obj.isRoomFloor && !obj.isRoomWall) {
            setSelectedObject(obj);
          } else {
            setSelectedObject(obj);
          }
        }
      });

      canvas.on("selection:cleared", () => {
        setSelectedObject(null);
      });

      // Handle object modifications
      canvas.on("object:modified", (e: any) => {
        const obj = e.target;
        
        // Handle room floor resize
        if (obj?.isRoomFloor) {
          const currentScale = getRoomScale();
          const newWidth = obj.width ? obj.width / currentScale : roomSettings.width;
          const newHeight = obj.height ? obj.height / currentScale : roomSettings.height;
          setRoomSettings({
            ...roomSettings,
            width: Math.max(100, newWidth), // Minimum 100cm
            height: Math.max(100, newHeight), // Minimum 100cm
          });
          canvas.renderAll();
          return;
        }

        // Handle wall modifications
        if (obj?.isRoomWall) {
          const currentScale = getRoomScale();
          const roomWidth = roomSettings.width * currentScale;
          const roomHeight = roomSettings.height * currentScale;
          const offsetX = (CANVAS_WIDTH - roomWidth) / 2;
          const offsetY = (CANVAS_HEIGHT - roomHeight) / 2 + 35;

          // Update room dimensions based on wall position
          if (obj.wallSide === "right") {
            const newWidth = (obj.left + obj.width - offsetX) / currentScale;
            setRoomSettings({ ...roomSettings, width: Math.max(100, newWidth) });
          } else if (obj.wallSide === "bottom") {
            const newHeight = (obj.top + obj.height - offsetY) / currentScale;
            setRoomSettings({ ...roomSettings, height: Math.max(100, newHeight) });
          }
          canvas.renderAll();
          return;
        }

        // Handle regular object modifications
        if (obj?.id) {
          const currentScale = getRoomScale();
          updateCanvasObject(obj.id, {
            x: obj.left || 0,
            y: obj.top || 0,
            width: obj.width ? obj.width / currentScale : 0,
            height: obj.height ? obj.height / currentScale : 0,
            rotation: obj.angle || 0,
          });
        }
      });

      // Load existing objects
      canvasObjects.forEach((obj) => {
        if (obj.type === "rect") {
          const pixelWidth = obj.width * scale;
          const pixelHeight = obj.height * scale;
          const rect = new Rect({
            left: obj.x,
            top: obj.y,
            width: pixelWidth,
            height: pixelHeight,
            fill: obj.color,
            angle: obj.rotation,
            stroke: obj.name?.includes("Module") || obj.name?.toLowerCase().includes("module") ? "#1e40af" : undefined,
            strokeWidth: obj.name?.includes("Module") || obj.name?.toLowerCase().includes("module") ? 2 : 0,
          });
          (rect as any).id = obj.id;
          canvas.add(rect);
        } else if (obj.type === "circle") {
          const pixelRadius = (obj.width / 2) * scale;
          const circle = new Circle({
            left: obj.x,
            top: obj.y,
            radius: pixelRadius,
            fill: obj.color,
            angle: obj.rotation,
          });
          (circle as any).id = obj.id;
          canvas.add(circle);
        }
      });

      canvas.renderAll();
    };

    initFabric();

    return () => {
      if (fabricRef.current) {
        try {
          fabricRef.current.dispose();
        } catch (e) {
          // Canvas might already be disposed
          console.warn("Error disposing canvas:", e);
        }
        fabricRef.current = null;
      }
    };
  }, [roomSettings.width, roomSettings.height, dimensionUnit]); // Re-initialize when room settings change

  // Sync canvas objects when they change (add new ones)
  useEffect(() => {
    const syncObjects = async () => {
      const canvas = fabricRef.current;
      if (!canvas) return;

      const { Rect, Circle } = await import("fabric");
      const scale = getRoomScale();
      
      // Get existing object IDs on canvas (excluding room walls/grid/floor)
      const canvasObjectIds = canvas.getObjects()
        .filter((obj: any) => !obj.isRoomWall && !obj.isRoomGrid && !obj.isRoomFloor)
        .map((obj: any) => obj.id)
        .filter(Boolean);
      
      // Add new objects that aren't on canvas yet
      canvasObjects.forEach((obj) => {
        if (!canvasObjectIds.includes(obj.id)) {
          if (obj.type === "rect") {
            const pixelWidth = obj.width * scale;
            const pixelHeight = obj.height * scale;
            const rect = new Rect({
              left: obj.x,
              top: obj.y,
              width: pixelWidth,
              height: pixelHeight,
              fill: obj.color,
              angle: obj.rotation,
              stroke: obj.name?.toLowerCase().includes("module") ? "#1e40af" : undefined,
              strokeWidth: obj.name?.toLowerCase().includes("module") ? 2 : 0,
            });
            (rect as any).id = obj.id;
            canvas.add(rect);
          } else if (obj.type === "circle") {
            const pixelRadius = (obj.width / 2) * scale;
            const circle = new Circle({
              left: obj.x,
              top: obj.y,
              radius: pixelRadius,
              fill: obj.color,
              angle: obj.rotation,
            });
            (circle as any).id = obj.id;
            canvas.add(circle);
          }
        }
      });

      // Remove objects that are no longer in canvasObjects (but keep room walls/grid/floor)
      const objectIds = new Set(canvasObjects.map((o) => o.id));
      canvas.getObjects().forEach((obj: any) => {
        if (obj.id && !objectIds.has(obj.id) && !obj.isRoomWall && !obj.isRoomGrid && !obj.isRoomFloor) {
          canvas.remove(obj);
        }
      });

      // Ensure room walls/grid/floor stay in background
      canvas.getObjects().forEach((obj: any) => {
        if (obj.isRoomWall || obj.isRoomGrid || obj.isRoomFloor) {
          canvas.sendObjectToBack(obj);
        }
      });

      canvas.renderAll();
    };

    syncObjects();
  }, [canvasObjects, dimensionUnit]);

  // Update room visualization when settings change
  useEffect(() => {
    if (fabricRef.current) {
      updateRoomVisualization();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomSettings.width, roomSettings.height, dimensionUnit]);

  const addRectangle = async () => {
    const { Rect } = await import("fabric");
    const canvas = fabricRef.current;
    if (!canvas) return;

    const id = `obj-${Date.now()}`;
    const defaultWidth = dimensionUnit === "cm" ? 50 : 20; // 50cm or 20in
    const defaultHeight = dimensionUnit === "cm" ? 30 : 12; // 30cm or 12in
    const scale = getRoomScale();
    
    const rect = new Rect({
      left: 100,
      top: 100,
      width: defaultWidth * scale,
      height: defaultHeight * scale,
      fill: "#3b82f6",
    });
    (rect as any).id = id;

    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.renderAll();

    addCanvasObject({
      id,
      type: "rect",
      furnitureType: "custom-rect",
      name: "Rectangle",
      x: 100,
      y: 100,
      width: defaultWidth,
      height: defaultHeight,
      depth: dimensionUnit === "cm" ? 30 : 12,
      rotation: 0,
      color: "#3b82f6",
    });
  };

  const addCircle = async () => {
    const { Circle } = await import("fabric");
    const canvas = fabricRef.current;
    if (!canvas) return;

    const id = `obj-${Date.now()}`;
    const defaultDiameter = dimensionUnit === "cm" ? 40 : 16; // 40cm or 16in diameter
    const scale = getRoomScale();
    const radius = (defaultDiameter / 2) * scale;
    
    const circle = new Circle({
      left: 150,
      top: 150,
      radius: radius,
      fill: "#10b981",
    });
    (circle as any).id = id;

    canvas.add(circle);
    canvas.setActiveObject(circle);
    canvas.renderAll();

    addCanvasObject({
      id,
      type: "circle",
      furnitureType: "custom-circle",
      name: "Circle",
      x: 150,
      y: 150,
      width: defaultDiameter,
      height: defaultDiameter,
      depth: dimensionUnit === "cm" ? 30 : 12,
      rotation: 0,
      color: "#10b981",
    });
  };

  const deleteSelected = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();
    if (activeObject && (activeObject as any).id) {
      removeCanvasObject((activeObject as any).id);
      canvas.remove(activeObject);
      canvas.renderAll();
      setSelectedObject(null);
    }
  };

  const handleColorChange = async (color: string) => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedObject) return;

    selectedObject.set("fill", color);
    canvas.renderAll();

    if (selectedObject.id) {
      updateCanvasObject(selectedObject.id, { color });
    }
  };

  const addModuleToCanvas = async (module: typeof modules[0]) => {
    const { Rect } = await import("fabric");
    const canvas = fabricRef.current;
    if (!canvas) return;

    const id = `module-${module.id}-${Date.now()}`;
    const width = module.dimensions.width;
    const height = module.dimensions.height;
    
    // Convert dimensions to pixels
    const scale = getRoomScale();
    const pixelWidth = width * scale;
    const pixelHeight = height * scale;

    const rect = new Rect({
      left: 200,
      top: 200,
      width: pixelWidth,
      height: pixelHeight,
      fill: "#3b82f6",
      stroke: "#1e40af",
      strokeWidth: 2,
    });
    (rect as any).id = id;
    (rect as any).moduleId = module.id;
    (rect as any).isModule = true;

    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.renderAll();

    addCanvasObject({
      id,
      type: "rect",
      furnitureType: "custom-rect",
      name: module.name,
      x: 200,
      y: 200,
      width: module.dimensions.width,
      height: module.dimensions.height,
      depth: module.dimensions.depth,
      rotation: 0,
      color: "#3b82f6",
    });
  };

  const handleDimensionChange = (field: "width" | "height" | "depth", value: number) => {
    const canvas = fabricRef.current;
    if (!canvas || !selectedObject) return;

    const obj = canvasObjects.find((o) => o.id === selectedObject.id);
    if (!obj) return;

    if (value <= 0) return; // Prevent invalid dimensions

    const updates: Partial<typeof obj> = { [field]: value };
    
    // Update 2D canvas if width or height changed
    if (field === "width" || field === "height") {
      const scale = getRoomScale();
      const currentObj = canvasObjects.find((o) => o.id === selectedObject.id);
      if (!currentObj) return;

      const newWidth = field === "width" ? value : currentObj.width;
      const newHeight = field === "height" ? value : currentObj.height;
      
      selectedObject.set({
        width: newWidth * scale,
        height: newHeight * scale,
        scaleX: 1,
        scaleY: 1,
      });
      canvas.renderAll();
    }

    updateCanvasObject(selectedObject.id, updates);
    
    // Update the selected object reference to reflect changes
    setTimeout(() => {
      const updatedObj = canvas.getActiveObject();
      if (updatedObj) {
        setSelectedObject(updatedObj);
      }
    }, 0);
  };

  const handleAIAction = async (action: {
    type: "create" | "modify" | "delete" | "clear";
    objects?: Partial<any>[];
    message?: string;
  }) => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    if (action.type === "clear") {
      clearCanvas();
      canvas.clear();
      canvas.renderAll();
      return;
    }

    if (action.type === "create" && action.objects) {
      const { Rect, Circle } = await import("fabric");
      const scale = getRoomScale();

      action.objects.forEach((objData) => {
        const id = `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const x = objData.x || 200 + Math.random() * 200;
        const y = objData.y || 200 + Math.random() * 200;
        const width = objData.width || 50;
        const height = objData.height || 30;
        const depth = objData.depth || 30;
        const color = objData.color || "#3b82f6";

        if (objData.type === "circle") {
          const pixelRadius = (width / 2) * scale;
          const circle = new Circle({
            left: x,
            top: y,
            radius: pixelRadius,
            fill: color,
          });
          (circle as any).id = id;
          canvas.add(circle);
          canvas.setActiveObject(circle);
        } else {
          const pixelWidth = width * scale;
          const pixelHeight = height * scale;
          const rect = new Rect({
            left: x,
            top: y,
            width: pixelWidth,
            height: pixelHeight,
            fill: color,
          });
          (rect as any).id = id;
          canvas.add(rect);
          canvas.setActiveObject(rect);
        }

        addCanvasObject({
          id,
          type: objData.type || "rect",
          furnitureType: objData.type === "circle" ? "custom-circle" : "custom-rect",
          name: objData.name || "AI Created",
          x,
          y,
          width,
          height,
          depth,
          rotation: 0,
          color,
        });
      });

      canvas.renderAll();
    }

    if (action.type === "delete" && action.objects) {
      // Delete objects by matching properties
      action.objects.forEach((objData) => {
        const obj = canvasObjects.find(
          (o) =>
            o.name === objData.name ||
            (objData.width && Math.abs(o.width - objData.width) < 1) ||
            (objData.color && o.color === objData.color)
        );
        if (obj) {
          const canvasObj = canvas.getObjects().find((o: any) => o.id === obj.id);
          if (canvasObj) {
            canvas.remove(canvasObj);
          }
          removeCanvasObject(obj.id);
        }
      });
      canvas.renderAll();
    }
  };

  return (
    <div
      className={
        embeddedInPlanner
          ? "h-full min-h-0 min-w-0 flex flex-col bg-[var(--background)]"
          : "min-h-screen bg-[var(--background)]"
      }
    >
      {/* Room Setup Modal */}
      {showRoomSetup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto translate-y-4">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl font-bold">Select & Customize Your Room</CardTitle>
                <button
                  onClick={() => setShowRoomSetup(false)}
                  className="p-2 hover:bg-[var(--muted)] rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Room Type Selection */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Choose Room Type</h3>
                <div className="grid grid-cols-3 gap-4">
                  {(["bedroom", "living-room", "kitchen", "bathroom", "office", "custom"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setRoomSettings({ ...roomSettings, roomType: type });
                        if (type !== "custom") {
                          const template = roomTemplates[type];
                          if (template) {
                            setRoomSettings({ ...roomSettings, roomType: type, width: template.width, height: template.height });
                          }
                        }
                      }}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        roomSettings.roomType === type
                          ? "border-[var(--primary)] bg-[var(--primary)]/10"
                          : "border-[var(--border)] hover:border-[var(--primary)]/50"
                      }`}
                    >
                      <div className="text-3xl mb-2">
                        {type === "bedroom" && "🛏️"}
                        {type === "living-room" && "🛋️"}
                        {type === "kitchen" && "🍳"}
                        {type === "bathroom" && "🚿"}
                        {type === "office" && "💼"}
                        {type === "custom" && "📐"}
                      </div>
                      <div className="text-sm font-semibold capitalize">
                        {type.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Room Dimensions */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Room Dimensions</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Width ({dimensionUnit})</label>
                    <input
                      type="number"
                      value={roomSettings.width}
                      onChange={(e) =>
                        setRoomSettings({ ...roomSettings, width: Math.max(100, parseFloat(e.target.value) || 100) })
                      }
                      min="100"
                      step="10"
                      className="w-full px-4 py-2 border-2 border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Height ({dimensionUnit})</label>
                    <input
                      type="number"
                      value={roomSettings.height}
                      onChange={(e) =>
                        setRoomSettings({ ...roomSettings, height: Math.max(100, parseFloat(e.target.value) || 100) })
                      }
                      min="100"
                      step="10"
                      className="w-full px-4 py-2 border-2 border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    />
                  </div>
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mt-2">
                  💡 You can adjust these later in the room settings
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => {
                    setShowRoomSetup(false);
                    updateRoomVisualization();
                  }}
                  className="flex-1"
                >
                  Start Designing
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowRoomSetup(false)}
                >
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* IKEA Style Layout */}
      <div className="flex h-screen overflow-hidden">
        {/* Left Panel - Product Catalog (IKEA Style) */}
        <div className="w-96 border-r border-[var(--border)] bg-[var(--background)] flex flex-col">
          {/* Catalog Header */}
          <div className="p-4 border-b border-[var(--border)]">
            <div className="flex items-center justify-between mb-4">
              <Link href="/" className="p-1.5 hover:bg-[var(--muted)] rounded transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <input
                type="text"
                value={designName}
                onChange={(e) => setDesignName(e.target.value)}
                className="flex-1 mx-2 px-3 py-1.5 text-sm font-medium bg-transparent border-none focus:outline-none focus:bg-[var(--muted)] rounded"
              />
              <button className="p-1.5 hover:bg-[var(--muted)] rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Catalog Tabs */}
            <div className="flex gap-1 border-b border-[var(--border)]">
              {(["add", "list", "favorites"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setCatalogTab(tab)}
                  className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                    catalogTab === tab
                      ? "text-[var(--primary)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {tab === "add" && "Add"}
                  {tab === "list" && "List"}
                  {tab === "favorites" && "Favorites"}
                  {catalogTab === tab && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--primary)]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Search Bar */}
          <div className="p-4 border-b border-[var(--border)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
              <input
                type="text"
                placeholder="What are you looking for?"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-[var(--muted)] border border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
              />
            </div>
          </div>

          {/* Product List */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Featured items</h3>
              <button className="text-xs text-[var(--primary)] hover:underline">Show more products</button>
            </div>

            <div className="space-y-3">
              {filteredProducts.slice(0, 10).map((item) => {
                const isModule = "connectionPoints" in item;
                const imageUrl = isModule ? item.imageUrl : item.images?.[0];
                const price = item.price;
                const currency = item.currency || "USD";

                return (
                  <button
                    key={item.id}
                    onClick={async () => {
                      if (isModule) {
                        addModuleToCanvas(item as typeof modules[0]);
                      } else {
                        // Add catalog item as furniture
                        const catalogItem = item as typeof catalogItems[0];
                        const id = `catalog-${catalogItem.id}-${Date.now()}`;
                        const width = catalogItem.dimensions?.width || 100;
                        const height = catalogItem.dimensions?.height || 50;
                        const depth = catalogItem.dimensions?.depth || 45;
                        
                        // Add to canvas if it exists
                        const canvas = fabricRef.current;
                        if (canvas) {
                          const { Rect } = await import("fabric");
                          const scale = getRoomScale();
                          const pixelWidth = width * scale;
                          const pixelHeight = height * scale;
                          
                          const rect = new Rect({
                            left: 200,
                            top: 200,
                            width: pixelWidth,
                            height: pixelHeight,
                            fill: "#3b82f6",
                            stroke: "#1e40af",
                            strokeWidth: 2,
                          });
                          (rect as any).id = id;
                          canvas.add(rect);
                          canvas.setActiveObject(rect);
                          canvas.renderAll();
                        }
                        
                        // Add to state
                        addCanvasObject({
                          id,
                          type: "rect",
                          furnitureType: "custom-rect",
                          name: catalogItem.name,
                          x: 200,
                          y: 200,
                          width,
                          height,
                          depth,
                          rotation: 0,
                          color: "#3b82f6",
                        });
                      }
                    }}
                    className="w-full p-3 bg-[var(--card)] border border-[var(--border)] rounded-lg hover:border-[var(--primary)] hover:shadow-md transition-all text-left group"
                  >
                    <div className="flex gap-3">
                      {imageUrl && (
                        <div className="w-20 h-20 rounded bg-[var(--muted)] overflow-hidden flex-shrink-0 relative">
                          <Image
                            src={imageUrl}
                            alt={item.name}
                            fill
                            className="object-cover group-hover:scale-110 transition-transform"
                            unoptimized
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm mb-1 truncate group-hover:text-[var(--primary)] transition-colors">
                          {item.name}
                        </h4>
                        <p className="text-xs text-[var(--muted-foreground)] line-clamp-2 mb-2">
                          {isModule ? item.description : (item as typeof catalogItems[0]).description}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[var(--primary)] text-sm">
                            {formatPrice(price, currency)}
                          </span>
                          {isModule && (
                            <span className="text-xs text-[var(--muted-foreground)]">
                              {(item as typeof modules[0]).dimensions.width}×
                              {(item as typeof modules[0]).dimensions.height}×
                              {(item as typeof modules[0]).dimensions.depth} {dimensionUnit}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Info */}
            <div className="mt-6 p-3 bg-[var(--muted)] rounded-lg border border-[var(--border)]">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-[var(--muted-foreground)] mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Click on an item to add it to your room design.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - 3D Room View (IKEA Style) */}
        <div className="flex-1 flex flex-col bg-[var(--muted)]">
          {/* Top Bar */}
          <div className="bg-[var(--background)] border-b border-[var(--border)] px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="p-1.5 hover:bg-[var(--muted)] rounded transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <Link
                href="/planners"
                className="px-3 py-1.5 text-sm font-medium bg-[var(--muted)] hover:bg-[var(--primary)]/10 rounded transition-colors"
              >
                <Layout className="w-4 h-4 inline mr-2" />
                3D Planners
              </Link>
              <button
                onClick={() => setShowRoomSetup(true)}
                className="px-3 py-1.5 text-sm font-medium bg-[var(--muted)] hover:bg-[var(--primary)]/10 rounded transition-colors"
              >
                <Home className="w-4 h-4 inline mr-2" />
                Room Setup
              </button>
              <input
                type="text"
                value={designName}
                onChange={(e) => setDesignName(e.target.value)}
                className="text-base font-semibold bg-transparent border-none focus:outline-none focus:bg-[var(--muted)] px-2 py-1 rounded"
              />
            </div>

            <div className="flex items-center gap-3">
              <button className="p-2 hover:bg-[var(--muted)] rounded transition-colors" title="Screenshot">
                <Camera className="w-5 h-5" />
              </button>
              <button className="p-2 hover:bg-[var(--muted)] rounded transition-colors" title="Save">
                <Save className="w-5 h-5" />
              </button>
              <Link
                href="/"
                className="p-2 hover:bg-[var(--muted)] rounded transition-colors"
              >
                <Home className="w-5 h-5" />
              </Link>
              <div className="px-4 py-2 bg-[var(--muted)] rounded">
                <span className="font-bold text-lg">{formatPrice(designTotal, admin?.currency || "USD")}</span>
              </div>
              <Button variant="outline" size="sm">
                Summary
                <ChevronDown className="w-4 h-4 ml-1" />
              </Button>
              <button className="p-2 hover:bg-[var(--muted)] rounded transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 3D View Area */}
          <div className="flex-1 relative">
            {activeTab === "3d" ? (
              <div className="w-full h-full relative">
                <Viewer3D 
                  objects={canvasObjects} 
                  viewMode={viewMode} 
                  roomSettings={roomSettings}
                  selectedFurnitureId={selectedFurnitureId}
                  onFurnitureSelect={setSelectedFurnitureId}
                />
                {/* Click outside to deselect */}
                <div 
                  className="absolute inset-0 -z-10"
                  onClick={() => setSelectedFurnitureId(null)}
                />
              </div>
            ) : (
              <div className="relative bg-gradient-to-br from-[var(--muted)] via-[var(--background)] to-[var(--muted)] h-full">
                <canvas
                  ref={canvasRef}
                  className="w-full h-full"
                />
                {canvasObjects.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="text-center animate-fade-in">
                      <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-[var(--primary)]/20 to-[var(--primary)]/5 rounded-2xl flex items-center justify-center">
                        <Home className="w-10 h-10 text-[var(--primary)] opacity-60" />
                      </div>
                      <p className="text-xl font-bold mb-2 bg-gradient-to-r from-[var(--foreground)] to-[var(--muted-foreground)] bg-clip-text text-transparent">
                        Design Your Room
                      </p>
                      <p className="text-sm text-[var(--muted-foreground)] mb-3">
                        Select the room outline to resize, then add furniture from the toolbar
                      </p>
                      <div className="mt-4 px-4 py-2 bg-[var(--primary)]/10 rounded-lg inline-block border border-[var(--primary)]/20">
                        <p className="text-xs font-semibold text-[var(--primary)]">
                          Room: {roomSettings.width}×{roomSettings.height} {dimensionUnit}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Zoom Controls */}
            {activeTab === "3d" && (
              <div className="absolute top-4 right-4 flex flex-col gap-2 bg-[var(--background)] border border-[var(--border)] rounded-lg p-1 shadow-lg">
                <button className="p-2 hover:bg-[var(--muted)] rounded transition-colors">
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button className="p-2 hover:bg-[var(--muted)] rounded transition-colors">
                  <ZoomOut className="w-4 h-4" />
                </button>
              </div>
            )}

          {/* Furniture Properties Panel */}
          {activeTab === "3d" && selectedFurnitureId && (
            <div className="absolute top-4 left-4 bg-[var(--background)] border border-[var(--border)] rounded-lg shadow-lg p-4 w-80 z-10">
              {(() => {
                const furniture = canvasObjects.find((obj) => obj.id === selectedFurnitureId);
                if (!furniture) return null;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg">{furniture.name}</h3>
                      <button
                        onClick={() => setSelectedFurnitureId(null)}
                        className="p-1 hover:bg-[var(--muted)] rounded transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                          Width ({dimensionUnit})
                        </label>
                        <input
                          type="number"
                          value={furniture.width}
                          onChange={(e) => {
                            const newWidth = parseFloat(e.target.value) || 0;
                            updateCanvasObject(furniture.id, { width: Math.max(10, newWidth) });
                          }}
                          className="w-full px-3 py-2 text-sm border-2 border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                          Height ({dimensionUnit})
                        </label>
                        <input
                          type="number"
                          value={furniture.height}
                          onChange={(e) => {
                            const newHeight = parseFloat(e.target.value) || 0;
                            updateCanvasObject(furniture.id, { height: Math.max(10, newHeight) });
                          }}
                          className="w-full px-3 py-2 text-sm border-2 border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                          Depth ({dimensionUnit})
                        </label>
                        <input
                          type="number"
                          value={furniture.depth}
                          onChange={(e) => {
                            const newDepth = parseFloat(e.target.value) || 0;
                            updateCanvasObject(furniture.id, { depth: Math.max(10, newDepth) });
                          }}
                          className="w-full px-3 py-2 text-sm border-2 border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                          Rotation (°)
                        </label>
                        <input
                          type="number"
                          value={furniture.rotation}
                          onChange={(e) => {
                            const newRotation = parseFloat(e.target.value) || 0;
                            updateCanvasObject(furniture.id, { rotation: newRotation % 360 });
                          }}
                          className="w-full px-3 py-2 text-sm border-2 border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          removeCanvasObject(furniture.id);
                          setSelectedFurnitureId(null);
                        }}
                        className="flex-1"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Remove
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newRotation = (furniture.rotation + 90) % 360;
                          updateCanvasObject(furniture.id, { rotation: newRotation });
                        }}
                        className="flex-1"
                      >
                        <RotateCw className="w-4 h-4 mr-2" />
                        Rotate
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* View Mode Switcher (Bottom) */}
          {activeTab === "3d" && (
            <div className="absolute bottom-0 left-0 right-0 bg-[var(--background)] border-t border-[var(--border)] px-6 py-3">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setViewMode("dollhouse")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    viewMode === "dollhouse"
                      ? "bg-[var(--primary)] text-white"
                      : "hover:bg-[var(--muted)]"
                  }`}
                >
                  <Home className="w-4 h-4 inline mr-2" />
                  Dollhouse
                </button>
                <button
                  onClick={() => setViewMode("top")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    viewMode === "top"
                      ? "bg-[var(--primary)] text-white"
                      : "hover:bg-[var(--muted)]"
                  }`}
                >
                  Top view
                </button>
                <button
                  onClick={() => setViewMode("side")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all hover:bg-[var(--muted)]`}
                >
                  Side views
                  <ChevronDown className="w-4 h-4 inline ml-1" />
                </button>
                <button className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-[var(--muted)] transition-all">
                  Move to
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Old Layout - Keep for 2D Editor */}
      {activeTab === "2d" && (
        <main className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Toolbar */}
          <div className="lg:col-span-1 space-y-4 animate-slide-in">
            {/* Room Settings - IKEA Style */}
            <Card className="shadow-xl border-2 border-[var(--border)] hover:border-[var(--primary)]/30 transition-all duration-300">
              <CardHeader className="pb-4 bg-gradient-to-r from-[var(--primary)]/10 to-transparent rounded-t-xl">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2 font-bold">
                    <Home className="w-5 h-5 text-[var(--primary)]" />
                    Room Settings
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowRoomSettings(!showRoomSettings)}
                    className="h-7 px-2"
                  >
                    {showRoomSettings ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div>
                  <p className="text-xs text-[var(--muted-foreground)] font-semibold uppercase tracking-wide mb-3">Room Templates</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.keys(roomTemplates).map((template) => (
                      <button
                        key={template}
                        onClick={() => applyRoomTemplate(template as keyof typeof roomTemplates)}
                        className={`px-3 py-2 text-xs rounded-lg border-2 transition-all font-medium ${
                          roomSettings.roomType === template
                            ? "border-[var(--primary)] bg-[var(--primary)]/10 font-semibold text-[var(--primary)]"
                            : "border-[var(--border)] hover:border-[var(--primary)]/50 hover:bg-[var(--primary)]/5"
                        }`}
                      >
                        {template.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
                      </button>
                    ))}
                  </div>
                </div>
                {showRoomSettings && (
                  <div className="pt-3 border-t border-[var(--border)] space-y-3 animate-fade-in">
                    <p className="text-xs text-[var(--muted-foreground)] font-semibold uppercase tracking-wide">Custom Dimensions</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                          Width ({dimensionUnit})
                        </label>
                        <input
                          type="number"
                          value={roomSettings.width}
                          onChange={(e) =>
                            setRoomSettings({ ...roomSettings, width: Math.max(100, parseFloat(e.target.value) || 100) })
                          }
                          min="100"
                          step="10"
                          className="w-full px-2 py-1.5 text-sm bg-[var(--background)] border-2 border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                          Height ({dimensionUnit})
                        </label>
                        <input
                          type="number"
                          value={roomSettings.height}
                          onChange={(e) =>
                            setRoomSettings({ ...roomSettings, height: Math.max(100, parseFloat(e.target.value) || 100) })
                          }
                          min="100"
                          step="10"
                          className="w-full px-2 py-1.5 text-sm bg-[var(--background)] border-2 border-[var(--border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)]"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)] mt-2">
                      💡 Drag the room outline on canvas to resize
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-xl border-2 border-[var(--border)] hover:border-[var(--primary)]/30 transition-all duration-300">
              <CardHeader className="pb-4 bg-gradient-to-r from-[var(--primary)]/5 to-transparent rounded-t-xl">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2 font-bold">
                    <Box className="w-5 h-5 text-[var(--primary)]" />
                    Design Tools
                  </span>
                  <button
                    onClick={() => setDimensionUnit(dimensionUnit === "cm" ? "in" : "cm")}
                    className="text-xs px-3 py-1.5 bg-gradient-to-r from-[var(--primary)]/10 to-[var(--primary)]/5 rounded-lg hover:from-[var(--primary)]/20 hover:to-[var(--primary)]/10 transition-all font-semibold border border-[var(--primary)]/20"
                    title={`Switch to ${dimensionUnit === "cm" ? "inches" : "centimeters"}`}
                  >
                    {dimensionUnit.toUpperCase()}
                  </button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-[var(--muted-foreground)] mb-3 font-semibold uppercase tracking-wide">Basic Shapes</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      onClick={addRectangle}
                      className="flex flex-col items-center py-5 h-auto border-2 hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all duration-200 hover:scale-105 active:scale-95 group"
                    >
                      <Square className="w-6 h-6 mb-2 group-hover:text-[var(--primary)] transition-colors" />
                      <span className="text-xs font-semibold">Rectangle</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={addCircle}
                      className="flex flex-col items-center py-5 h-auto border-2 hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all duration-200 hover:scale-105 active:scale-95 group"
                    >
                      <Circle className="w-6 h-6 mb-2 group-hover:text-[var(--primary)] transition-colors" />
                      <span className="text-xs font-semibold">Circle</span>
                    </Button>
                  </div>
                </div>

                <div className="border-t border-[var(--border)] pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-[var(--muted-foreground)] font-semibold uppercase tracking-wide">Modules</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowModules(!showModules)}
                      className="h-8 px-3 rounded-lg hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] transition-all"
                    >
                      {showModules ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    </Button>
                  </div>
                  {showModules && (
                    <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar animate-fade-in">
                      {modules.length === 0 ? (
                        <div className="text-center py-6">
                          <Package className="w-8 h-8 mx-auto mb-2 text-[var(--muted-foreground)] opacity-50" />
                          <p className="text-xs text-[var(--muted-foreground)]">No modules available</p>
                        </div>
                      ) : (
                        modules.map((module) => (
                          <button
                            key={module.id}
                            onClick={() => addModuleToCanvas(module)}
                            className="w-full p-3 bg-gradient-to-r from-[var(--muted)] to-[var(--background)] hover:from-[var(--primary)]/10 hover:to-[var(--primary)]/5 rounded-xl transition-all duration-200 text-left group border border-[var(--border)] hover:border-[var(--primary)]/30 hover:shadow-md"
                          >
                            <div className="flex items-start gap-3">
                              {module.imageUrl && (
                                <div className="w-12 h-12 rounded-lg bg-[var(--background)] overflow-hidden flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow border border-[var(--border)]">
                                  <Image
                                    src={module.imageUrl}
                                    alt={module.name}
                                    width={48}
                                    height={48}
                                    className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-200"
                                  />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold truncate group-hover:text-[var(--primary)] transition-colors">
                                  {module.name}
                                </p>
                                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                                  {module.dimensions.width}×{module.dimensions.height}×{module.dimensions.depth} {module.dimensions.unit}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-[var(--border)] pt-4">
                  <Button
                    variant="outline"
                    onClick={deleteSelected}
                    disabled={!selectedObject}
                    className="w-full text-red-500 hover:bg-gradient-to-r hover:from-red-50 hover:to-red-100 border-red-200 hover:border-red-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 font-semibold"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Selected
                  </Button>
                </div>

                {/* Color Picker */}
                {selectedObject && (
                  <div className="border-t border-[var(--border)] pt-4 animate-fade-in">
                    <p className="text-xs text-[var(--muted-foreground)] font-semibold uppercase tracking-wide mb-3">Color Palette</p>
                    <div className="grid grid-cols-5 gap-2.5">
                      {["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"].map(
                        (color) => (
                          <button
                            key={color}
                            onClick={() => handleColorChange(color)}
                            className="w-10 h-10 rounded-xl border-2 border-transparent hover:border-[var(--primary)] hover:scale-110 active:scale-95 transition-all duration-200 shadow-sm hover:shadow-md"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Materials */}
                <div className="border-t border-[var(--border)] pt-4">
                  <p className="text-xs text-[var(--muted-foreground)] font-semibold uppercase tracking-wide mb-3">Materials</p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {materials.slice(0, 6).map((material) => (
                      <button
                        key={material.id}
                        onClick={() => handleColorChange(material.colorCode)}
                        className="aspect-square rounded-xl border-2 border-transparent hover:border-[var(--primary)] hover:scale-110 active:scale-95 transition-all duration-200 shadow-sm hover:shadow-md"
                        style={{ backgroundColor: material.colorCode }}
                        title={material.name}
                      />
                    ))}
                  </div>
                  <Link href="/materials" className="block mt-3">
                    <Button variant="outline" size="sm" className="w-full hover:bg-[var(--primary)]/5 hover:border-[var(--primary)]/30 transition-all">
                      <Palette className="w-4 h-4 mr-2" />
                      More Materials
                    </Button>
                  </Link>
                </div>

                {/* Actions */}
                <div className="border-t border-[var(--border)] pt-4">
                  <Button
                    variant="outline"
                    onClick={clearCanvas}
                    className="w-full mb-3 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all duration-200 font-semibold"
                  >
                    <RotateCw className="w-4 h-4 mr-2" />
                    Clear All
                  </Button>
                  <Link href="/planners">
                    <Button className="w-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary)]/90 hover:from-[var(--primary)]/90 hover:to-[var(--primary)] shadow-md hover:shadow-lg transition-all duration-200 font-semibold">
                      Try in Planner
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Properties Panel */}
            {selectedObject && (
              <Card className="shadow-xl border-2 border-[var(--primary)]/20 animate-fade-in">
                <CardHeader className="pb-4 bg-gradient-to-r from-[var(--primary)]/10 to-transparent rounded-t-xl">
                  <CardTitle className="text-base flex items-center gap-2 font-bold">
                    {selectedObject.isRoomFloor || selectedObject.isRoomWall ? (
                      <>
                        <Home className="w-5 h-5 text-[var(--primary)]" />
                        Room Properties
                      </>
                    ) : (
                      <>
                        <Ruler className="w-5 h-5 text-[var(--primary)]" />
                        Object Properties
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Room Properties */}
                  {(selectedObject.isRoomFloor || selectedObject.isRoomWall) ? (
                    <>
                      <div className="p-3 bg-[var(--primary)]/5 rounded-lg border border-[var(--primary)]/20">
                        <p className="text-xs text-[var(--muted-foreground)] mb-2 font-medium">Room Dimensions</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                              Width ({dimensionUnit})
                            </label>
                            <input
                              type="number"
                              value={roomSettings.width}
                              onChange={(e) => {
                                const newWidth = parseFloat(e.target.value) || 0;
                                setRoomSettings({ ...roomSettings, width: Math.max(100, newWidth) });
                              }}
                              min="100"
                              step="10"
                              className="w-full px-2 py-2 text-sm bg-[var(--background)] border-2 border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-all font-medium"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                              Height ({dimensionUnit})
                            </label>
                            <input
                              type="number"
                              value={roomSettings.height}
                              onChange={(e) => {
                                const newHeight = parseFloat(e.target.value) || 0;
                                setRoomSettings({ ...roomSettings, height: Math.max(100, newHeight) });
                              }}
                              min="100"
                              step="10"
                              className="w-full px-2 py-2 text-sm bg-[var(--background)] border-2 border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-all font-medium"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-[var(--muted-foreground)] mt-3">
                          💡 Drag the room outline on canvas to resize, or use the inputs above
                        </p>
                      </div>
                      {selectedObject.isRoomWall && (
                        <div className="p-3 bg-[var(--muted)] rounded-lg">
                          <p className="text-xs font-semibold mb-2">Wall: {selectedObject.wallSide}</p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            Drag this wall to adjust room dimensions
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* Regular Object Properties */}
                      <div>
                        <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                          Name
                        </label>
                        <input
                          type="text"
                          value={canvasObjects.find((o) => o.id === selectedObject.id)?.name || ""}
                          onChange={(e) => {
                            const obj = canvasObjects.find((o) => o.id === selectedObject.id);
                            if (obj) {
                              updateCanvasObject(selectedObject.id, { name: e.target.value });
                            }
                          }}
                          className="w-full px-3 py-2.5 text-sm bg-[var(--background)] border-2 border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-all"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                            Width ({dimensionUnit})
                          </label>
                          <input
                            type="number"
                            value={canvasObjects.find((o) => o.id === selectedObject.id)?.width || 0}
                            onChange={(e) => handleDimensionChange("width", parseFloat(e.target.value) || 0)}
                            min="1"
                            step="0.1"
                            className="w-full px-2 py-2 text-sm bg-[var(--background)] border-2 border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-all font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                            Height ({dimensionUnit})
                          </label>
                          <input
                            type="number"
                            value={canvasObjects.find((o) => o.id === selectedObject.id)?.height || 0}
                            onChange={(e) => handleDimensionChange("height", parseFloat(e.target.value) || 0)}
                            min="1"
                            step="0.1"
                            className="w-full px-2 py-2 text-sm bg-[var(--background)] border-2 border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-all font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                            Depth ({dimensionUnit})
                          </label>
                          <input
                            type="number"
                            value={canvasObjects.find((o) => o.id === selectedObject.id)?.depth || 0}
                            onChange={(e) => handleDimensionChange("depth", parseFloat(e.target.value) || 0)}
                            min="1"
                            step="0.1"
                            className="w-full px-2 py-2 text-sm bg-[var(--background)] border-2 border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-[var(--primary)] transition-all font-medium"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                        Position X
                      </label>
                      <input
                        type="number"
                        value={Math.round(selectedObject.left || 0)}
                        readOnly
                        className="w-full px-2 py-1.5 text-sm bg-[var(--muted)] border border-[var(--border)] rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)] mb-1 block font-medium">
                        Position Y
                      </label>
                      <input
                        type="number"
                        value={Math.round(selectedObject.top || 0)}
                        readOnly
                        className="w-full px-2 py-1.5 text-sm bg-[var(--muted)] border border-[var(--border)] rounded-lg"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Canvas / 3D Viewer */}
          <div className="lg:col-span-3 animate-fade-in">
            <Card className="overflow-hidden shadow-2xl border-2 border-[var(--border)] hover:border-[var(--primary)]/30 transition-all duration-300">
              <CardContent className="p-0">
                {activeTab === "2d" ? (
                  <div className="relative bg-gradient-to-br from-[var(--muted)] via-[var(--background)] to-[var(--muted)]">
                    <canvas
                      ref={canvasRef}
                      className="w-full cursor-crosshair"
                      style={{ maxHeight: "700px", minHeight: "600px" }}
                    />
                    {canvasObjects.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <div className="text-center animate-fade-in">
                          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-[var(--primary)]/20 to-[var(--primary)]/5 rounded-2xl flex items-center justify-center">
                            <Home className="w-10 h-10 text-[var(--primary)] opacity-60" />
                          </div>
                          <p className="text-xl font-bold mb-2 bg-gradient-to-r from-[var(--foreground)] to-[var(--muted-foreground)] bg-clip-text text-transparent">
                            Design Your Room
                          </p>
                          <p className="text-sm text-[var(--muted-foreground)] mb-3">
                            Select the room outline to resize, then add furniture from the toolbar
                          </p>
                          <div className="mt-4 px-4 py-2 bg-[var(--primary)]/10 rounded-lg inline-block border border-[var(--primary)]/20">
                            <p className="text-xs font-semibold text-[var(--primary)]">
                              Room: {roomSettings.width}×{roomSettings.height} {dimensionUnit}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-[700px] bg-gradient-to-br from-[var(--muted)] via-[var(--background)] to-[var(--muted)]">
                    <Viewer3D objects={canvasObjects} viewMode={viewMode} roomSettings={roomSettings} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Canvas Info Bar */}
            {canvasObjects.length > 0 && (
              <Card className="mt-4 shadow-lg border-2 border-[var(--border)] animate-fade-in">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[var(--muted)] to-[var(--background)] rounded-xl border border-[var(--border)] shadow-sm">
                        <Layers className="w-5 h-5 text-[var(--primary)]" />
                        <span className="font-semibold">
                          {canvasObjects.length} {canvasObjects.length === 1 ? "object" : "objects"}
                        </span>
                      </div>
                      {selectedObject && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[var(--primary)]/15 to-[var(--primary)]/5 rounded-xl border border-[var(--primary)]/20 shadow-sm">
                          <Package className="w-5 h-5 text-[var(--primary)]" />
                          <span className="font-semibold text-[var(--primary)]">
                            {canvasObjects.find((o) => o.id === selectedObject.id)?.name || "Selected"}
                          </span>
                        </div>
                      )}
                    </div>
                    {selectedObject && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const canvas = fabricRef.current;
                          if (canvas) {
                            canvas.discardActiveObject();
                            canvas.renderAll();
                            setSelectedObject(null);
                          }
                        }}
                        className="hover:bg-gradient-to-r hover:from-red-50 hover:to-red-100 hover:text-red-600 hover:border-red-200 border transition-all duration-200 font-semibold"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Deselect
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
      )}

      {/* AI Chat */}
      <AIChat
        onAction={handleAIAction}
        currentObjects={canvasObjects}
        dimensionUnit={dimensionUnit}
        adminSlug={admin?.slug ?? "demo"}
      />
    </div>
  );
}
