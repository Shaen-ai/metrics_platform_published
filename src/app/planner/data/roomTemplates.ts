import { Room } from "../types";
import { v4 as uuidv4 } from "uuid";

export interface RoomTemplate {
  id: string;
  name: string;
  description: string;
  room: Room;
  thumbnail?: string;
  plannerTypes?: string[];
}

export const roomTemplates: RoomTemplate[] = [
  // ── Living Room ─────────────────────────────────────────
  {
    id: "living-room-1",
    name: "Living Room - Front Door",
    description: "Standard living room with front door and window",
    plannerTypes: ["room", "living-room"],
    room: {
      width: 6,
      depth: 5,
      height: 2.8,
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: -0.3, width: 0.9 },
        { id: uuidv4(), type: "window", wall: "back", position: 0, width: 2.0 },
      ],
    },
  },
  {
    id: "living-room-2",
    name: "Living Room - Open Plan",
    description: "Large living room with double windows",
    plannerTypes: ["room", "living-room"],
    room: {
      width: 7,
      depth: 5.5,
      height: 2.8,
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: -0.4, width: 1.2 },
        { id: uuidv4(), type: "window", wall: "back", position: -0.3, width: 1.5 },
        { id: uuidv4(), type: "window", wall: "back", position: 0.3, width: 1.5 },
        { id: uuidv4(), type: "window", wall: "right", position: 0, width: 1.2 },
      ],
    },
  },

  // ── Bedroom ─────────────────────────────────────────────
  {
    id: "bedroom-1",
    name: "Bedroom - Corner Window",
    description: "Bedroom with window on side wall",
    plannerTypes: ["room", "bedroom"],
    room: {
      width: 4.5,
      depth: 4,
      height: 2.8,
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: 0.4, width: 0.9 },
        { id: uuidv4(), type: "window", wall: "right", position: 0, width: 1.5 },
      ],
    },
  },
  {
    id: "bedroom-2",
    name: "Master Bedroom",
    description: "Spacious master bedroom with en-suite door",
    plannerTypes: ["room", "bedroom"],
    room: {
      width: 5.5,
      depth: 5,
      height: 2.8,
      floorStyle: "laminate-honey-oak",
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: 0.4, width: 0.9 },
        { id: uuidv4(), type: "door", wall: "left", position: -0.3, width: 0.8 },
        { id: uuidv4(), type: "window", wall: "back", position: 0, width: 2.0 },
      ],
    },
  },
  {
    id: "bedroom-3",
    name: "Kids Bedroom",
    description: "Small bedroom for children",
    plannerTypes: ["room", "bedroom", "children"],
    room: {
      width: 3.5,
      depth: 3.5,
      height: 2.8,
      floorStyle: "laminate-light-oak",
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: 0.3, width: 0.8 },
        { id: uuidv4(), type: "window", wall: "back", position: 0, width: 1.2 },
      ],
    },
  },

  // ── Kitchen ─────────────────────────────────────────────
  {
    id: "kitchen-1",
    name: "Kitchen - Double Windows",
    description: "Kitchen with windows on back wall",
    plannerTypes: ["room", "kitchen"],
    room: {
      width: 5,
      depth: 4,
      height: 2.8,
      openings: [
        { id: uuidv4(), type: "door", wall: "left", position: 0, width: 0.9 },
        { id: uuidv4(), type: "window", wall: "back", position: -0.4, width: 1.2 },
        { id: uuidv4(), type: "window", wall: "back", position: 0.4, width: 1.2 },
      ],
    },
  },
  {
    id: "kitchen-2",
    name: "Galley Kitchen",
    description: "Narrow galley-style kitchen",
    plannerTypes: ["room", "kitchen"],
    room: {
      width: 3,
      depth: 5,
      height: 2.8,
      floorStyle: "laminate-light-oak",
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: 0, width: 0.9 },
        { id: uuidv4(), type: "window", wall: "back", position: 0, width: 1.0 },
      ],
    },
  },
  {
    id: "kitchen-3",
    name: "L-Shape Kitchen",
    description: "Spacious L-shaped kitchen with island space",
    plannerTypes: ["room", "kitchen"],
    room: {
      width: 5.5,
      depth: 5,
      height: 2.8,
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: -0.4, width: 1.0 },
        { id: uuidv4(), type: "window", wall: "back", position: 0, width: 2.0 },
        { id: uuidv4(), type: "window", wall: "right", position: 0.2, width: 1.2 },
      ],
    },
  },

  // ── Bathroom ────────────────────────────────────────────
  {
    id: "bathroom-1",
    name: "Small Bathroom",
    description: "Compact bathroom with shower",
    plannerTypes: ["room", "bathroom"],
    room: {
      width: 2.5,
      depth: 3,
      height: 2.8,
      floorStyle: "laminate-whitewashed",
      wallColor: "#f0f4f8",
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: 0.3, width: 0.7 },
      ],
    },
  },
  {
    id: "bathroom-2",
    name: "Family Bathroom",
    description: "Full bathroom with bathtub and separate shower",
    plannerTypes: ["room", "bathroom"],
    room: {
      width: 3.5,
      depth: 3.5,
      height: 2.8,
      floorStyle: "laminate-whitewashed",
      wallColor: "#f0f4f8",
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: 0.3, width: 0.8 },
      ],
    },
  },
  {
    id: "bathroom-3",
    name: "En-Suite Bathroom",
    description: "Narrow en-suite attached to bedroom",
    plannerTypes: ["room", "bathroom"],
    room: {
      width: 2,
      depth: 3.5,
      height: 2.8,
      floorStyle: "laminate-gray-ash",
      wallColor: "#eef2f7",
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: 0, width: 0.7 },
      ],
    },
  },

  // ── Office ──────────────────────────────────────────────
  {
    id: "office-1",
    name: "Office - Side Door",
    description: "Office with door on side wall",
    plannerTypes: ["room", "office"],
    room: {
      width: 4,
      depth: 3.5,
      height: 2.8,
      openings: [
        { id: uuidv4(), type: "door", wall: "right", position: -0.3, width: 0.9 },
        { id: uuidv4(), type: "window", wall: "front", position: 0, width: 1.8 },
      ],
    },
  },
  {
    id: "office-2",
    name: "Home Office",
    description: "Compact home office corner",
    plannerTypes: ["room", "office"],
    room: {
      width: 3,
      depth: 3,
      height: 2.8,
      floorStyle: "laminate-gray-ash",
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: 0.3, width: 0.8 },
        { id: uuidv4(), type: "window", wall: "left", position: 0, width: 1.2 },
      ],
    },
  },

  // ── Dining Room ─────────────────────────────────────────
  {
    id: "dining-1",
    name: "Dining Room - Classic",
    description: "Traditional dining room with bay window",
    plannerTypes: ["room", "dining-room"],
    room: {
      width: 5,
      depth: 4.5,
      height: 2.8,
      floorStyle: "laminate-walnut",
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: -0.4, width: 0.9 },
        { id: uuidv4(), type: "window", wall: "right", position: 0, width: 1.8 },
      ],
    },
  },
  {
    id: "dining-2",
    name: "Open Dining Area",
    description: "Dining area attached to kitchen",
    plannerTypes: ["room", "dining-room", "kitchen"],
    room: {
      width: 4,
      depth: 4,
      height: 2.8,
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: 0, width: 1.4 },
        { id: uuidv4(), type: "window", wall: "back", position: 0, width: 1.5 },
      ],
    },
  },

  // ── Hallway ─────────────────────────────────────────────
  {
    id: "hallway-1",
    name: "Entryway",
    description: "Standard entryway with front door",
    plannerTypes: ["room", "hallway"],
    room: {
      width: 3,
      depth: 5,
      height: 2.8,
      floorStyle: "laminate-dark-brown",
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: 0, width: 1.0 },
        { id: uuidv4(), type: "door", wall: "back", position: 0, width: 0.9 },
      ],
    },
  },
  {
    id: "hallway-2",
    name: "L-Shaped Hallway",
    description: "Hallway with multiple room doors",
    plannerTypes: ["room", "hallway"],
    room: {
      width: 2.5,
      depth: 6,
      height: 2.8,
      floorStyle: "laminate-natural-oak",
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: 0, width: 0.9 },
        { id: uuidv4(), type: "door", wall: "left", position: -0.2, width: 0.8 },
        { id: uuidv4(), type: "door", wall: "right", position: 0.2, width: 0.8 },
        { id: uuidv4(), type: "door", wall: "back", position: 0, width: 0.8 },
      ],
    },
  },

  // ── Children's Room ─────────────────────────────────────
  {
    id: "children-1",
    name: "Playroom",
    description: "Spacious playroom for children",
    plannerTypes: ["room", "children"],
    room: {
      width: 5,
      depth: 4,
      height: 2.8,
      floorStyle: "laminate-light-oak",
      openings: [
        { id: uuidv4(), type: "door", wall: "front", position: 0.4, width: 0.8 },
        { id: uuidv4(), type: "window", wall: "back", position: 0, width: 1.5 },
      ],
    },
  },

  // ── Custom ──────────────────────────────────────────────
  {
    id: "custom",
    name: "Custom Room",
    description: "Design your own room layout",
    room: {
      width: 6,
      depth: 5,
      height: 2.8,
      openings: [],
    },
  },
];
